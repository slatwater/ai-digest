import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { WikiEntry } from './types';
import { getWikiEntries, getWikiEntriesByIds } from './storage';
import { reportFromSDKMessage } from './token-report';

type EventSender = (type: string, data: unknown) => void;

// 程序化预计算结构性问题
function computeStructuralIssues(entries: WikiEntry[]): string {
  const issues: string[] = [];
  const allIds = new Set(entries.map(e => e.id));

  // 孤立概念：没有任何关系
  const orphaned = entries.filter(e => e.relations.length === 0);
  if (orphaned.length > 0) {
    issues.push(`### 孤立概念（无关系）\n${orphaned.map(e => `- ${e.name} (${e.id})`).join('\n')}`);
  }

  // 缺失双向关系
  const missingReverse: string[] = [];
  for (const entry of entries) {
    for (const rel of entry.relations) {
      const target = entries.find(e => e.id === rel.conceptId);
      if (target && !target.relations.some(r => r.conceptId === entry.id)) {
        missingReverse.push(`- ${entry.name} → ${target.name} (${rel.type}) 无反向关系`);
      }
    }
  }
  if (missingReverse.length > 0) {
    issues.push(`### 缺失双向关系\n${missingReverse.join('\n')}`);
  }

  // 悬空引用：指向不存在的概念
  const dangling: string[] = [];
  for (const entry of entries) {
    for (const rel of entry.relations) {
      if (!allIds.has(rel.conceptId)) {
        dangling.push(`- ${entry.name} 引用了不存在的概念: ${rel.conceptId}`);
      }
    }
  }
  if (dangling.length > 0) {
    issues.push(`### 悬空引用\n${dangling.join('\n')}`);
  }

  return issues.length > 0
    ? `## 结构性问题（程序检测）\n\n${issues.join('\n\n')}`
    : '## 结构性问题（程序检测）\n\n未发现结构性问题。';
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

// 执行 Wiki 健康检查
export async function runWikiLint(send: EventSender): Promise<void> {
  const index = await getWikiEntries();
  if (index.length === 0) {
    send('text', { content: 'Wiki 为空，没有可分析的词条。' });
    send('complete', { content: '' });
    return;
  }

  const entries = await getWikiEntriesByIds(index.map(i => i.id));

  // 先输出程序化检测结果
  const structuralReport = computeStructuralIssues(entries);
  send('text', { content: structuralReport + '\n\n' });

  // 构建 LLM 语义分析的上下文
  const entrySections = entries.map((e: WikiEntry) => {
    const rels = e.relations.map(r => `  ${r.type} → ${r.conceptName}: ${r.description}`).join('\n');
    return `### ${e.name} [${e.id}]
领域: ${e.domain}
来源: ${e.sources.length} 篇 (${e.sources.map(s => s.entryTitle).join(', ')})
关系:\n${rels || '  (无)'}
概要: ${e.summary}

${e.content}`;
  }).join('\n\n---\n\n');

  const systemPrompt = `你是一个知识库健康审计专家。用户有一个 AI 前沿技术的 Wiki 知识库，你需要对其进行深度语义分析。

程序已自动检测了结构性问题（孤立概念、缺失双向关系、悬空引用），你不需要重复这些。

你的任务是发现**程序无法检测的语义问题**：

## 输出格式（Markdown）

### 1. 内容矛盾
不同词条对同一事实有不同表述或矛盾结论。引用具体词条和段落。

### 2. 建议新增关系
基于语义分析，发现应该存在但尚未记录的概念间关系。说明关系类型和理由。

### 3. 知识空白
词条中引用或暗示了某些技术/概念，但知识库中没有对应词条。列出值得研究的空白。

### 4. 质量问题
内容过于简略、概要与正文不一致、过时信息等。

### 5. 研究建议
基于知识库当前积累，建议下一步值得深入研究的方向或问题。

## 规则
- 每个发现都要引用具体词条名
- 宁缺毋滥，不要为了输出而凑数
- 如果某个类别没有发现，写"未发现"
- 用中文输出`;

  const prompt = `请分析以下 ${entries.length} 个 Wiki 词条的健康状况：\n\n${entrySections}`;

  let fullReply = '';
  try {
    const q = query({
      prompt,
      options: {
        systemPrompt,
        cwd: process.cwd(),
        allowedTools: [],
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        maxTurns: 3,
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
