import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { DigestEntry, WikiEntry, WikiIndexEntry } from './types';
import { getWikiEntries, getWikiEntry, saveWikiEntry } from './storage';
import { reportFromSDKMessage } from './token-report';

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

// 修复 JSON 中字符串值内的裸换行符
function fixJsonNewlines(text: string): string {
  let inString = false;
  let escaped = false;
  let result = '';
  for (const ch of text) {
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      result += ch;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (ch === '\n' && inString) {
      result += '\\n';
      continue;
    }
    result += ch;
  }
  return result;
}

function buildCompilerPrompt(entry: DigestEntry, existingWiki: WikiIndexEntry[]): string {
  const existingContext = existingWiki.length > 0
    ? existingWiki.map(c => `- [${c.id}] ${c.name} (${c.domain}): ${c.summary}`).join('\n')
    : '（暂无已有词条）';

  return `你是一个知识编译器。从深度研究报告中提取核心概念，构建 Wiki。

## 已有 Wiki
${existingContext}

## 任务
阅读下面的研究报告，提取 2-5 个核心概念。

对每个概念：
1. 如果与已有 Wiki 中的某个词条**本质相同**（名字不同但指同一技术/理论），使用已有词条的 id，输出更新后的完整内容
2. 如果是全新概念，创建新的

## 词条质量要求
- 每个词条必须是一个**独立的技术实体**（算法、架构、方法论、范式），不是文章观点或事件
- summary: 2-3 句话说清楚是什么、解决什么问题
- content: 详细的 markdown 正文，结构为：
  - ## 是什么（原理、来源）
  - ## 能做什么（应用场景、生产价值）
  - ## 现状与局限
- relations: 与其他词条（包括本次提取的+已有的）的关系
- domain: 归属领域，如 "AI Safety", "LLM Inference", "Agent Architecture" 等

## 输出格式
输出一个 JSON 数组，用标记包裹：
===WIKI_START===
[
  {
    "id": "kebab-case-slug",
    "name": "概念中文名",
    "aliases": ["English Name", "别名"],
    "domain": "领域",
    "summary": "2-3句概要",
    "content": "## 是什么\\n...\\n\\n## 能做什么\\n...\\n\\n## 现状与局限\\n...",
    "relations": [
      { "conceptId": "other-slug", "conceptName": "其他概念", "type": "related", "description": "关系说明" }
    ],
    "tags": ["tag1", "tag2"]
  }
]
===WIKI_END===

关系 type 可选值: builds-on, contrasts, related, enables, part-of

重要：JSON 字符串值中的换行必须用 \\n 转义，不能有裸换行符。确保输出是合法的 JSON。

## 研究报告
标题: ${entry.title}
URL: ${entry.url}
日期: ${entry.date}

${entry.fullMarkdown}`;
}

interface ExtractedConcept {
  id: string;
  name: string;
  aliases: string[];
  domain: string;
  summary: string;
  content: string;
  relations: { conceptId: string; conceptName: string; type: string; description: string }[];
  tags: string[];
}

export async function compileWiki(entry: DigestEntry): Promise<void> {
  if (entry.entryType === 'saved') {
    console.log(`[compiler] 跳过留底条目: ${entry.title}`);
    return;
  }

  const existingWiki = await getWikiEntries();
  const prompt = buildCompilerPrompt(entry, existingWiki);

  const abortController = new AbortController();
  // 5 分钟超时
  const timeout = setTimeout(() => abortController.abort(), 5 * 60 * 1000);

  let fullText = '';

  try {
    const q = query({
      prompt,
      options: {
        systemPrompt: '你是一个知识编译器。只输出 ===WIKI_START=== 和 ===WIKI_END=== 包裹的 JSON，不要输出其他内容。',
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
      if (abortController.signal.aborted) break;
      reportFromSDKMessage('ai-digest', message);
      const text = extractText(message);
      if (text) fullText += text;
    }
  } finally {
    clearTimeout(timeout);
  }

  // 解析 Wiki
  const match = fullText.match(/===WIKI_START===([\s\S]*?)===WIKI_END===/);
  if (!match) {
    console.warn('[compiler] 未找到 Wiki 标记');
    return;
  }

  let extracted: ExtractedConcept[];
  try {
    let raw = match[1].trim().replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
    try {
      extracted = JSON.parse(raw);
    } catch {
      // 修复 JSON 字符串值中的裸换行符：逐行扫描，在字符串值内部的换行替换为 \\n
      raw = fixJsonNewlines(raw);
      extracted = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[compiler] Wiki JSON 解析失败:', (e as Error).message);
    return;
  }

  if (!Array.isArray(extracted) || extracted.length === 0) return;

  const now = new Date().toISOString();
  const sourceRef = {
    entryId: entry.id,
    entryTitle: entry.title,
    date: entry.date,
    contribution: entry.analysis?.tldr || entry.tldr || entry.title,
  };

  for (const raw of extracted) {
    // 检查是否已存在（合并更新）
    const existing = await getWikiEntry(raw.id);

    if (existing) {
      // 合并：追加来源，更新内容，合并关系
      const hasSource = existing.sources.some(s => s.entryId === entry.id);
      const mergedSources = hasSource ? existing.sources : [...existing.sources, sourceRef];

      const existingRelIds = new Set(existing.relations.map(r => r.conceptId));
      const newRelations = (raw.relations || []).filter(r => !existingRelIds.has(r.conceptId));

      const merged: WikiEntry = {
        ...existing,
        content: raw.content || existing.content,
        summary: raw.summary || existing.summary,
        aliases: [...new Set([...existing.aliases, ...(raw.aliases || [])])],
        tags: [...new Set([...existing.tags, ...(raw.tags || [])])],
        relations: [...existing.relations, ...newRelations] as WikiEntry['relations'],
        sources: mergedSources,
        updatedAt: now,
      };
      await saveWikiEntry(merged);
      console.log(`[compiler] 更新词条: ${merged.name} (${merged.id})`);
    } else {
      // 新建
      const wikiEntry: WikiEntry = {
        id: raw.id,
        name: raw.name,
        aliases: raw.aliases || [],
        domain: raw.domain || 'Uncategorized',
        summary: raw.summary,
        content: raw.content,
        relations: (raw.relations || []) as WikiEntry['relations'],
        sources: [sourceRef],
        tags: raw.tags || [],
        createdAt: now,
        updatedAt: now,
      };
      await saveWikiEntry(wikiEntry);
      console.log(`[compiler] 新建词条: ${wikiEntry.name} (${wikiEntry.id})`);
    }
  }

  console.log(`[compiler] 编译完成: 从 "${entry.title}" 提取了 ${extracted.length} 个词条`);
}
