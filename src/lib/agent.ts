import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { v4 as uuidv4 } from 'uuid';
import { execFile } from 'child_process';
import path from 'path';
import { DigestPhase, QuestionEvent, DigestEntry, AnalysisResult, AnalysisConcept, NarrativeReport, SourceInfo } from './types';
import { saveEntry, getEntries, getWikiEntries } from './storage';
import { saveConceptsToWiki } from './compiler';
import { reportFromSDKMessage } from './token-report';

// 封装 execFile：立即关闭 stdin 防止子进程阻塞等待输入
function execFileAsync(
  file: string,
  args: string[],
  options: { timeout?: number; signal?: AbortSignal; cwd?: string },
): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (error, stdout) => {
      if (error) reject(error);
      else resolve({ stdout });
    });
    child.stdin?.end();
  });
}

// 活跃的 digest 会话
interface ActiveSession {
  id: string;
  url: string;
  phase: DigestPhase;
  abortController: AbortController;
  questionResolver?: (answer: string) => void;
  claudeSessionId?: string;
  createdAt: number;
}

const activeSessions = new Map<string, ActiveSession>();

// Session TTL 清理：10 分钟未结束的 session 自动移除
const SESSION_TTL = 10 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of activeSessions) {
    if (now - session.createdAt > SESSION_TTL) {
      session.abortController.abort();
      activeSessions.delete(id);
      console.warn(`[digest] session ${id} 超时清理`);
    }
  }
}, 60 * 1000);

export function getSession(sessionId: string) {
  return activeSessions.get(sessionId);
}

// 安全抓取：用 execFile 传参数组，避免 shell 注入
export async function safeScrape(url: string): Promise<string> {
  const scriptPath = path.join(process.cwd(), 'scripts', 'scrape.py');
  try {
    const { stdout } = await execFileAsync('python3', [scriptPath, url], { timeout: 60000 });
    return stdout;
  } catch {
    return JSON.stringify({ error: '抓取失败', status: 'error' });
  }
}

// 用于 SSE 的事件发送器
type EventSender = (type: string, data: unknown) => void;

