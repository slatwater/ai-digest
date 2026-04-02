import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { v4 as uuidv4 } from 'uuid';
import { TriageBatch, TriageEntry, TriageVerdict, TriageRelation, TriageScores, TriageConcept } from './types';
import { safeScrape, safeParseJSON, stripCodeFence } from './agent';
import { getEntries, saveTriageBatch } from './storage';

// 活跃的 batch
const activeBatches = new Map<string, TriageBatch>();

// 30 分钟后自动清除
const BATCH_TTL = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, batch] of activeBatches) {
    if (now - new Date(batch.createdAt).getTime() > BATCH_TTL) {
      activeBatches.delete(id);
      console.warn(`[triage] batch ${id} 超时清理`);
    }
  }
}, 60 * 1000);

// 构建知识库摘要上下文
async function buildKnowledgeContext(): Promise<string> {
  const entries = await getEntries();
  const recent = entries.slice(0, 30);
  if (recent.length === 0) return '（知识库为空）';
  return recent.map(e =>
    `- [${e.id}] ${e.title}: ${e.tldr || '无摘要'} (tags: ${e.tags.join(', ') || '无'})`
  ).join('\n');
}

// 系统提示词：知识点提取 + 溯源模式
const TRIAGE_SYSTEM_PROMPT = `你是用户的技术侦察员。用户给你的大多是 AI 相关的二手推文链接。

你的核心任务不是研究这篇文章，而是**把文章里涉及的技术点、知识点、概念抽象出来，追溯到源头，搞清楚根本**。文章只是入口，你要穿透它。

## 工作流程

### 第一步：提取知识点
读完文章后，识别其中涉及的核心技术概念/知识点。不是提取文章观点，而是找到文章背后的**技术实体**。

比如一篇推文说"XX 公司发布了一个超快的推理框架"，你要提取的不是"XX 公司发布了什么"，而是：
- 这个推理框架用了什么技术（比如 speculative decoding、KV cache 优化、量化方案…）
- 这些技术各自的根本原理是什么

每篇文章提取 1-3 个核心概念，抓重点不铺量。

### 第二步：溯源挖掘
对每个提取出的概念，用 WebSearch 和 WebFetch 去追根溯源：
- 这个概念根本上是什么？从哪来的？基于什么原理？
- 人拿到它能做什么、造什么？有什么具体的生产场景？
- 它解决了什么之前不好解决的问题？

不要停留在名词解释层面。你要搞到"我能跟别人讲清楚这个东西"的程度。

### 第三步：整体判断
在理解了底层知识点之后，用大白话说清楚这些概念组合起来意味着什么。像一个懂行的朋友跟用户聊天：
- 直接说名字，不用"该项目""该技术"
- 说这些知识点串在一起说明了什么趋势/可能性
- 研究中发现的有趣细节、意外、或者坑也说出来

### 第四步：四维度打分
对这篇文章涉及的核心技术打分，每项 1-5 分：

- **novelty**（新颖度）：1=旧概念换皮 2=小改进 3=有新意 4=显著创新 5=范式转换
- **usability**（就绪度）：1=纯概念 2=有原型 3=可试用 4=生产可用 5=成熟稳定
- **leverage**（杠杆率）：1=可有可无 2=省点时间 3=明显提效 4=解锁新能力 5=颠覆工作方式
- **timing**（时机）：1=太早了 2=概念验证期 3=早期可上 4=该关注了 5=再不看就晚了

### 第五步：给 verdict
- **deep-dive**: 四项中至少两项 ≥4，且没有任何一项 =1。值得花时间深入。
- **save**: 有亮点但不紧急，或某个维度强但整体还不够。留个底。
- **skip**: 多数维度 ≤2，或是旧概念换皮 / 纯营销 / 内容空洞。

## 用户知识库（参考用，不是主要判断依据）
知识库覆盖率不影响 verdict。全新方向如果四维度得分高，仍应给 deep-dive。

## 输出格式

===TRIAGE_START===
{
  "title": "核心技术/项目名（中文）",
  "concepts": [
    {
      "name": "概念名",
      "root": "这个概念根本上是什么、从哪来的（2-3句话溯源）",
      "whatItEnables": "拿到它能做什么、造什么（具体场景）"
    }
  ],
  "explanation": "整体理解：这些概念串在一起意味着什么（3-5句大白话）",
  "scores": { "novelty": 1-5, "usability": 1-5, "leverage": 1-5, "timing": 1-5 },
  "verdict": "skip|save|deep-dive",
  "verdictReason": "一句话理由",
  "relatedEntries": [{"id": "条目ID", "title": "条目标题", "overlap": "关系"}]
}
===TRIAGE_END===

## 重要
- title 是底层技术名，不是文章标题
- concepts 是你从文章中抽象出的知识点，不是文章的段落摘要
- root 要溯源到根本原理，不是名词解释
- explanation 是你理解后的整体判断，不是文章摘要。禁止抄原文
- 一定要用工具追溯一手信息
- 知识库为空时 relatedEntries 写 []
- 不要输出标记以外的内容`;

// 从 SDK 消息中提取文本
function extractText(message: SDKMessage): string | null {
  if (message.type === 'assistant') {
    const blocks = message.message?.content;
    if (Array.isArray(blocks)) {
      return blocks
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { type: string; text?: string }) => b.text ?? '')
        .join('');
    }
  }
  if (message.type === 'result' && message.subtype === 'success') {
    return message.result;
  }
  return null;
}

