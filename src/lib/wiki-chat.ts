import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { ChatMessage } from './types';
import { getWikiEntries } from './storage';
import { reportFromSDKMessage } from './token-report';
import path from 'path';

type EventSender = (type: string, data: unknown) => void;

// 只加载 Wiki 索引（摘要），不加载全文
async function loadWikiIndex(): Promise<string> {
  const index = await getWikiEntries();
  if (index.length === 0) return '（Wiki 为空，尚无知识积累）';

  return index.map(e => {
    const aliases = e.aliases.length > 0 ? ` (${e.aliases.join(', ')})` : '';
    return `- **${e.name}**${aliases} [${e.domain}] — ${e.summary} (${e.sourceCount} 篇来源, 文件: data/wiki/${e.id}.md)`;
  }).join('\n');
}

function buildWikiChatPrompt(wikiIndex: string): string {
  return `你是一个知识库问答助手。你的知识来源是用户积累的 AI 前沿技术 Wiki。

## Wiki 索引（摘要）

以下是所有词条的摘要。根据问题判断需要深入哪些词条，用 Read 工具读取对应的 .md 文件获取全文。

${wikiIndex}

## 工作方式

1. 先看索引，判断哪些词条与问题相关
2. 用 Read 工具读取相关词条的 .md 文件（路径: data/wiki/<id>.md）
3. 基于读到的全文内容回答
4. 如果需要知识库之外的信息，用 WebSearch 补充

## 你的能力

1. **检索回答**：基于知识库中的内容回答用户问题，引用具体概念和来源
2. **跨概念推理**：发现不同概念之间的联系、对比、组合可能性——即使这些联系在任何单篇来源中都没有被明确提出
3. **识别空白**：当问题涉及知识库未覆盖的领域时，明确指出这是知识空白

## 回答规则

- 回答必须基于知识库内容，明确区分"知识库记载的事实"和"你的推理"
- 引用概念时用 **加粗** 标记概念名
- 如果发现了跨概念的新关联或矛盾，主动指出
- 用中文回答
- 回答要有深度，不要复述词条内容，而是针对问题进行分析和综合
- 使用 WebSearch 补充的信息要标注"来自搜索"`;
}

function formatHistory(history: ChatMessage[]): string {
  if (history.length === 0) return '';
  const lines = history.map(m =>
    m.role === 'user' ? `用户: ${m.content}` : `助手: ${m.content}`
  );
  return `\n之前的对话:\n${lines.join('\n')}\n`;
}

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

// 执行 Wiki 级别的问答
export async function runWikiChat(
  question: string,
  history: ChatMessage[],
  send: EventSender,
): Promise<void> {
  const wikiIndex = await loadWikiIndex();

  const historyText = formatHistory(history);
  const prompt = `${historyText}\n当前问题: ${question}`;

  const abortController = new AbortController();
  let fullReply = '';

  try {
    const q = query({
      prompt,
      options: {
        systemPrompt: buildWikiChatPrompt(wikiIndex),
        cwd: path.join(process.cwd()),
        allowedTools: ['Read', 'Glob', 'Grep', 'WebSearch'],
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        maxTurns: 10,
        abortController,
        persistSession: false,
      },
    });

    for await (const message of q) {
      reportFromSDKMessage('ai-digest', message);

      // 从 assistant 消息的 tool_use block 中检测工具调用，推送状态
      if (message.type === 'assistant') {
        const blocks = message.message?.content;
        if (Array.isArray(blocks)) {
          const toolLabels: Record<string, string> = {
            WebSearch: '正在搜索...',
            WebFetch: '正在抓取网页...',
            Read: '正在读取词条...',
          };
          for (const block of blocks) {
            if (block.type === 'tool_use' && typeof block.name === 'string' && toolLabels[block.name]) {
              send('tool_status', { tool: block.name, label: toolLabels[block.name] });
            }
          }
        }
      }

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
