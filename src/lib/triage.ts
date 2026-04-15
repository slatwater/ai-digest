import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { v4 as uuidv4 } from 'uuid';
import { TriageBatch, TriageEntry, TriageVerdict, TriageRelation, TriageScores, TriageConcept, SourceInfo } from './types';
import { safeScrape, safeParseJSON, stripCodeFence } from './agent';
import { saveTriageBatch } from './storage';
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


// 系统提示词：具名技术识别 + 组合分析
function buildTriagePrompt(): string {
  return `你是用户的技术侦察员。用户给你的大多是 AI 相关的链接（可能是二手推文）。

你的核心任务是**找到一手来源，基于一手来源识别具名技术并判断增量价值**。

用户给你的链接很可能是二手转载（推文、博客搬运等），你必须先确认来源层级再做分析。

## 什么是"具名技术"
有明确名称、可查证来源的技术/方法/算法/框架/项目。例如：
- KV Cache（Vaswani et al., 2017）
- LoRA（Hu et al., 2021）
- Hermes Agent（Nous Research 开源项目）

不是具名技术的：文章观点、公司动态、模糊描述（如"一种优化方法"）。

## 工作流程

### 第一步：判断来源层级（最重要）

读取文章内容，立刻判断：**这是一手来源还是二手转载？**

判断标准：
- **一手来源**：作者本人发布的（论文作者、项目维护者、公司官方公告）
- **二手转载**：转述/推广/评论他人成果的（推文介绍、博客搬运、新闻报道）

**如果是二手转载：**
1. 从文中提取关键词（项目名、作者名、论文标题等）
2. 用 WebSearch 找到一手来源（GitHub 仓库、论文页、官方博客）
3. 用 WebFetch 读取一手来源的内容
4. **后续所有分析基于一手来源**，二手原文不再参考
5. sources 中标记一手来源为 type="original"

**如果是一手来源：**
直接基于文章内容分析，无需额外溯源。

### 第二步：基于一手来源识别主角 + 组件

**分析对象是一手来源的内容，不是用户提交的二手推文。**

**先找主角**：一手来源重点介绍/提出的是什么？它就是主角（role="subject"）。
**再找组件**：主角依赖或组合了哪些具名技术？它们是组件（role="component"）。

每个具名技术必须有公认名称和可查证来源。
每篇文章 1 个主角 + 0-3 个组件。

### 第三步：verdict

verdict 规则：
- **save**: 文章有具名主角，有实质技术内容（新技术、新数据、新场景、新机制）
- **skip**: 无具名主角（纯观点/营销）/ 内容空洞

## 输出格式

===TRIAGE_START===
{
  "title": "核心技术/项目名（中文）",
  "sources": [
    { "url": "来源URL", "title": "来源标题", "type": "original|paper|github|docs|related" }
  ],
  "concepts": [
    {
      "name": "技术的公认名称",
      "role": "subject 或 component",
      "root": "来源（论文/作者/年份）→ 一句话核心原理",
      "whatItEnables": "一句话：能做什么",
      "sourceUrl": "一手来源 URL"
    }
  ],
  "narrative": "连贯的技术叙述（见下方规则）",
  "delta": {
    "gap": "这篇文章带来什么新信息（一句话）"
  },
  "verdict": "skip|save",
  "verdictReason": "一句话理由",
  "relatedEntries": [{"id": "条目ID", "title": "条目标题", "overlap": "关系"}]
}
===TRIAGE_END===

## narrative 规则
narrative 讲的是**一手来源的事情**，不是二手推文的事情。

**硬约束（违反任何一条即为错误输出）：**
- narrative 的第二段必须以一手来源的作者/项目为主语
- 禁止提及推文博主的观点、推文的传播数据（点赞/转发）、评论区内容
- 禁止解释概念是什么、概念的原理、概念怎么工作
- 如果未能找到一手来源，第二段写"未能溯源到一手来源"并基于可获取的最佳信息简述

narrative 分两段，每段用 \n\n 分隔：

第一段「溯源」：一句话交代来源链路。例如"从 @xxx 推文发现，一手来源是 GitHub microsoft/markitdown。"如果用户提交的就是一手来源，写"一手来源，作者/组织是 XXX。"
第二段「一手来源说了什么」：基于你用 WebFetch 实际读取到的一手来源内容，写作者做了什么、解决什么问题、有什么数据/效果。概念名用 [[]] 标记。

写作规则：
- 主语是一手来源的作者/项目，不是二手推文的博主
- 每句话只讲一件事，每句不超过 25 字
- 用大白话，假设读者不是技术专家

技术名标记格式：[[技术名]]

正确示例（用户提交了 poetengineer 的推文，溯源到 Karpathy 的 gist）：
"从 @poetengineer 推文发现，一手来源是 Karpathy 于 4 月发布的 GitHub Gist。\n\nKarpathy 提出用 LLM 当编译器维护个人知识库，取代传统 RAG 管道。架构基于 [[LLM Wiki]] 的三层目录结构，原始知识库约 100 篇文章、40 万字。社区已衍生出 SwarmVault、WikiMind 等多个变体。"

错误示例（❌ 在分析二手推文内容）：
"poetengineer 在推文中介绍了 Karpathy 的架构，并分享了自己改造成哲学学习库的经验。推文获得了大量转发..."

错误示例（❌ 在分析推文社交数据和截图）：
"这条推文展示用户使用 XXX 生成内容后的数据截图。群聊截图显示多条笔记获得 261-934 点赞、最高 1001 收藏。"
↑ 这是完全错误的输出。点赞/收藏/截图都是推文的二手数据，不是一手来源的技术内容。

## 重要
- concepts 中的 name 必须是公认名称，不是你自创的概念名
- narrative 必须用 \n\n 分段，不要写成一整段
- narrative 中每个技术名必须用 [[技术名]] 标记（不带竖线），且和 concepts 数组一一对应
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
  sources?: { url: string; title: string; type: string }[];
  concepts: TriageConcept[];
  narrative?: string;
  composition?: string;
  solves?: string;
  delta?: { gap: string };
  explanation?: string;
  scores?: { novelty: number; usability: number; leverage: number; timing: number };
  verdict: TriageVerdict;
  verdictReason: string;
  relatedEntries: TriageRelation[];
}

// 归一化 verdict：agent 有时输出 "SKIP — 理由" 而不是 "skip"
function normalizeVerdict(v: unknown): TriageVerdict | null {
  if (typeof v !== 'string') return null;
  const lower = v.toLowerCase();
  if (lower === 'skip' || lower.startsWith('skip')) return 'skip';
  if (lower === 'save' || lower.startsWith('save') || lower === 'deep-dive') return 'save';
  return null;
}

// 尝试从自创 schema 映射回标准 schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeTriageOutput(raw: any): TriageOutput | null {
  if (!raw || typeof raw !== 'object') return null;

  // verdict 缺失时默认 skip，不作废整条
  const verdict = normalizeVerdict(raw.verdict) || 'skip';

  // 标准 schema 直接返回
  if (raw.title && raw.concepts) {
    raw.verdict = verdict;
    return raw as TriageOutput;
  }

  // 自创 schema 映射：agent 有时用 named_technologies 代替 concepts
  const title = raw.title || raw.topic || '';
  const concepts: TriageConcept[] = [];
  if (Array.isArray(raw.named_technologies)) {
    for (const t of raw.named_technologies) {
      concepts.push({
        name: t.name || '',
        role: 'subject',
        root: t.owner ? `${t.owner} — ${t.status || ''}` : '',
        whatItEnables: '',
      });
    }
  }

  return {
    title: title || '(无标题)',
    concepts,
    sources: raw.sources || [],
    narrative: raw.narrative || raw.primary_source_reasoning || '',
    verdict,
    verdictReason: raw.verdictReason || raw.incremental_value_reasoning || raw.verdict || '',
    relatedEntries: raw.relatedEntries || [],
    delta: raw.delta,
  };
}

function parseTriageOutput(fullText: string): TriageOutput | null {
  // 方式 1：标记匹配
  const match = fullText.match(/===TRIAGE_START===([\s\S]*?)===TRIAGE_END===/);
  if (match) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = safeParseJSON<any>(match[1], 'triage');
    const result = normalizeTriageOutput(raw);
    if (result) return result;
  }

  // 方式 2：尝试从全文中找包含 verdict 的 JSON 对象
  const jsonMatch = fullText.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
  if (jsonMatch) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = safeParseJSON<any>(jsonMatch[0], 'triage-fallback');
    const result = normalizeTriageOutput(raw);
    if (result) return result;
  }

  // 方式 3：去掉 markdown 围栏再试
  const stripped = stripCodeFence(fullText);
  if (stripped.startsWith('{')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = safeParseJSON<any>(stripped, 'triage-stripped');
    const result = normalizeTriageOutput(raw);
    if (result) return result;
  }

  // 方式 4：提取最后一个完整 JSON 块
  const allJsonBlocks = [...fullText.matchAll(/```(?:json)?\s*\n(\{[\s\S]*?\})\s*\n```/g)];
  if (allJsonBlocks.length > 0) {
    const lastBlock = allJsonBlocks[allJsonBlocks.length - 1][1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = safeParseJSON<any>(lastBlock, 'triage-codeblock');
    const result = normalizeTriageOutput(raw);
    if (result) return result;
  }

  // 方式 5：兜底——找任何含 title 或 narrative 的 JSON 对象
  const anyJsonMatch = fullText.match(/\{[\s\S]*"(?:title|narrative)"[\s\S]*\}/);
  if (anyJsonMatch) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = safeParseJSON<any>(anyJsonMatch[0], 'triage-any');
    const result = normalizeTriageOutput(raw);
    if (result) return result;
  }

  console.warn(`[triage] 解析失败，输出全文长度: ${fullText.length} | 含TRIAGE_START: ${fullText.includes('TRIAGE_START')} | 含verdict: ${fullText.includes('"verdict"')} | 前 1500 字:`, fullText.slice(0, 1500));
  return null;
}

// 阶段推进：当前阶段标记完成，切到下一阶段
function setPhase(entry: TriageEntry, label: string) {
  if (entry.liveStatus === label) return;
  if (!entry.livePhases) entry.livePhases = [];
  if (entry.liveStatus && !entry.livePhases.includes(entry.liveStatus)) {
    entry.livePhases.push(entry.liveStatus);
  }
  entry.liveStatus = label;
}

// 处理单条 URL
async function processOne(entry: TriageEntry): Promise<void> {
  entry.status = 'processing';
  entry.livePhases = [];
  setPhase(entry, '采集页面');

  try {
    // 统一用 safeScrape 抓取（scrape.py 内部对 X/Twitter 自动用 Camoufox 滚动加载 thread）
    const scraped = await safeScrape(entry.url);
    const scrapeResult = safeParseJSON<{ status?: string; content?: string; title?: string; truncated?: boolean; hint?: string; threadSize?: number }>(scraped, 'scrape') || {};
    const scrapeFailed = !scrapeResult.content || scrapeResult.status === 'error' || (scrapeResult.content.length < 200);
    const isTruncated = !!(scrapeResult as Record<string, unknown>).truncated;
    const isThread = (scrapeResult.threadSize ?? 0) > 1;

    // 保存抓取原文，供后续定向扩展复用
    if (!scrapeFailed && scrapeResult.content) {
      entry.scrapedContent = scrapeResult.content;
    }

    // 从抓取内容中预提取 URL，给 Agent 捷径
    const extractedUrls = scrapeFailed ? [] : extractUrls(scrapeResult.content || '');
    const urlsSection = extractedUrls.length > 0
      ? `\n## 文中提及的链接（可直接 WebFetch）\n${extractedUrls.map(u => `- ${u}`).join('\n')}\n`
      : '';

    const truncatedWarning = isTruncated
      ? `\n## ⚠️ 内容截断\n这是一个 thread（分段推文），只抓到了第一条。你必须用 WebFetch 获取该 URL 的完整 thread 内容，再进行分析。不要基于截断内容下结论。\n`
      : '';

    // 工具始终开启，Agent 需要主动去查一手资料
    const allowedTools = ['WebFetch', 'WebSearch'];
    const maxTurns = 18;

    // 判断是否来自二手平台（推文、社交媒体）
    const isSecondaryPlatform = /^https?:\/\/(x\.com|twitter\.com|threads\.net|weibo\.com)/i.test(entry.url);

    const userPrompt = scrapeFailed
      ? `请分析这个链接：

## URL
${entry.url}

## 抓取状态
直接抓取失败。请先用 WebFetch 获取该 URL，失败则用 WebSearch 搜索相关内容。

**最重要：先判断这是一手来源还是二手转载。如果是二手，立刻去找一手来源，基于一手来源做分析。**`
      : isSecondaryPlatform
        ? `请分析这个链接：

## URL
${entry.url}

## 二手推文摘要（仅用于提取关键词，严禁分析推文本身的任何数据）
${(scrapeResult.content || '').slice(0, 600)}
${urlsSection}

## 强制执行步骤
1. 从上面的摘要中提取：项目名/论文名/作者名（仅此而已）
2. 立刻用 WebSearch 搜索一手来源（GitHub 仓库、论文页、官方博客）
3. 用 WebFetch 读取一手来源的完整内容
4. 基于一手来源的内容完成所有分析

## 绝对禁止
- 禁止在 narrative 中提及推文的点赞、转发、收藏、评论等社交数据
- 禁止在 narrative 中描述推文截图、群聊截图、用户使用案例展示
- 禁止用推文博主作为 narrative 第二段的主语
- 如果你的输出包含任何社交媒体数据，这次分析就是失败的`
        : `请分析这个链接：

## URL
${entry.url}
${truncatedWarning}
## 抓取内容${isTruncated ? '（截断，仅第一条推文）' : isThread ? `（完整 thread，${scrapeResult.threadSize} 条）` : ''}
${scraped.slice(0, isThread ? 12000 : 6000)}
${urlsSection}
**先判断这是一手来源还是二手转载。如果是二手，立刻去找一手来源，基于一手来源做分析。**`;

    let fullText = '';
    setPhase(entry, '分析内容');

    const q = query({
      prompt: userPrompt,
      options: {
        systemPrompt: buildTriagePrompt(),
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
      reportFromSDKMessage('aidigest', message);

      // 实时状态：检测工具调用
      if (message.type === 'assistant') {
        const blocks = message.message?.content;
        if (Array.isArray(blocks)) {
          for (const block of blocks) {
            if (block.type === 'tool_use' && typeof block.name === 'string') {
              const labels: Record<string, string> = {
                WebSearch: '溯源搜索',
                WebFetch: '读取来源',
              };
              if (labels[block.name]) {
                setPhase(entry, labels[block.name]);
              }
            }
            if (block.type === 'text' && typeof block.text === 'string' && block.text.includes('TRIAGE_START')) {
              setPhase(entry, '整理结果');
            }
          }
        }
      }

      const text = extractText(message);
      // result 消息可能重复 assistant 的内容，去重后再追加
      if (text && (message.type !== 'result' || !fullText.includes(text.slice(0, 200)))) {
        fullText += text;
      }
    }

    // 解析输出
    const result = parseTriageOutput(fullText);
    if (result) {
      entry.title = result.title || entry.url;
      // 兼容 LLM 仍输出 deep-dive 的情况，映射为 save
      entry.verdict = ((result.verdict as string) === 'deep-dive' ? 'save' : result.verdict) as TriageVerdict;
      entry.concepts = result.concepts || [];
      entry.sources = (result.sources || []).map(s => ({
        url: s.url, title: s.title,
        type: (['original', 'related', 'github', 'paper', 'docs'].includes(s.type) ? s.type : 'related') as SourceInfo['type'],
      }));
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
      setPhase(entry, '重试解析');
      console.warn(`[triage] ${entry.url} 首次解析失败，重试中...`);
      try {
        let retryText = '';
        const retryQ = query({
          prompt: `你的上次输出未能被解析。请只输出 ===TRIAGE_START=== 和 ===TRIAGE_END=== 包裹的 JSON，不要输出其他内容。\n\n原始内容摘要（前2000字）：\n${fullText.slice(0, 2000)}`,
          options: {
            systemPrompt: buildTriagePrompt(),
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
          entry.verdict = ((retryResult.verdict as string) === 'deep-dive' ? 'save' : retryResult.verdict) as TriageVerdict;
          entry.concepts = retryResult.concepts || [];
          entry.sources = (retryResult.sources || []).map(s => ({
            url: s.url, title: s.title,
            type: (['original', 'related', 'github', 'paper', 'docs'].includes(s.type) ? s.type : 'related') as SourceInfo['type'],
          }));
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
  for (const entry of batch.entries) {
    await processOne(entry);
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