// 解析 triage 输出
interface TriageOutput {
  title: string;
  concepts: TriageConcept[];
  explanation: string;
  scores: TriageScores;
  verdict: TriageVerdict;
  verdictReason: string;
  relatedEntries: TriageRelation[];
}

function parseTriageOutput(fullText: string): TriageOutput | null {
  // 方式 1：标记匹配
  const match = fullText.match(/===TRIAGE_START===([\s\S]*?)===TRIAGE_END===/);
  if (match) {
    const result = safeParseJSON<TriageOutput>(match[1], 'triage');
    if (result) return result;
  }

  // 方式 2：尝试从全文中找 JSON 对象（Agent 可能省略了标记）
  const jsonMatch = fullText.match(/\{[\s\S]*"verdict"[\s\S]*"explanation"[\s\S]*\}/);
  if (jsonMatch) {
    const result = safeParseJSON<TriageOutput>(jsonMatch[0], 'triage-fallback');
    if (result) return result;
  }

  // 方式 3：去掉 markdown 围栏再试
  const stripped = stripCodeFence(fullText);
  if (stripped.startsWith('{')) {
    const result = safeParseJSON<TriageOutput>(stripped, 'triage-stripped');
    if (result) return result;
  }

  console.warn('[triage] 解析失败，输出前 500 字:', fullText.slice(0, 500));
  return null;
}

// 处理单条 URL
async function processOne(entry: TriageEntry, knowledgeContext: string): Promise<void> {
  entry.status = 'processing';

  try {
    // 统一用 safeScrape 抓取（scrape.py 内部对 X/Twitter 自动走 StealthyFetcher）
    const scraped = await safeScrape(entry.url);
    const scrapeResult = safeParseJSON<{ status?: string; content?: string; title?: string }>(scraped, 'scrape') || {};
    const scrapeFailed = !scrapeResult.content || scrapeResult.status === 'error' || (scrapeResult.content.length < 200);

    // 工具始终开启，Agent 需要主动去查一手资料
    const allowedTools = ['WebFetch', 'WebSearch'];
    const maxTurns = 15;

    const userPrompt = scrapeFailed
      ? `请研究这个链接讨论的技术：

## URL
${entry.url}

## 抓取状态
直接抓取失败。请先用 WebFetch 获取该 URL，失败则用 WebSearch 搜索。获取到内容后，按工作流程深入研究底层技术。

## 用户知识库（参考）
${knowledgeContext}

研究完成后，按系统提示要求输出 JSON。`
      : `请研究这个链接讨论的技术：

## URL
${entry.url}

## 抓取内容（仅供参考，你需要进一步研究底层技术）
${scraped.slice(0, 12000)}

## 用户知识库（参考）
${knowledgeContext}

这是二手推文的抓取内容，不要只看这篇文章就下结论。请用 WebSearch/WebFetch 找到底层技术的一手信息（官方仓库、文档、论文等），搞清楚后再输出 JSON。`;

    let fullText = '';

    const q = query({
      prompt: userPrompt,
      options: {
        systemPrompt: TRIAGE_SYSTEM_PROMPT,
        cwd: process.cwd(),
        allowedTools,
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        maxTurns,
        abortController: new AbortController(),
        persistSession: false,
      },
    });

    for await (const message of q) {
      const text = extractText(message);
      if (text) fullText += text;
    }

    // 解析输出
    const result = parseTriageOutput(fullText);
    if (result) {
      entry.title = result.title || entry.url;
      entry.verdict = result.verdict;
      entry.concepts = result.concepts || [];
      entry.explanation = result.explanation;
      entry.scores = result.scores ? {
        novelty: Math.min(5, Math.max(1, Math.round(Number(result.scores.novelty)))),
        usability: Math.min(5, Math.max(1, Math.round(Number(result.scores.usability)))),
        leverage: Math.min(5, Math.max(1, Math.round(Number(result.scores.leverage)))),
        timing: Math.min(5, Math.max(1, Math.round(Number(result.scores.timing)))),
      } : undefined;
      entry.verdictReason = result.verdictReason;
      entry.relatedEntries = result.relatedEntries || [];
      entry.status = 'done';
    } else {
      entry.status = 'error';
      entry.error = '无法解析研判结果';
    }
  } catch (err) {
    entry.status = 'error';
    entry.error = err instanceof Error ? err.message : String(err);
  }
}

// 后台串行处理 batch
async function processBatch(batch: TriageBatch): Promise<void> {
  const knowledgeContext = await buildKnowledgeContext();

  for (const entry of batch.entries) {
    await processOne(entry, knowledgeContext);
    // 每完成一条，持久化
    await saveTriageBatch(batch);
  }

  batch.status = 'done';
  await saveTriageBatch(batch);
}

// 创建 batch 并启动后台处理
export function createBatch(urls: string[]): TriageBatch {
  const batch: TriageBatch = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    status: 'processing',
    entries: urls.map(url => ({
      id: uuidv4(),
      url,
      title: url,
      status: 'pending' as const,
    })),
  };

  activeBatches.set(batch.id, batch);

  // 后台处理，不 await
  processBatch(batch).catch(err => {
    console.error(`[triage] batch ${batch.id} 处理失败:`, err);
    batch.status = 'done';
  });

  return batch;
}

// 获取 batch
export function getBatch(batchId: string): TriageBatch | null {
  return activeBatches.get(batchId) ?? null;
}

// 删除 batch
export function deleteBatch(batchId: string): boolean {
  return activeBatches.delete(batchId);
}
