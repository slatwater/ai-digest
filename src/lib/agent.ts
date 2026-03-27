import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { v4 as uuidv4 } from 'uuid';
import { DigestPhase, QuestionEvent, DigestEntry, AnalysisResult, SourceInfo } from './types';
import { saveEntry } from './storage';

// 活跃的 digest 会话
interface ActiveSession {
  id: string;
  url: string;
  phase: DigestPhase;
  abortController: AbortController;
  questionResolver?: (answer: string) => void;
  claudeSessionId?: string;
}

const activeSessions = new Map<string, ActiveSession>();

export function getSession(sessionId: string) {
  return activeSessions.get(sessionId);
}

// 用于 SSE 的事件发送器
type EventSender = (type: string, data: unknown) => void;

// 构建 Agent 的系统提示词
function buildSystemPrompt(): string {
  return `你是一个 AI 前沿技术研究助手。你的任务是深入分析用户提供的链接内容，进行多维度研究。

## 工作流程

你需要按照以下阶段依次完成工作，每完成一个阶段输出对应的 JSON 标记：

### 阶段 1: 采集 (Capture)
- 使用 Bash 工具运行 scrapling 脚本抓取链接内容
- 命令: python3 scripts/scrape.py "<URL>"
- 如果抓取失败，使用 WebFetch 作为备用方案

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
  "comparison": "与同类技术的对比分析",
  "tags": ["标签1", "标签2", ...]
}
===ANALYSIS_END===

### 阶段 4: 实践 (Practice) — 仅在涉及可运行技术时执行
- 判断是否涉及可以实际演示的技术（如 API、库、算法等）
- 如果是，创建一个最小可运行的 demo
- 输出 demo 信息（用 ===DEMO_START=== 和 ===DEMO_END=== 包裹）:
===DEMO_START===
{
  "language": "python",
  "filename": "demo.py",
  "code": "代码内容",
  "instructions": "运行说明"
}
===DEMO_END===
- 如果不涉及可运行技术，跳过此阶段

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
    try {
      analysis = JSON.parse(analysisMatch[1].trim());
    } catch { /* 解析失败忽略 */ }
  }

  // 解析来源
  const sourcesMatch = fullText.match(/===SOURCES_START===([\s\S]*?)===SOURCES_END===/);
  if (sourcesMatch) {
    try {
      sources = JSON.parse(sourcesMatch[1].trim());
    } catch { /* 解析失败忽略 */ }
  }

  // 解析 Demo
  const demoMatch = fullText.match(/===DEMO_START===([\s\S]*?)===DEMO_END===/);
  if (demoMatch) {
    try {
      demo = JSON.parse(demoMatch[1].trim());
    } catch { /* 解析失败忽略 */ }
  }

  // 解析报告
  const reportMatch = fullText.match(/===REPORT_START===([\s\S]*?)===REPORT_END===/);
  if (reportMatch) {
    report = reportMatch[1].trim();
    // 从报告中提取标题
    const titleMatch = report.match(/^# (.+)$/m);
    if (titleMatch) {
      title = titleMatch[1];
    }
  }

  return { analysis, sources, demo, report, title };
}

// 运行 digest 流程
export async function runDigest(
  url: string,
  send: EventSender,
): Promise<string> {
  const sessionId = uuidv4();
  const abortController = new AbortController();

  const session: ActiveSession = {
    id: sessionId,
    url,
    phase: 'capture',
    abortController,
  };
  activeSessions.set(sessionId, session);

  send('phase', { phase: 'capture', label: '正在采集内容...' });

  let fullText = '';
  let currentPhase: DigestPhase = 'capture';

  try {
    const q = query({
      prompt: `请对以下链接进行完整的研究分析：${url}`,
      options: {
        systemPrompt: buildSystemPrompt(),
        cwd: process.cwd(),
        allowedTools: ['Bash', 'WebFetch', 'WebSearch', 'Read', 'Write', 'Glob', 'Grep'],
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

        // 检测阶段切换
        const phaseMatches = text.matchAll(/===PHASE:(\w+)===/g);
        for (const m of phaseMatches) {
          const phase = m[1] as DigestPhase;
          if (phase !== currentPhase) {
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
      demo: parsed.demo || undefined,
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
