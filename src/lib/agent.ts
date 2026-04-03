import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { v4 as uuidv4 } from 'uuid';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { DigestPhase, QuestionEvent, DigestEntry, AnalysisResult, SourceInfo } from './types';
import { saveEntry, getEntries } from './storage';

const execFileAsync = promisify(execFile);

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
export function buildSystemPrompt(scrapedContent: string): string {
  return `你是一个 AI 前沿技术研究助手。你的任务是深入分析用户提供的链接内容，进行多维度研究。

## 工作流程

你需要按照以下阶段依次完成工作，每完成一个阶段输出对应的 JSON 标记：

### 阶段 1: 采集 (Capture)
- 网页内容已预先抓取并附在用户消息中，直接使用即可
- 如果预抓取内容为空或不完整，使用 WebFetch 补充抓取

### 阶段 2: 溯源 (Trace)
- 分析内容是否为原始来源
- 如果是转载/报道，使用 WebSearch 搜索原文
- 搜索相关的技术文档、论文、GitHub 仓库
- 输出找到的来源列表

### 阶段 3: 分析 (Analyze)
- 对内容进行多维度深度分析
- 必须输出以下结构化 JSON（用 ===ANALYSIS_START=== 和 ===ANALYSIS_END=== 包裹）:
===ANALYSIS_START===
{
  "tldr": "一句话概括",
  "keyPoints": ["要点1", "要点2", ...],
  "technical": "技术原理/方法/架构详细说明",
  "significance": "行业影响和应用场景",
  "limitations": "已知局限、争议、社区质疑",
  "comparison": "与同类技术的对比分析，必须使用 Markdown 表格（| 列1 | 列2 | ... |）格式，第一列为对比维度",
  "tags": ["标签1", "标签2", ...]
}
===ANALYSIS_END===

### 阶段 4: 实践 (Practice) — 生成可交互的浏览器 Demo
- 生成一个**纯 HTML/CSS/JS 的单文件网页 demo**，能直接在浏览器 iframe 中运行
- Demo 的目标是让用户直观体验这个项目/技术的核心能力
- 真实性约束：
  - Demo 中展示的所有内容（名称、数据、流程、命令）必须来自前面采集到的真实信息
  - 禁止编造不存在的功能、API、命令或数据
  - 如果原文提到了具体的数字、指标、示例，优先使用这些真实数据
- 设计思路：
  - CLI 工具 → 模拟终端，展示真实的命令和输出
  - 算法 → 用真实数据可视化算法运行过程
  - API/SDK → 模拟真实的请求和响应
  - 框架/库 → 用真实的 API 做一个迷你交互 demo
  - 论文 → 可视化论文的核心方法和实验结果
- 技术要求：
  - 单个 HTML 文件，包含内联 CSS 和 JS
  - 禁止依赖外部 CDN 或网络资源
  - 必须有交互性（点击、输入、动画等）
  - 视觉精致，体现设计感
- **禁止将 demo 写入本地文件**，必须将完整 HTML 代码作为 JSON 字符串输出在标记内
- 输出 demo 信息（用 ===DEMO_START=== 和 ===DEMO_END=== 包裹）:
===DEMO_START===
{
  "language": "html",
  "filename": "demo.html",
  "code": "完整的 HTML 文件内容",
  "instructions": "一句话说明这个 demo 展示了什么"
}
===DEMO_END===

### 阶段 5: 归档 (Archive)
- 生成完整的 Markdown 研究报告
- 报告格式（用 ===REPORT_START=== 和 ===REPORT_END=== 包裹）:
===REPORT_START===
# 标题

> TLDR

## 来源
- [来源名](URL)

## 核心要点
...

## 技术分析
...

## 行业意义
...

## 局限与争议
...

## 横向对比
...

## Demo
...（如有）

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

// 从报告 markdown 中提取各 section 作为 fallback
function extractAnalysisFromReport(report: string): AnalysisResult | null {
  if (!report) return null;

  const sectionPattern = (heading: string) => {
    const re = new RegExp(`^##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=^##\\s|$)`, 'm');
    return re.exec(report)?.[1]?.trim() || '';
  };

  const tldrMatch = report.match(/^>\s*(.+)$/m);
  const keyPointsRaw = sectionPattern('核心要点');
  const keyPoints = keyPointsRaw
    ? keyPointsRaw.split(/\n/).filter(l => /^[-*\d]/.test(l.trim())).map(l => l.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean)
    : [];

  const technical = sectionPattern('技术分析');
  const significance = sectionPattern('行业意义');
  const limitations = sectionPattern('局限与争议');
  const comparison = sectionPattern('横向对比');
  const tagsMatch = report.match(/标签[:：]\s*(.+)$/m);
  const tags = tagsMatch ? tagsMatch[1].split(/[,，、]/).map(t => t.trim()).filter(Boolean) : [];

  if (!tldrMatch?.[1] && keyPoints.length === 0 && !technical) return null;

  return { tldr: tldrMatch?.[1] || '', keyPoints, technical, significance, limitations, comparison, tags };
}