// 构建 Agent 的系统提示词
export function buildSystemPrompt(scrapedContent: string, wikiContext?: string): string {
  const wikiSection = wikiContext
    ? `\n## 已有 Wiki 概念（用于判断新旧）\n${wikiContext}\n`
    : '';

  return `你是一个 AI 前沿技术深度研究助手。你的任务是：深入理解文章的技术贡献，产出让读者能真正理解和判断该技术的研究报告。

## 什么是"具名技术"
有明确名称、可查证来源的技术/方法/算法/框架。例如：KV Cache、LoRA、Speculative Decoding、vLLM。
不是具名技术的：文章观点、公司动态、模糊描述。

## 工作流程

你需要按照以下阶段依次完成工作：

### 阶段 1: 采集 (Capture)
- 网页内容已预先抓取并附在用户消息中，直接使用即可
- 如果预抓取内容为空或不完整，使用 WebFetch 补充抓取

### 阶段 2: 溯源 (Trace)
- 分析内容是否为原始来源
- 如果是转载/报道，使用 WebSearch 搜索原文
- 搜索相关的技术文档、论文、GitHub 仓库
- 输出找到的来源列表

### 阶段 3: 技术识别 (Decompose)
识别文章**核心涉及**的 2-4 个具名技术，宁少勿滥。只提取文章重点讨论的技术，不提取顺带提及的通用概念（如 SFT、fine-tuning 等人人都知道的基础操作）。每个技术必须有公认名称和可查证来源。

对每个技术：
- 用 WebSearch 查证其来源（论文/作者/年份/项目）
- 对比 Wiki 列表判断是否已有：名称或别名匹配 → 已知，否则 → 新技术
- 已知技术：只写本文对该技术的新贡献
- 新技术：完整描述 what/enables/limitations
- **如果 Wiki 中已有含义相同的技术，必须复用其 id，禁止新建**
${wikiSection}
### 阶段 4: 组合分析 (Compose)
分析文章如何组合上述技术，理解其技术贡献的完整脉络。

输出两个结构化 JSON，分别用标记包裹：

**A) 叙事报告**（用 ===NARRATIVE_START=== 和 ===NARRATIVE_END=== 包裹）:

这是面向读者的研究报告，目标是让读者 10 分钟内达到"能判断该技术是否对自己有用 + 知道如何复现"的理解深度。

===NARRATIVE_START===
{
  "oneliner": "一句非技术语言说清楚这篇在干什么（给 5 秒判断要不要读）",
  "situation": "现状与矛盾（Markdown）：当前做法是什么、碰到了什么天花板、用具体数据/现象锚定问题严重程度、为什么现有方案解决不了（本质矛盾）。目标：让读者产生'确实需要新方案'的判断",
  "insight": "核心洞察（Markdown）：作者发现了什么关键事实/规律、这个发现为什么能打破上面的矛盾。这是全文最重要的一段",
  "insightHighlight": "一句话提炼洞察（用于视觉高亮框，方便回看）",
  "mechanism": "方案机制（Markdown）：具体怎么做的（步骤级描述，可复现）、每步为什么这样设计（连接回核心洞察）、关键参数/配置/选择 + 作者的实验结论",
  "evidence": "效果与边界（Markdown）：核心实验数据（用 Markdown 表格）、在什么条件下有效/失效、与主流替代方案的 trade-off 对比",
  "implications": "启发（Markdown）：这个工作打开了什么新可能、对后续研究或工程实践的潜在影响",
  "conceptIndex": ["concept-id-1", "concept-id-2"]
}
===NARRATIVE_END===

叙事报告写作原则：
- 以事实为基础，不主观评价
- 渐入式深入：每层建立在上一层之上
- 正文中首次出现核心概念时用 **加粗** 标记
- situation 要花足够篇幅让读者建立问题感，不要跳过直接讲方案
- mechanism 不是罗列步骤，是讲推理——每步为什么这样做
- evidence 必须包含具体数据，用 Markdown 表格呈现对比
- 每段控制在 2-4 个自然段，避免大段文字墙

**B) 概念拆解**（用 ===ANALYSIS_START=== 和 ===ANALYSIS_END=== 包裹）:

这是给 Wiki 积累的结构化数据。

===ANALYSIS_START===
{
  "tldr": "一句话概括",
  "concepts": [
    {
      "id": "kebab-case-slug（已知技术必须复用 Wiki 中的 id）",
      "name": "技术的公认名称",
      "aliases": ["别名1", "别名2"],
      "domain": "领域",
      "origin": "来源（论文/作者/年份 或 项目/组织）",
      "isNew": true,
      "summary": "2-3句概要",
      "what": "核心原理（Markdown，已知技术只写本文新贡献）",
      "enables": "能解决什么问题、应用场景（Markdown）",
      "limitations": "局限与争议（Markdown）",
      "relations": [
        { "conceptId": "slug", "conceptName": "名称", "type": "composed-of|builds-on|contrasts|related|enables|part-of", "description": "关系说明" }
      ]
    }
  ],
  "comparison": "横向对比表（Markdown 表格）",
  "tags": ["标签1", "标签2"]
}
===ANALYSIS_END===

概念拆解规则：
- concepts 中的 name 必须是公认名称，不是自创概念名
- 已知技术必须复用 Wiki 中的 id 和名称，禁止重复创建
- 组合技术通过 composed-of 关系指向其组成部分
- isNew 严格基于 Wiki 列表判断

### 阶段 5: 归档 (Archive)
- 生成完整的 Markdown 研究报告（留档用，将叙事报告展开为完整文章）
- 报告格式（用 ===REPORT_START=== 和 ===REPORT_END=== 包裹）:
===REPORT_START===
# 标题

> 一句话概括

## 来源
- [来源名](URL)

## 现状与矛盾
...

## 核心洞察
...

## 方案机制
...

## 效果与边界
...

## 启发
...

## 概念索引
- **概念名1**: 一句话概要
- **概念名2**: 一句话概要

---
日期: YYYY-MM-DD
标签: tag1, tag2
===REPORT_END===

## 重要规则
1. 每个阶段开始前输出: ===PHASE:阶段名===（如 ===PHASE:capture===）
2. 分析要有深度，不要泛泛而谈
3. 技术内容要准确，不确定的要标注
4. 所有输出用中文
5. 找到的来源用 ===SOURCES_START=== 和 ===SOURCES_END=== 包裹，格式为 JSON 数组
`;
}

// 从 SDK 消息中提取文本内容
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

// 去除 markdown 代码围栏，提取纯 JSON 文本
export function stripCodeFence(raw: string): string {
  return raw.trim().replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
}

