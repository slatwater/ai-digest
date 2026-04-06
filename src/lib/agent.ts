import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { v4 as uuidv4 } from 'uuid';
import { execFile } from 'child_process';
import path from 'path';
import { DigestPhase, QuestionEvent, DigestEntry, AnalysisResult, AnalysisConcept, SourceInfo } from './types';
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

  return `你是一个 AI 前沿技术深度研究助手。你的任务是：识别文章涉及的具名技术，分析它们如何组合，产出可积累的知识。

## 什么是"具名技术"
有明确名称、可查证来源的技术/方法/算法/框架。例如：KV Cache、LoRA、Speculative Decoding、vLLM。
不是具名技术的：文章观点、公司动态、模糊描述。

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
分析文章如何组合上述技术。

- 用 composed-of 关系连接组合技术与其组成部分
- 说清楚组合的创新点
- 输出能解决什么实际问题

输出结构化 JSON（用 ===ANALYSIS_START=== 和 ===ANALYSIS_END=== 包裹）:
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

输出规则：
- concepts 中的 name 必须是公认名称，不是自创概念名
- 已知技术必须复用 Wiki 中的 id 和名称，禁止重复创建
- 组合技术通过 composed-of 关系指向其组成部分
- isNew 严格基于 Wiki 列表判断

### 阶段 5: 归档 (Archive)
- 生成完整的 Markdown 研究报告
- 报告格式（用 ===REPORT_START=== 和 ===REPORT_END=== 包裹）:
===REPORT_START===
# 标题

> TLDR

## 来源
- [来源名](URL)

## 结构分解
（用文字描述组合概念由哪些原子组成，创新点是什么）

## 概念名 1
### 是什么
...
### 能做什么
...
### 现状与局限
...

## 概念名 2
...

## 横向对比
...

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

// Demo 生成：通过本地 Codex CLI（ChatGPT OAuth 登录态）执行
async function generateDemo(
  url: string,
  analysis: AnalysisResult,
  report: string,
  abortController: AbortController,
): Promise<{ language: string; filename: string; code: string; instructions: string } | null> {
  const conceptContext = analysis.concepts?.length
    ? analysis.concepts.map(c => `### ${c.name}\n${c.summary}\n${c.what?.slice(0, 400)}`).join('\n\n')
    : `核心要点: ${analysis.keyPoints?.join('; ') || ''}\n技术分析: ${analysis.technical?.slice(0, 800) || ''}`;

  const context = `
## 项目信息
- URL: ${url}
- TLDR: ${analysis.tldr}

## 核心概念
${conceptContext}
${report ? `\n## 研究报告摘要\n${report.slice(0, 1500)}` : ''}
`.trim();

  const demoPrompt = `你是一个前端 Demo 生成专家。基于以下研究内容，生成一个可交互的浏览器 Demo。不要读取任何文件，不要执行任何命令，直接输出。所有输出用中文。

${context}

要求：
1. 纯 HTML/CSS/JS 单文件，可直接在 iframe 中运行
2. 禁止依赖外部 CDN 或网络资源
3. 必须有交互性（点击、输入、动画等）
4. 所有展示内容必须基于上面的真实研究数据，禁止编造
5. 视觉精致，体现设计感

严格按以下格式输出，不要输出其他内容：

===INSTRUCTIONS===
一句话说明这个 demo 展示了什么
===HTML_START===
完整的 HTML 文件内容（<!DOCTYPE html> 开头）
===HTML_END===`;

  const outputFile = path.join(process.cwd(), 'data', `.demo-output-${Date.now()}.txt`);

  try {
    const codexBin = path.join(process.cwd(), 'node_modules', '.bin', 'codex');
    const { stdout } = await execFileAsync(codexBin, [
      'exec',
      '-c', 'model_reasoning_effort=medium',
      '--sandbox', 'read-only',
      '--ephemeral',
      '--skip-git-repo-check',
      '-o', outputFile,
      demoPrompt,
    ], {
      timeout: 4 * 60 * 1000,
      signal: abortController.signal,
      cwd: '/tmp',
    });

    // 优先从 -o 输出文件读取，fallback 到 stdout
    let demoText = '';
    try {
      const fs = await import('fs/promises');
      demoText = await fs.readFile(outputFile, 'utf-8');
    } catch {
      demoText = stdout;
    }

    // 清理临时文件
    try { const fs = await import('fs/promises'); await fs.unlink(outputFile); } catch { /* 忽略 */ }

    // 解析纯文本标记（避免 JSON 转义问题）
    const htmlMatch = demoText.match(/===HTML_START===([\s\S]*?)===HTML_END===/);
    if (htmlMatch) {
      const code = htmlMatch[1].trim();
      const instrMatch = demoText.match(/===INSTRUCTIONS===\s*\n?([\s\S]*?)===HTML_START===/);
      const instructions = instrMatch?.[1]?.trim() || 'Demo';
      return { language: 'html', filename: 'demo.html', code, instructions };
    }

    // fallback: 兼容旧的 JSON 标记格式
    const jsonMatch = demoText.match(/===DEMO_START===([\s\S]*?)===DEMO_END===/);
    if (jsonMatch) {
      const parsed = safeParseJSON<{ language: string; filename: string; code: string; instructions: string }>(jsonMatch[1], 'generateDemo');
      if (parsed) return parsed;
    }

    console.warn('[demo] Codex 输出中未找到 Demo 标记，输出前 500 字:', demoText.slice(0, 500));
    return null;
  } catch (err) {
    console.warn('[demo] Codex Demo 生成失败:', (err as Error).message);
    return null;
  }
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

  // 阶段顺序：采集→溯源→分解→组合分析→归档（practice 由独立 Agent 处理）
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
              decompose: '正在分解原子概念...',
              compose: '正在分析组合创新...',
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

    // Demo 由独立 Agent 生成（干净上下文，不累积主流程 tokens）
    let finalDemo: { language: string; filename: string; code: string; instructions: string } | null = null;
    if (parsed.analysis) {
      send('phase', { phase: 'practice', label: '正在生成 Demo...' });
      try {
        finalDemo = await generateDemo(url, parsed.analysis, parsed.report, abortController);
        if (!finalDemo) {
          console.warn('[demo] generateDemo 返回 null，Demo 标记未匹配');
          send('text', { content: '\n⚠️ Demo 生成未返回有效结果，已跳过\n', phase: 'practice' });
        }
      } catch (err) {
        console.error('[demo] generateDemo 异常:', err);
        send('text', { content: `\n⚠️ Demo 生成失败: ${(err as Error).message}\n`, phase: 'practice' });
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
      entryType: 'researched',
      analysis: parsed.analysis || {
        tldr: '',
        tags: [],
      },
      sources: parsed.sources,
      demo: finalDemo || undefined,
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