// 解析 Agent 输出中的结构化数据
function parseStructuredData(fullText: string) {
  let analysis: AnalysisResult | null = null;
  let sources: SourceInfo[] = [];
  let demo: { language: string; filename: string; code: string; instructions: string } | null = null;
  let report = '';
  let title = '';

  // 解析分析结果
  const analysisMatch = fullText.match(/===ANALYSIS_START===([\s\S]*?)===ANALYSIS_END===/);
  if (analysisMatch) {
    analysis = safeParseJSON<AnalysisResult>(analysisMatch[1], 'analysis');
  }

  // 解析来源
  const sourcesMatch = fullText.match(/===SOURCES_START===([\s\S]*?)===SOURCES_END===/);
  if (sourcesMatch) {
    sources = safeParseJSON<SourceInfo[]>(sourcesMatch[1], 'sources') || [];
  }

  // 解析 Demo
  const demoMatch = fullText.match(/===DEMO_START===([\s\S]*?)===DEMO_END===/);
  if (demoMatch) {
    demo = safeParseJSON<typeof demo>(demoMatch[1], 'demo');
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

  // fallback: 标记解析失败时从报告 markdown 中提取
  if (!analysis) {
    analysis = extractAnalysisFromReport(report);
    if (analysis) {
      console.warn('[digest] analysis 标记解析失败，已从报告 markdown 中回退提取');
    }
  }

  return { analysis, sources, demo, report, title };
}

// Demo 补生成：用精简 prompt 专门生成 demo 代码
async function retryDemo(
  url: string,
  analysis: AnalysisResult,
  report: string,
  abortController: AbortController,
): Promise<{ language: string; filename: string; code: string; instructions: string } | null> {
  const context = `
## 项目信息
- URL: ${url}
- TLDR: ${analysis.tldr}
- 核心要点: ${analysis.keyPoints.join('; ')}
- 技术分析: ${analysis.technical.slice(0, 800)}
${report ? `\n## 研究报告摘要\n${report.slice(0, 1500)}` : ''}
`.trim();

  const demoPrompt = `基于以下研究内容，生成一个可交互的浏览器 Demo。

${context}

要求：
1. 纯 HTML/CSS/JS 单文件，可直接在 iframe 中运行
2. 禁止依赖外部 CDN 或网络资源
3. 必须有交互性（点击、输入、动画等）
4. 所有展示内容必须基于上面的真实研究数据，禁止编造
5. 视觉精致，体现设计感

输出格式（严格遵守标记）:
===DEMO_START===
{
  "language": "html",
  "filename": "demo.html",
  "code": "完整的 HTML 文件内容",
  "instructions": "一句话说明这个 demo 展示了什么"
}
===DEMO_END===`;

  let demoText = '';
  const q = query({
    prompt: demoPrompt,
    options: {
      systemPrompt: '你是一个前端 Demo 生成专家。只输出 ===DEMO_START=== 和 ===DEMO_END=== 包裹的 JSON，不要输出其他内容。所有输出用中文。',
      cwd: process.cwd(),
      allowedTools: [],
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      maxTurns: 3,
      abortController,
      persistSession: false,
    },
  });

  for await (const message of q) {
    if (abortController.signal.aborted) break;
    const text = extractText(message);
    if (text) demoText += text;
  }

  const demoMatch = demoText.match(/===DEMO_START===([\s\S]*?)===DEMO_END===/);
  if (demoMatch) {
    return safeParseJSON<{ language: string; filename: string; code: string; instructions: string }>(demoMatch[1], 'retryDemo');
  }
  return null;
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

  let fullText = '';
  let currentPhase: DigestPhase = 'capture';

  // 阶段顺序，只允许单向前进
  const phaseOrder: DigestPhase[] = ['capture', 'trace', 'analyze', 'practice', 'archive'];
  let currentPhaseIdx = 0;

  try {
    const q = query({
      prompt: `请对以下链接进行完整的研究分析：${url}${scrapeNote}`,
      options: {
        systemPrompt: buildSystemPrompt(scraped),
        cwd: process.cwd(),
        allowedTools: ['WebFetch', 'WebSearch', 'Read', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        maxTurns: 25,
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
              analyze: '正在深度分析...',
              practice: '正在生成 Demo...',
              archive: '正在生成报告...',
            };
            send('phase', { phase, label: labels[phase] || phase });
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

    // Demo 缺失补生成：有分析结果但没 demo 时，追问一轮
    let finalDemo: { language: string; filename: string; code: string; instructions: string } | null = parsed.demo;
    if (!finalDemo && parsed.analysis) {
      send('phase', { phase: 'practice', label: '正在补生成 Demo...' });
      try {
        finalDemo = await retryDemo(url, parsed.analysis, parsed.report, abortController);
      } catch {
        // 补生成失败不影响主流程
      }
    }

    // 构建知识库条目
    const entry: DigestEntry = {
      id: sessionId,
      url,
      title: parsed.title || url,
      date: new Date().toISOString(),
      tags: parsed.analysis?.tags || [],
      tldr: parsed.analysis?.tldr || '',
      analysis: parsed.analysis || {
        tldr: '',
        keyPoints: [],
        technical: '',
        significance: '',
        limitations: '',
        comparison: '',
        tags: [],
      },
      sources: parsed.sources,
      demo: finalDemo || undefined,
      fullMarkdown: parsed.report || fullText,
    };

    // 保存到知识库
    await saveEntry(entry);

    send('analysis', entry.analysis);
    if (entry.demo) {
      send('demo', entry.demo);
    }
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
