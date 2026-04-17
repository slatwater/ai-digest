import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { TriageEntry } from './types';
import { reportFromSDKMessage } from './token-report';

// SSE 事件发送器
type EventSender = (type: string, data: unknown) => void;

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

// 从 triage 数据构建上下文（只用解析结论 + 一手来源，不传二手原文）
function buildContext(entry: TriageEntry): string {
  const parts: string[] = [];

  parts.push(`## 文章信息`);
  parts.push(`标题: ${entry.title}`);
  parts.push(`URL: ${entry.url}`);

  if (entry.narrative) {
    parts.push(`\n## 解析叙述\n${entry.narrative}`);
  }

  if (entry.concepts?.length) {
    parts.push(`\n## 识别到的技术`);
    for (const c of entry.concepts) {
      parts.push(`- **${c.name}** (${c.role || 'component'}): ${c.root}`);
      if (c.sourceUrl) parts.push(`  一手来源: ${c.sourceUrl}`);
    }
  }

  if (entry.sources?.length) {
    parts.push(`\n## 一手来源`);
    for (const s of entry.sources) {
      parts.push(`- [${s.type}] ${s.title}: ${s.url}`);
    }
  }

  return parts.join('\n');
}

// 活跃的 expand 会话：expandSessionId → sdkSessionId
const expandSessions = new Map<string, { sdkSessionId: string; lastAccess: number }>();
const EXPAND_TTL = 60 * 60 * 1000; // 1 小时
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of expandSessions) {
    if (now - entry.lastAccess > EXPAND_TTL) expandSessions.delete(id);
  }
}, 5 * 60 * 1000);

// 外部调用：新会话时重置
export function resetExpandSession(expandSessionId: string): void {
  expandSessions.delete(expandSessionId);
}

// 运行自由提问深入
export async function runExpand(
  entry: TriageEntry,
  question: string,
  expandSessionId: string,
  send: EventSender,
): Promise<void> {
  if (!question.trim()) {
    send('error', { message: '请输入问题' });
    return;
  }

  const existing = expandSessions.get(expandSessionId);
  const isResume = !!existing;

  const systemPrompt = `你是一个技术深度研究助手。用户对一篇文章做了初步解析，正在就具体问题深入了解。

## 工作方式
1. 上下文中提供了一手来源 URL，必要时用 WebFetch 读取最相关的 1-2 个来源获取详细信息
2. 如果来源不够，用 WebSearch 补充搜索（最多 1 次）
3. 结合已有对话记忆和获取到的信息写出精炼的回答

## 输出要求
- 中文 markdown，篇幅 300-500 字
- 只回答当前问题，不要发散
- 不要在结尾列后续方向或延伸阅读
- 工具调用控制在 2-3 次以内
- 如果当前问题和之前问题相关，请基于之前的回答继续深化，不要重复来源读取`;

  // 首次：带完整上下文；续问：只传新问题，SDK resume 会保留上下文
  const userPrompt = isResume
    ? question
    : `## 初步解析\n${buildContext(entry)}\n\n## 要深入的问题\n${question}`;

  const abortController = new AbortController();

  try {
    send('question', { question });

    const queryOptions: Record<string, unknown> = {
      systemPrompt,
      cwd: process.cwd(),
      allowedTools: ['WebFetch', 'WebSearch'],
      disallowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      maxTurns: 8,
      abortController,
      persistSession: true,
    };
    if (existing) {
      queryOptions.resume = existing.sdkSessionId;
    }

    const q = query({
      prompt: userPrompt,
      options: queryOptions as Parameters<typeof query>[0]['options'],
    });

    let lastText = '';
    let capturedSdkId: string | null = existing?.sdkSessionId || null;
    let turnCount = 0;

    console.log(`[expand-log] === 开始深入 [resume=${isResume}] prompt_chars=${userPrompt.length} ===`);

    for await (const message of q) {
      reportFromSDKMessage('aidigest', message);

      // 捕获 SDK session ID（首次会话）
      if (!capturedSdkId) {
        const sid = (message as { session_id?: string }).session_id;
        if (sid) {
          capturedSdkId = sid;
          expandSessions.set(expandSessionId, { sdkSessionId: sid, lastAccess: Date.now() });
        }
      } else {
        // 续问：更新 lastAccess
        const entry = expandSessions.get(expandSessionId);
        if (entry) entry.lastAccess = Date.now();
      }

      if (message.type === 'assistant') {
        turnCount++;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const usage = (message.message as any)?.usage;
        const blocks = message.message?.content || [];
        const toolUses = (blocks as { type: string; name?: string }[]).filter(b => b.type === 'tool_use');
        const toolNames = toolUses.map(b => b.name || '?').join(', ');
        console.log(`[expand-log] turn=${turnCount} | input=${usage?.input_tokens ?? '?'} output=${usage?.output_tokens ?? '?'} cache_read=${usage?.cache_read_input_tokens ?? 0} | tools=[${toolNames || 'none'}]`);
        if (Array.isArray(blocks)) {
          // 提取文本（无论是否有 tool_use）
          const text = blocks
            .filter((b: { type: string }) => b.type === 'text')
            .map((b: { type: string; text?: string }) => b.text ?? '')
            .join('');

          const hasToolUse = blocks.some((b: { type: string }) => b.type === 'tool_use');

          if (hasToolUse) {
            for (const block of blocks) {
              if (block.type === 'tool_use' && typeof block.name === 'string') {
                const labels: Record<string, string> = {
                  WebSearch: '正在搜索...',
                  WebFetch: '正在抓取...',
                };
                if (labels[block.name]) {
                  send('tool_status', { label: labels[block.name] });
                }
              }
            }
          }

          // 纯文本轮次覆盖式发送，含工具轮次也暂存文本
          if (text) {
            lastText = text;
            if (!hasToolUse) {
              send('replace', { content: text });
            }
          }
        }
      }

      // result 消息：最终回答可能只在这里
      if (message.type === 'result') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg = message as any;
        const u = msg.usage;
        console.log(`[expand-log] === 结束 ===`);
        console.log(`[expand-log] total: turns=${msg.num_turns ?? turnCount} input=${u?.input_tokens ?? '?'} output=${u?.output_tokens ?? '?'} cache_read=${u?.cache_read_input_tokens ?? 0} cost=$${msg.total_cost_usd ?? '?'} stop=${msg.stop_reason ?? msg.subtype} duration=${msg.duration_ms ?? '?'}ms`);

        if (message.subtype === 'success' && message.result) {
          lastText = message.result;
          send('replace', { content: message.result });
        } else if (message.subtype === 'error_max_turns') {
          // agent 用完轮次：优先用 result 文本，否则用暂存文本
          const fallback = (message as { result?: string }).result || lastText;
          if (fallback) {
            lastText = fallback;
            send('replace', { content: fallback });
          } else {
            send('replace', { content: '回答生成超时，请重试或换一个问题。' });
          }
        }
      }
    }

    // 兜底：如果从未发过 replace 但有文本，补发
    if (lastText) {
      send('replace', { content: lastText });
    }

    send('done', {});
  } catch (error) {
    send('error', { message: error instanceof Error ? error.message : String(error) });
  }
}
