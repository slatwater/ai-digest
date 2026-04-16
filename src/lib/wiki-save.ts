import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { TriageEntry, WikiCategory, WikiItemSummary, ChatMessage } from './types';
import { getWikiCategories, getWikiIndex } from './storage';
import { reportFromSDKMessage } from './token-report';
import type { ExpandStage } from '@/hooks/useExpand';

type EventSender = (type: string, data: unknown) => void;

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

// 构建 agent 上下文
function buildContext(
  entry: TriageEntry,
  stages: ExpandStage[],
  categories: WikiCategory[],
  items: WikiItemSummary[],
): string {
  const parts: string[] = [];

  // 解析结果
  parts.push('## 解析结果');
  parts.push(`标题: ${entry.title}`);
  parts.push(`URL: ${entry.url}`);
  if (entry.narrative) parts.push(`\n叙述:\n${entry.narrative}`);
  if (entry.concepts?.length) {
    parts.push('\n识别到的技术:');
    for (const c of entry.concepts) {
      parts.push(`- **${c.name}** (${c.role || 'component'}): ${c.root}`);
      if (c.whatItEnables) parts.push(`  用途: ${c.whatItEnables}`);
      if (c.sourceUrl) parts.push(`  来源: ${c.sourceUrl}`);
    }
  }
  if (entry.sources?.length) {
    parts.push('\n来源链接:');
    for (const s of entry.sources) parts.push(`- [${s.type}] ${s.title}: ${s.url}`);
  }

  // 深入对话
  if (stages.length > 0) {
    parts.push('\n## 深入对话记录');
    for (const stage of stages) {
      parts.push(`\nQ: ${stage.question}`);
      if (stage.answer) parts.push(`A: ${stage.answer}`);
    }
  }

  // 现有分类
  parts.push('\n## 现有 Wiki 分类');
  if (categories.length === 0) {
    parts.push('（暂无分类，你可以建议新建）');
  } else {
    for (const cat of categories) {
      const count = items.filter(i => i.categoryId === cat.id).length;
      parts.push(`- [${cat.id}] ${cat.name}（${count} 个条目）`);
    }
  }

  // 现有条目
  if (items.length > 0) {
    parts.push('\n## 现有 Wiki 条目');
    for (const item of items) {
      parts.push(`- ${item.name}（分类: ${item.categoryId}）`);
    }
  }

  return parts.join('\n');
}

const SYSTEM_PROMPT = `你是一个知识管理助手。用户在深入研究一个技术话题后，想把关键知识存入 Wiki。

## 你的任务
根据用户的解析结果和深入对话记录，整理出一个 Wiki 条目方案：
1. 建议分类（从现有分类中选择，或建议新建）
2. 建议条目名称
3. 设计内容结构——段落标题和内容由你根据实际内容决定，不用固定模板
4. 整理来源链接

## 输出格式
准备好方案后，输出以下 JSON（用 \`\`\`json 代码块包裹）：

\`\`\`json
{
  "name": "条目名称",
  "categoryId": "现有分类id",
  "newCategory": null,
  "sections": [
    { "heading": "段落标题", "content": "markdown 内容" }
  ],
  "sourceLinks": [
    { "url": "...", "title": "...", "type": "original" }
  ]
}
\`\`\`

如果建议新建分类，将 categoryId 设为空字符串，newCategory 设为 { "name": "分类名" }。

## 工作规则
- 先从已有上下文（解析结果 + 对话记录）整理内容，可以用 WebFetch 补充来源链接的信息
- 段落结构根据内容性质灵活决定，如"核心原理 + 使用场景 + 局限性"或"定义 + 技术架构 + 对比"等
- 内容精炼，有信息密度，不空泛描述
- 来源链接从上下文中提取，补充 type 标注
- 用中文输出

## 关键规则（违反则输出无效）
**每一次回复的末尾必须附带完整 JSON 代码块**，无论用户是在询问、调整还是确认。
- 首轮：整理方案并输出 JSON
- 用户提问/调整：简短回答后，必须重新输出完整 JSON（含调整后的内容）
- 用户确认：必须再次输出完整 JSON（保持不变也要输出）
- 禁止只说"已确认"、"可以使用了"而不附 JSON。前端需要解析 JSON 才能显示「确认存入」按钮。`;