// 安全解析 JSON：先尝试原文，失败则去围栏重试
export function safeParseJSON<T>(raw: string, label: string): T | null {
  const text = raw.trim();
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(stripCodeFence(text));
    } catch (e) {
      console.warn(`[digest] ${label} JSON 解析失败:`, (e as Error).message, '| 原文前100字符:', text.slice(0, 100));
      return null;
    }
  }
}

// 从报告 markdown 中提取概念作为 fallback（兼容新旧两种报告格式）
function extractAnalysisFromReport(report: string): AnalysisResult | null {
  if (!report) return null;

  const tldrMatch = report.match(/^>\s*(.+)$/m);
  const tagsMatch = report.match(/标签[:：]\s*(.+)$/m);
  const tags = tagsMatch ? tagsMatch[1].split(/[,，、]/).map(t => t.trim()).filter(Boolean) : [];

  // 新格式：按概念组织的报告（## 概念名 → ### 是什么/能做什么/现状与局限）
  const conceptSections = report.matchAll(/^## ([^\n]+)\n([\s\S]*?)(?=^## |\n---\n|$)/gm);
  const concepts: AnalysisConcept[] = [];
  for (const m of conceptSections) {
    const name = m[1].trim();
    const body = m[2];
    // 跳过非概念 section（来源、横向对比）
    if (/^(来源|横向对比|Sources)$/i.test(name)) continue;
    const sub = (heading: string) => {
      const re = new RegExp(`^###\\s*${heading}\\s*\\n([\\s\\S]*?)(?=^###\\s|$)`, 'm');
      return re.exec(body)?.[1]?.trim() || '';
    };
    const what = sub('是什么');
    const enables = sub('能做什么');
    const limitations = sub('现状与局限');
    if (!what && !enables) continue;
    concepts.push({
      id: name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, ''),
      name, aliases: [], domain: '', summary: '',
      what, enables, limitations, relations: [],
    });
  }

  if (concepts.length > 0) {
    const compSection = report.match(/^## 横向对比\s*\n([\s\S]*?)(?=^## |\n---\n|$)/m);
    return { tldr: tldrMatch?.[1] || '', concepts, comparison: compSection?.[1]?.trim() || '', tags };
  }

  // 旧格式 fallback
  const sectionPattern = (heading: string) => {
    const re = new RegExp(`^##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=^##\\s|$)`, 'm');
    return re.exec(report)?.[1]?.trim() || '';
  };
  const keyPointsRaw = sectionPattern('核心要点');
  const keyPoints = keyPointsRaw
    ? keyPointsRaw.split(/\n/).filter(l => /^[-*\d]/.test(l.trim())).map(l => l.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean)
    : [];
  const technical = sectionPattern('技术分析');
  const significance = sectionPattern('行业意义');
  const limitations = sectionPattern('局限与争议');
  const comparison = sectionPattern('横向对比');

  if (!tldrMatch?.[1] && keyPoints.length === 0 && !technical) return null;

  return { tldr: tldrMatch?.[1] || '', keyPoints, technical, significance, limitations, comparison, tags };
}

// 解析 Agent 输出中的结构化数据
function parseStructuredData(fullText: string) {
  let analysis: AnalysisResult | null = null;
  let narrative: NarrativeReport | null = null;
  let sources: SourceInfo[] = [];
  let report = '';
  let title = '';

  // 解析叙事报告
  const narrativeMatch = fullText.match(/===NARRATIVE_START===([\s\S]*?)===NARRATIVE_END===/);
  if (narrativeMatch) {
    narrative = safeParseJSON<NarrativeReport>(narrativeMatch[1], 'narrative');
  }

  // 解析概念拆解
  const analysisMatch = fullText.match(/===ANALYSIS_START===([\s\S]*?)===ANALYSIS_END===/);
  if (analysisMatch) {
    analysis = safeParseJSON<AnalysisResult>(analysisMatch[1], 'analysis');
  }

  // 解析来源
  const sourcesMatch = fullText.match(/===SOURCES_START===([\s\S]*?)===SOURCES_END===/);
  if (sourcesMatch) {
    sources = safeParseJSON<SourceInfo[]>(sourcesMatch[1], 'sources') || [];
  }

  // 解析报告
  const reportMatch = fullText.match(/===REPORT_START===([\s\S]*?)===REPORT_END===/);
  if (reportMatch) {
    report = reportMatch[1].trim();
    const titleMatch = report.match(/^# (.+)$/m);
    if (titleMatch) {
      title = titleMatch[1];
    }
  }

  // 将 narrative 合入 analysis
  if (narrative && analysis) {
    analysis.narrative = narrative;
  } else if (narrative && !analysis) {
    analysis = { tldr: narrative.oneliner, narrative, tags: [] };
  }

  // fallback: 标记解析失败时从报告 markdown 中提取
  if (!analysis) {
    analysis = extractAnalysisFromReport(report);
    if (analysis) {
      console.warn('[digest] analysis 标记解析失败，已从报告 markdown 中回退提取');
    }
  }

  return { analysis, sources, report, title };
}

// 检查 URL 是否已有分析
export async function findExistingEntry(url: string): Promise<{ id: string; title: string } | null> {
  const entries = await getEntries();
  const normalise = (u: string) => u.replace(/\/+$/, '').replace(/^https?:\/\//, '');
  const target = normalise(url);
  const found = entries.find(e => normalise(e.url) === target);
  return found ? { id: found.id, title: found.title } : null;
}

// 运行 digest 流程
export async function runDigest(
  url: string,
  send: EventSender,
  existingId?: string,
): Promise<string> {
  const sessionId = existingId || uuidv4();
  const abortController = new AbortController();

  const session: ActiveSession = {
    id: sessionId,
    url,
    phase: 'capture',
    abortController,
    createdAt: Date.now(),
  };
  activeSessions.set(sessionId, session);

  send('phase', { phase: 'capture', label: '正在采集内容...' });

  // 统一用 safeScrape 抓取（scrape.py 内部对 X/Twitter 自动走 StealthyFetcher）
  const scraped = await safeScrape(url);

  const scrapedIsEmpty = !scraped || scraped.includes('"status":"error"') || scraped.length < 50;
  const scrapeNote = scrapedIsEmpty
    ? '\n\n## 抓取状态\n直接抓取失败。请使用 WebFetch 获取内容，如果失败则用 WebSearch 搜索。'
    : `\n\n## 预抓取内容\n${scraped}`;

  // 构建 Wiki 上下文，让 Agent 判断概念新旧
  let wikiContext: string | undefined;
  try {
    const wikiEntries = await getWikiEntries();
    if (wikiEntries.length > 0) {
      wikiContext = wikiEntries.map(w => {
        const names = [w.name, ...(w.aliases || [])].join(' / ');
        return `- [${w.id}] ${names} (${w.domain}): ${w.summary}`;
      }).join('\n');
    }
  } catch { /* ignore */ }

  let fullText = '';
  let currentPhase: DigestPhase = 'capture';
  const sentMarkers = new Set<string>(); // 防止增量事件重复发送

  // 阶段顺序：采集→溯源→分解→组合分析→归档
  const phaseOrder: DigestPhase[] = ['capture', 'trace', 'decompose', 'compose', 'archive'];
  let currentPhaseIdx = 0;

  try {
    const q = query({
      prompt: `请对以下链接进行完整的研究分析：${url}${scrapeNote}`,
      options: {
        systemPrompt: buildSystemPrompt(scraped, wikiContext),
        cwd: process.cwd(),
        allowedTools: ['WebFetch', 'WebSearch', 'Read', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        maxTurns: 20,
        abortController,
        persistSession: false,
      },
    });

    for await (const message of q) {
      if (abortController.signal.aborted) break;

      // 捕获 session ID
      if (message.type === 'system' && message.subtype === 'init') {
        session.claudeSessionId = message.session_id;
      }

      // 上报 token 用量到 token monitor
      reportFromSDKMessage('ai-digest', message, session.claudeSessionId || sessionId);

      const text = extractText(message);
      if (text) {
        fullText += text;

        // 检测阶段切换（只允许单向前进，防止总结文本中重复匹配）
        const phaseMatches = text.matchAll(/===PHASE:(\w+)===/g);
        for (const m of phaseMatches) {
          const phase = m[1] as DigestPhase;
          const phaseIdx = phaseOrder.indexOf(phase);
          if (phaseIdx > currentPhaseIdx) {
            currentPhaseIdx = phaseIdx;
            currentPhase = phase;
            session.phase = phase;
            const labels: Record<string, string> = {
              capture: '正在采集内容...',
              trace: '正在溯源搜索...',
              decompose: '正在识别核心技术...',
              compose: '正在构建叙事报告...',
              archive: '正在归档...',
            };
            send('phase', { phase, label: labels[phase] || phase });
          }
        }

        // 增量结构化事件：标记闭合后立即发送，同时补推 phase
        // （Agent 可能跳过 ===PHASE:xxx=== 标记，用数据就绪来兜底）
        const advancePhase = (target: DigestPhase) => {
          const idx = phaseOrder.indexOf(target);
          if (idx > currentPhaseIdx) {
            currentPhaseIdx = idx;
            currentPhase = target;
            session.phase = target;
            const labels: Record<string, string> = {
              capture: '正在采集内容...',
              trace: '正在溯源搜索...',
              decompose: '正在识别核心技术...',
              compose: '正在构建叙事报告...',
              archive: '正在归档...',
            };
            send('phase', { phase: target, label: labels[target] || target });
          }
        };

        if (!sentMarkers.has('sources')) {
          const m = fullText.match(/===SOURCES_START===([\s\S]*?)===SOURCES_END===/);
          if (m) {
            sentMarkers.add('sources');
            advancePhase('trace');
            const parsed = safeParseJSON<SourceInfo[]>(m[1], 'sources-incr');
            if (parsed) send('sources', { sources: parsed });
          }
        }
        if (!sentMarkers.has('title')) {
          const m = fullText.match(/===REPORT_START===[\s\S]*?# (.+)$/m);
          if (m) {
            sentMarkers.add('title');
            send('title', { title: m[1] });
          }
        }
        if (!sentMarkers.has('concepts')) {
          const m = fullText.match(/===ANALYSIS_START===([\s\S]*?)===ANALYSIS_END===/);
          if (m) {
            sentMarkers.add('concepts');
            advancePhase('decompose');
            const parsed = safeParseJSON<AnalysisResult>(m[1], 'concepts-incr');
            if (parsed?.concepts) {
              send('concepts', { concepts: parsed.concepts.map(c => ({ name: c.name, isNew: c.isNew })) });
            }
          }
        }
        if (!sentMarkers.has('narrative')) {
          const m = fullText.match(/===NARRATIVE_START===([\s\S]*?)===NARRATIVE_END===/);
          if (m) {
            sentMarkers.add('narrative');
            advancePhase('compose');
            send('narrative', { done: true });
          }
        }

        // 发送文本流（清理掉标记）
        const cleanText = text
          .replace(/===PHASE:\w+===/g, '')
          .replace(/===\w+_START===/g, '')
          .replace(/===\w+_END===/g, '');

        if (cleanText.trim()) {
          send('text', { content: cleanText, phase: currentPhase });
        }
      }
    }

    // 解析完整输出
    const parsed = parseStructuredData(fullText);

    // 构建知识库条目
    const entry: DigestEntry = {
      id: sessionId,
      url,
      title: parsed.title || url,
      date: new Date().toISOString(),
      tags: parsed.analysis?.tags || [],
      tldr: parsed.analysis?.tldr || '',
      entryType: 'researched',
      analysis: parsed.analysis || {
        tldr: '',
        tags: [],
      },
      sources: parsed.sources,
      fullMarkdown: parsed.report || fullText,
    };

    // 保存到知识库
    await saveEntry(entry);

    // 概念直接存入 Wiki（异步，不阻塞主流程）
    if (parsed.analysis?.concepts?.length) {
      saveConceptsToWiki(parsed.analysis.concepts, entry).catch(err => {
        console.warn('[wiki] 概念存入 Wiki 失败:', err);
      });
    }

    send('analysis', entry.analysis);
    send('complete', { entryId: entry.id, title: entry.title });

    return sessionId;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    send('error', { message: errMsg });
    throw error;
  } finally {
    activeSessions.delete(sessionId);
  }
}

// 回复交互问题
export function respondToQuestion(sessionId: string, answer: string): boolean {
  const session = activeSessions.get(sessionId);
  if (session?.questionResolver) {
    session.questionResolver(answer);
    session.questionResolver = undefined;
    return true;
  }
  return false;
}

// 停止 digest 流程
export function stopDigest(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.abortController.abort();
    activeSessions.delete(sessionId);
    return true;
  }
  return false;
}
