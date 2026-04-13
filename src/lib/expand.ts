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

// 运行自由提问深入
export async function runExpand(
  entry: TriageEntry,
  question: string,
  send: EventSender,
): Promise<void> {
  if (!question.trim()) {
    send('error', { message: '请输入问题' });
    return;
  }

  const context = buildContext(entry);

  const systemPrompt = `你是一个技术深度研究助手。用户对一篇文章做了初步解析，现在想就某个具体问题深入了解。

## 工作方式
1. 上下文中提供了一手来源 URL，用 WebFetch 读取 1-2 个最相关的来源获取详细信息
2. 如果来源不够，用 WebSearch 补充搜索（最多 1 次）
3. 结合获取到的信息写出精炼的回答：具体数据、机制、对比

## 输出要求
- 中文 markdown，篇幅控制在 300-500 字以内
- 只回答用户问的问题，不要发散到其他话题
- 不要在结尾列后续方向或延伸阅读
- 工具调用控制在 2-3 次以内`;

  const userPrompt = `## 初步解析
${context}

## 要深入的问题
${question}`;

  const abortController = new AbortController();

  try {
    send('question', { question });

    const q = query({
      prompt: userPrompt,
      options: {
        systemPrompt,
        cwd: process.cwd(),
        allowedTools: ['WebFetch', 'WebSearch'],
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        maxTurns: 4,
        abortController,
        persistSession: false,
      },
    });

    for await (const message of q) {
      reportFromSDKMessage('aidigest', message);

      if (message.type === 'assistant') {
        const blocks = message.message?.content;
        if (Array.isArray(blocks)) {
          const hasToolUse = blocks.some((b: { type: string }) => b.type === 'tool_use');

          if (hasToolUse) {
            // 含工具调用的轮次：只推送工具状态
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
          } else {
            // 纯文本轮次：覆盖式发送（前端直接替换，不累加）
            const text = blocks
              .filter((b: { type: string }) => b.type === 'text')
              .map((b: { type: string; text?: string }) => b.text ?? '')
              .join('');
            if (text) {
              send('replace', { content: text });
            }
          }
        }
      }
      // result 消息跳过（与最后 assistant 重复）
    }

    send('done', {});
  } catch (error) {
    send('error', { message: error instanceof Error ? error.message : String(error) });
  }
}