// 解析 agent 输出中的 JSON 方案（容忍多种格式）
function extractProposal(text: string): Record<string, unknown> | null {
  // 方案 1：标准 ```json 代码块
  const jsonBlock = text.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[1].trim());
      if (isValidProposal(parsed)) return parsed;
    } catch { /* fall through */ }
  }

  // 方案 2：直接找包含 name + sections 字段的 JSON 对象
  // 从后往前找（最新的方案），匹配最外层大括号
  const matches = [...text.matchAll(/\{[\s\S]*?"sections"[\s\S]*?\}/g)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const raw = matches[i][0];
    // 尝试找完整的括号闭合
    let depth = 0;
    let end = -1;
    for (let j = 0; j < raw.length; j++) {
      if (raw[j] === '{') depth++;
      else if (raw[j] === '}') {
        depth--;
        if (depth === 0) { end = j + 1; break; }
      }
    }
    if (end > 0) {
      try {
        const parsed = JSON.parse(raw.slice(0, end));
        if (isValidProposal(parsed)) return parsed;
      } catch { /* continue */ }
    }
  }

  return null;
}

function isValidProposal(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return typeof o.name === 'string' && Array.isArray(o.sections);
}

export async function runWikiSave(
  entry: TriageEntry,
  stages: ExpandStage[],
  userMessage: string,
  history: ChatMessage[],
  send: EventSender,
): Promise<void> {
  const [categories, items] = await Promise.all([getWikiCategories(), getWikiIndex()]);
  const context = buildContext(entry, stages, categories, items);

  // 构建 prompt：首轮自动生成方案，后续轮次带用户调整
  let prompt: string;
  if (history.length === 0) {
    prompt = `${context}\n\n请根据以上内容，整理出一个 Wiki 条目方案。`;
    if (userMessage.trim()) {
      prompt += `\n\n用户补充: ${userMessage}`;
    }
  } else {
    const historyText = history.map(m =>
      m.role === 'user' ? `用户: ${m.content}` : `助手: ${m.content}`
    ).join('\n');
    prompt = `${context}\n\n之前的对话:\n${historyText}\n\n用户: ${userMessage}`;
  }

  let fullReply = '';

  try {
    const q = query({
      prompt,
      options: {
        systemPrompt: SYSTEM_PROMPT,
        cwd: process.cwd(),
        allowedTools: ['WebFetch'],
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        maxTurns: 4,
        abortController: new AbortController(),
        persistSession: false,
      },
    });

    let proposalSent = false;

    for await (const message of q) {
      reportFromSDKMessage('aidigest', message);

      if (message.type === 'assistant') {
        const blocks = message.message?.content;
        if (Array.isArray(blocks)) {
          const hasToolUse = blocks.some((b: { type: string }) => b.type === 'tool_use');
          if (hasToolUse) {
            for (const block of blocks) {
              if (block.type === 'tool_use' && typeof block.name === 'string') {
                send('tool_status', { label: '正在补充信息...' });
              }
            }
          } else {
            const text = blocks
              .filter((b: { type: string }) => b.type === 'text')
              .map((b: { type: string; text?: string }) => b.text ?? '')
              .join('');
            if (text) {
              fullReply += text;
              send('text', { content: text });

              // 实时检测：一旦 JSON 完整就推送 proposal
              if (!proposalSent) {
                const proposal = extractProposal(fullReply);
                if (proposal) {
                  send('proposal', proposal);
                  proposalSent = true;
                }
              }
            }
          }
        }
      }
    }

    // 最后再兜底检查一次（可能 SSE 中途没捕获到）
    if (!proposalSent) {
      const proposal = extractProposal(fullReply);
      if (proposal) send('proposal', proposal);
    }

    send('done', {});
  } catch (error) {
    send('error', { message: error instanceof Error ? error.message : String(error) });
  }
}
