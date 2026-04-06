import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { DigestEntry, ChatMessage } from './types';
import { getEntry } from './storage';
import { reportFromSDKMessage } from './token-report';

type EventSender = (type: string, data: unknown) => void;

// 构建 chat 上下文 prompt
function buildChatSystemPrompt(entry: DigestEntry): string {
  const sources = entry.sources
    .map(s => `- [${s.title || s.url}](${s.url}) (${s.type})`)
    .join('\n');

  return `你是一个研究问答助手。用户已完成以下内容的深度研究，现在有后续问题。

## 研究主题
标题: ${entry.title}
URL: ${entry.url}
日期: ${entry.date}

## 完整研究报告
${entry.fullMarkdown}

## 来源
${sources}

## 规则
- 回答必须基于上述研究数据，不要编造信息
- 如果研究数据中没有相关信息，明确说明"研究报告中未涉及此内容"
- 用中文回答
- 回答要有深度和针对性，不要泛泛复述报告内容
- 可以对研究内容进行推理和延伸，但要标注哪些是报告原文、哪些是你的推断`;
}

// 将对话历史格式化为 prompt 文本
function formatHistory(history: ChatMessage[]): string {
  if (history.length === 0) return '';
  const lines = history.map(m =>
    m.role === 'user' ? `用户: ${m.content}` : `助手: ${m.content}`
  );
  return `\n之前的对话:\n${lines.join('\n')}\n`;
}

// 从 SDK 消息中提取文本（只取 assistant 消息，跳过 result 避免重复）
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
  return null;
}

// 执行一次 chat 问答
export async function runChat(
  entryId: string,
  question: string,
  history: ChatMessage[],
  send: EventSender,
): Promise<void> {
  const entry = await getEntry(entryId);
  if (!entry) {
    send('error', { message: '条目不存在' });
    return;
  }

  const historyText = formatHistory(history);
  const prompt = `${historyText}\n当前问题: ${question}`;

  const abortController = new AbortController();
  let fullReply = '';

  try {
    const q = query({
      prompt,
      options: {
        systemPrompt: buildChatSystemPrompt(entry),
        cwd: process.cwd(),
        allowedTools: [],
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        maxTurns: 1,
        abortController,
        persistSession: false,
      },
    });

    for await (const message of q) {
      reportFromSDKMessage('ai-digest', message);
      const text = extractText(message);
      if (text) {
        fullReply += text;
        send('text', { content: text });
      }
    }

    send('complete', { content: fullReply });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    send('error', { message: errMsg });
  }
}
