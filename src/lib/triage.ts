import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { v4 as uuidv4 } from 'uuid';
import { TriageBatch, TriageEntry, TriageVerdict, TriageRelation, TriageScores, TriageConcept } from './types';
import { safeScrape, safeParseJSON, stripCodeFence } from './agent';
import { getEntries, saveTriageBatch, getWikiEntries } from './storage';
import { reportFromSDKMessage } from './token-report';

// 从文本中提取有价值的 URL（GitHub、arXiv、官方文档等），去重后返回
const SOURCE_URL_PATTERN = /https?:\/\/(?:github\.com|arxiv\.org|huggingface\.co|openai\.com|anthropic\.com|deepmind\.google|ai\.meta\.com|proceedings\.mlr\.press|aclanthology\.org|papers\.nips\.cc|doi\.org|scholar\.google)[^\s"'<>)\]，。）]+/gi;

function extractUrls(content: string): string[] {
  const matches = content.match(SOURCE_URL_PATTERN) || [];
  // 去重，去尾部标点，最多 5 条
  return [...new Set(matches.map(u => u.replace(/[.,;:!?)}\]]+$/, '')))].slice(0, 5);
}

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

// 构建知识库 + Wiki 上下文
async function buildKnowledgeContext(): Promise<{ entriesCtx: string; wikiCtx: string }> {
  const entries = await getEntries();
  const recent = entries.slice(0, 30);
  const entriesCtx = recent.length === 0
    ? '（知识库为空）'
    : recent.map(e => `- [${e.id}] ${e.title}: ${e.tldr || '无摘要'} (tags: ${e.tags.join(', ') || '无'})`).join('\n');

  let wikiCtx = '（Wiki 为空）';
  try {
    const wikiEntries = await getWikiEntries();
    if (wikiEntries.length > 0) {
      wikiCtx = wikiEntries.map(w => {
        const names = [w.name, ...(w.aliases || [])].join(' / ');
        return `- [${w.id}] ${names} (${w.domain}): ${w.summary}`;
      }).join('\n');
    }
  } catch { /* ignore */ }

  return { entriesCtx, wikiCtx };
}

// 系统提示词：具名技术识别 + Wiki 匹配 + 组合分析
function buildTriagePrompt(wikiCtx: string): string {
  return `你是用户的技术侦察员。用户给你的大多是 AI 相关的链接（可能是二手推文）。

你的核心任务是**识别文章涉及了哪些具名技术，判断哪些是知识库已有的、哪些是新的，以及它们如何组合**。

## 什么是"具名技术"
有明确名称、可查证来源的技术/方法/算法/框架。例如：
- KV Cache（Vaswani et al., 2017）
- LoRA（Hu et al., 2021）
- Speculative Decoding（Leviathan et al., 2023）
- vLLM（开源项目）

不是具名技术的：文章观点、公司动态、模糊描述（如"一种优化方法"）。

## 工作流程

### 第一步：采集 + 溯源
读取文章内容。如果是二手转载，用 WebSearch/WebFetch 找到一手来源。

### 第二步：识别具名技术
找出文章涉及的具名技术，每个必须：
- 有公认名称（不是你起的名字）
- 有可查证的来源（论文/项目/作者）
- 用 WebSearch 确认其存在和来源

每篇文章识别 1-3 个核心技术，宁少勿滥。

### 第三步：匹配 Wiki + 增量评估
对比下方的已有 Wiki 列表。**如果 Wiki 中已有含义相同的技术（即使名称写法不同），必须标记为 isKnown=true 并填写 wikiId，禁止创建重复词条。**

对于已知技术（isKnown=true），还需要判断本文提供了什么新信息：
- 新实验数据/benchmark → delta 写具体数据
- 新应用场景/用法 → delta 写新场景
- 新机制/新发现 → delta 写新发现
- 无任何新信息（纯复述）→ delta 留空字符串

${wikiCtx ? `## 已有 Wiki\n${wikiCtx}` : '## 已有 Wiki\n（Wiki 为空，所有技术都是新的）'}

### 第四步：组合分析
这篇文章如何组合上述技术？组合方式是否新颖？能解决什么实际问题？

### 第五步：增量统计 + verdict
客观统计 delta，然后给 verdict：

verdict 规则：
- **deep-dive**: 有 Wiki 中不存在的新技术，或已知技术有重要新发现（新数据/新场景/新机制，即 knownWithDelta > 0 且增量重要），或组合方式有实际创新
- **save**: 技术已知且增量较小（补充验证、次要应用场景），或组合有参考价值
- **skip**: 全部已知 + 无增量（knownWithDelta=0）+ 组合也已知 / 纯营销 / 内容空洞

## 输出格式

===TRIAGE_START===
{
  "title": "核心技术/项目名（中文）",
  "concepts": [
    {
      "name": "技术的公认名称",
      "isKnown": false,
      "wikiId": "匹配到的 Wiki 词条 id（已知时必填，新技术留空）",
      "root": "来源（论文/作者/年份）→ 一句话核心原理",
      "whatItEnables": "一句话：能做什么",
      "sourceUrl": "一手来源 URL",
      "delta": "本文对该已知技术的新增量（已知技术必填，新技术留空）"
    }
  ],
  "narrative": "连贯的技术叙述（见下方规则）",
  "delta": {
    "newCount": 0,
    "knownCount": 0,
    "knownWithDelta": 0,
    "compositionNew": true,
    "gap": "填补知识库什么空白（一句话）"
  },
  "verdict": "skip|save|deep-dive",
  "verdictReason": "一句话理由",
  "relatedEntries": [{"id": "条目ID", "title": "条目标题", "overlap": "关系"}]
}
===TRIAGE_END===

## narrative 规则
narrative 必须基于溯源到的一手来源（论文/官方文档）来写，不是复述用户粘贴的链接文章。

narrative 分三段，每段用 \n\n 分隔：

第一段「是什么」：一句话说清楚核心技术是什么、谁提出的。技术名用 [[]] 标记。
第二段「怎么做」：2-3 句话讲方法原理，用简短句子，每句不超过 25 字。
第三段「效果」：1-2 句话讲实际效果或意义。

写作规则：
- 每句话只讲一件事，不要在一句话里塞多个信息
- 技术名标记放在句子自然的名词位置，不要打断句子结构
- 用大白话，假设读者不是技术专家
- 基于论文/文档的事实写，不要复述二手推文的表达

技术名标记格式：
- 新技术：[[技术名|new]]
- 已知技术：[[技术名|known:wiki-id]]

示例：
"[[SSD|new]]（Simple Self-Distillation）是 Apple Research 提出的模型自我改进方法。\n\n它的做法很简单：让模型自己生成一批代码，然后直接拿这些输出当训练数据做 SFT，不需要外部教师模型。这个方法建立在 [[Knowledge Distillation|new]] 的基础上，但去掉了教师-学生的两阶段流程。\n\n实测在 Qwen3-30B 上，代码生成准确率从 42.4% 提升到 55.3%，且在多种模型规模上普遍有效。"

## 重要
- concepts 中的 name 必须是公认名称，不是你自创的概念名
- isKnown 严格基于 Wiki 列表判断：名称或别名匹配 → true，否则 → false
- 同一技术在 Wiki 中已有时，必须复用其 id，禁止重复创建
- narrative 必须用 \n\n 分段，不要写成一整段
- narrative 中每个技术名必须用 [[]] 标记，且和 concepts 数组一一对应
- 不要输出标记以外的内容`;
}

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
  narrative?: string;
  composition?: string;
  solves?: string;
  delta?: { newCount: number; knownCount: number; compositionNew: boolean; gap: string };
  explanation?: string;
  scores?: { novelty: number; usability: number; leverage: number; timing: number };
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

  // 方式 2：尝试从全文中找包含 verdict 的 JSON 对象（宽松匹配字段顺序）
  const jsonMatch = fullText.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
  if (jsonMatch) {
    const result = safeParseJSON<TriageOutput>(jsonMatch[0], 'triage-fallback');
    if (result?.verdict) return result;
  }

  // 方式 3：去掉 markdown 围栏再试
  const stripped = stripCodeFence(fullText);
  if (stripped.startsWith('{')) {
    const result = safeParseJSON<TriageOutput>(stripped, 'triage-stripped');
    if (result?.verdict) return result;
  }

  // 方式 4：提取最后一个完整 JSON 块（Agent 可能在 JSON 前后输出了其他文本）
  const allJsonBlocks = [...fullText.matchAll(/```(?:json)?\s*\n(\{[\s\S]*?\})\s*\n```/g)];
  if (allJsonBlocks.length > 0) {
    const lastBlock = allJsonBlocks[allJsonBlocks.length - 1][1];
    const result = safeParseJSON<TriageOutput>(lastBlock, 'triage-codeblock');
    if (result?.verdict) return result;
  }

  console.warn('[triage] 解析失败，输出全文长度:', fullText.length, '| 前 1000 字:', fullText.slice(0, 1000));
  return null;
}

// 处理单条 URL
async function processOne(entry: TriageEntry, knowledgeContext: { entriesCtx: string; wikiCtx: string }): Promise<void> {
  entry.status = 'processing';

  try {
    // 统一用 safeScrape 抓取（scrape.py 内部对 X/Twitter 自动走 StealthyFetcher）
    const scraped = await safeScrape(entry.url);
    const scrapeResult = safeParseJSON<{ status?: string; content?: string; title?: string }>(scraped, 'scrape') || {};
    const scrapeFailed = !scrapeResult.content || scrapeResult.status === 'error' || (scrapeResult.content.length < 200);

    // 从抓取内容中预提取 URL，给 Agent 捷径
    const extractedUrls = scrapeFailed ? [] : extractUrls(scrapeResult.content || '');
    const urlsSection = extractedUrls.length > 0
      ? `\n## 文中提及的链接（可直接 WebFetch）\n${extractedUrls.map(u => `- ${u}`).join('\n')}\n`
      : '';

    // 工具始终开启，Agent 需要主动去查一手资料
    const allowedTools = ['WebFetch', 'WebSearch'];
    const maxTurns = 18;

    const userPrompt = scrapeFailed
      ? `请研究这个链接讨论的技术：

## URL
${entry.url}

## 抓取状态
直接抓取失败。请先用 WebFetch 获取该 URL，失败则用 WebSearch 搜索。获取到内容后，按工作流程拆解底层技术。

## 用户知识库条目（参考）
${knowledgeContext.entriesCtx}

研究完成后，按系统提示要求输出 JSON。每个 concept 必须附带你通过工具查到的 sourceUrl。`
      : `请研究这个链接讨论的技术：

## URL
${entry.url}

## 抓取内容（仅供参考，你需要穿透到底层技术）
${scraped.slice(0, 6000)}
${urlsSection}
## 用户知识库条目（参考）
${knowledgeContext.entriesCtx}

这是二手推文的抓取内容，不要只看这篇文章就下结论。请用 WebSearch/WebFetch 找到每个概念的一手来��。`;

    let fullText = '';

    const q = query({
      prompt: userPrompt,
      options: {
        systemPrompt: buildTriagePrompt(knowledgeContext.wikiCtx),
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
      reportFromSDKMessage('ai-digest', message);
      const text = extractText(message);
      if (text) fullText += text;
    }

    // 解析输出
    const result = parseTriageOutput(fullText);
    if (result) {
      entry.title = result.title || entry.url;
      entry.verdict = result.verdict;
      entry.concepts = result.concepts || [];
      entry.narrative = result.narrative;
      entry.composition = result.composition;
      entry.solves = result.solves;
      entry.explanation = result.explanation;
      entry.delta = result.delta;
      // 旧版 scores 兼容
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
      // 解析失败：自动重试一次（简化 prompt，只要求 JSON）
      console.warn(`[triage] ${entry.url} 首次解析失败，重试中...`);
      try {
        let retryText = '';
        const retryQ = query({
          prompt: `你的上次输出未能被解析。请只输出 ===TRIAGE_START=== 和 ===TRIAGE_END=== 包裹的 JSON，不要输出其他内容。\n\n原始内容摘要（前2000字）：\n${fullText.slice(0, 2000)}`,
          options: {
            systemPrompt: buildTriagePrompt(knowledgeContext.wikiCtx),
            cwd: process.cwd(),
            allowedTools: [],
            permissionMode: 'bypassPermissions' as const,
            allowDangerouslySkipPermissions: true,
            maxTurns: 1,
            abortController: new AbortController(),
            persistSession: false,
          },
        });
        for await (const msg of retryQ) {
          const t = extractText(msg);
          if (t) retryText += t;
        }
        const retryResult = parseTriageOutput(retryText);
        if (retryResult) {
          entry.title = retryResult.title || entry.url;
          entry.verdict = retryResult.verdict;
          entry.concepts = retryResult.concepts || [];
          entry.narrative = retryResult.narrative;
          entry.delta = retryResult.delta;
          entry.verdictReason = retryResult.verdictReason;
          entry.relatedEntries = retryResult.relatedEntries || [];
          entry.status = 'done';
          console.log(`[triage] ${entry.url} 重试成功`);
        } else {
          entry.status = 'error';
          entry.error = '无法解析研判结果（重试后仍失败）';
        }
      } catch {
        entry.status = 'error';
        entry.error = '无法解析研判结果';
      }
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
