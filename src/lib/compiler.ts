import { WikiEntry, WikiRelation, AnalysisConcept } from './types';
import { getWikiEntry, getWikiEntries, getWikiEntriesByIds, saveWikiEntry, getEntry } from './storage';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

// 将概念的 what/enables/limitations 组织为 markdown 内容
function buildContent(concept: AnalysisConcept): string {
  return [
    concept.what ? `## 是什么\n\n${concept.what}` : '',
    concept.enables ? `## 能做什么\n\n${concept.enables}` : '',
    concept.limitations ? `## 现状与局限\n\n${concept.limitations}` : '',
  ].filter(Boolean).join('\n\n');
}

// 从深研已提取的概念直接存入 Wiki（无需独立 LLM 调用）
// 新词条直接存，已有词条先 append 再触发重编译
export async function saveConceptsToWiki(
  concepts: AnalysisConcept[],
  entry: { id: string; title: string; date: string; tldr: string },
): Promise<void> {
  if (!concepts || concepts.length === 0) return;

  const now = new Date().toISOString();

  for (const concept of concepts) {
    const sourceRef = {
      entryId: entry.id,
      entryTitle: entry.title,
      date: entry.date,
      contribution: concept.contribution || entry.tldr || entry.title,
    };
    const content = buildContent(concept);
    const existing = await getWikiEntry(concept.id);

    if (existing) {
      // 去重：同一条目不重复写入
      const hasSource = existing.sources.some(s => s.entryId === entry.id);
      if (hasSource) {
        console.log(`[wiki] 跳过词条 ${concept.name}: 来源 ${entry.id} 已存在`);
        continue;
      }

      // 先追加来源和元数据
      const mergedSources = [...existing.sources, sourceRef];
      const existingRelIds = new Set(existing.relations.map(r => r.conceptId));
      const newRelations = (concept.relations || []).filter(r => !existingRelIds.has(r.conceptId));

      const merged: WikiEntry = {
        ...existing,
        content: existing.content, // 暂不动内容，等增量融合
        summary: concept.summary || existing.summary,
        origin: concept.origin || existing.origin,
        aliases: [...new Set([...existing.aliases, ...(concept.aliases || [])])],
        relations: [...existing.relations, ...newRelations] as WikiEntry['relations'],
        sources: mergedSources,
        updatedAt: now,
      };
      await saveWikiEntry(merged);
      console.log(`[wiki] 更新词条元数据: ${merged.name}，累积 ${mergedSources.length} 个来源`);
    } else {
      // 新建：直接用当前内容
      const wikiEntry: WikiEntry = {
        id: concept.id,
        name: concept.name,
        aliases: concept.aliases || [],
        domain: concept.domain || 'Uncategorized',
        origin: concept.origin,
        summary: concept.summary,
        content,
        relations: (concept.relations || []) as WikiEntry['relations'],
        sources: [sourceRef],
        tags: [],
        createdAt: now,
        updatedAt: now,
      };
      await saveWikiEntry(wikiEntry);
      console.log(`[wiki] 新建词条: ${wikiEntry.name} (${wikiEntry.id})`);
    }
  }

  console.log(`[wiki] 完成: 从 "${entry.title}" 存入 ${concepts.length} 个词条`);

  // 跨概念关联发现：新概念与已有概念之间的隐含关系
  const conceptIds = concepts.map(c => c.id);
  discoverRelations(conceptIds).catch(err => {
    console.warn(`[wiki] 关联发现失败:`, err);
  });
}

// ============================================================
// Wiki 编译：增量融合（自动）+ 全量重编译（手动）
// ============================================================

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

// 生成摘要（取前两句）
function extractSummary(text: string, fallback: string): string {
  const firstParagraph = text.replace(/^#.*\n+/, '').trim().split('\n\n')[0] || '';
  const sentences = firstParagraph.split(/[。！？]/).filter(Boolean);
  const summary = sentences.slice(0, 2).join('。') + '。';
  return summary.length > 20 ? summary : fallback;
}

// 全量重编译：从所有来源报告重新综合（手动触发）
export async function recompileWikiEntry(conceptId: string): Promise<boolean> {
  const wiki = await getWikiEntry(conceptId);
  if (!wiki) {
    console.warn(`[wiki-compile] 词条 ${conceptId} 不存在`);
    return false;
  }

  if (wiki.sources.length < 2) {
    console.log(`[wiki-compile] ${wiki.name} 仅 1 个来源，跳过重编译`);
    return false;
  }

  console.log(`[wiki-compile] 全量重编译 ${wiki.name}，${wiki.sources.length} 个来源`);

  const sourceTexts: string[] = [];
  for (const src of wiki.sources) {
    const entry = await getEntry(src.entryId);
    if (entry?.fullMarkdown) {
      sourceTexts.push(`### 来源：${entry.title}（${entry.date.slice(0, 10)}）\n\n${entry.fullMarkdown}`);
    }
  }

  if (sourceTexts.length < 2) {
    console.log(`[wiki-compile] ${wiki.name} 有效原始报告不足 2 篇，跳过`);
    return false;
  }

  const systemPrompt = `你是一个技术知识编译器。你的任务是从多篇研究报告中综合提炼出一个完整、准确的技术概念词条。

## 目标概念
- 名称：${wiki.name}
- 别名：${wiki.aliases.join(', ') || '无'}
- 领域：${wiki.domain}
- 来源：${wiki.origin || '未知'}

## 输出要求

综合所有来源报告中关于 ${wiki.name} 的信息，写一篇完整的词条，格式：

## 是什么
（综合所有来源对该技术的描述，写出一个完整、准确的定义和原理说明。不是拼接各来源的文字，而是通读后用自己的理解重写。如果各来源有不同视角或侧重点，都要涵盖。）

## 能做什么
（该技术能解决什么问题、应用场景、实际效果。用具体数据支撑。）

## 现状与局限
（局限、争议、适用条件。如果不同来源有不同观点，标明。）

## 写作原则
- 以事实为基础，标注关键数据的出处（哪篇文章）
- 不同来源的观点如有矛盾，如实呈现并分析差异原因
- 不要按来源分段写（不要"文章A说...文章B说..."），而是按主题组织
- 内容要有深度，不泛泛而谈
- 所有输出用中文

直接输出 Markdown 内容，不要输出其他内容。`;

  const prompt = `以下是 ${sourceTexts.length} 篇提到 "${wiki.name}" 的研究报告原文，请综合编译为一篇完整的 Wiki 词条：

${sourceTexts.join('\n\n---\n\n')}`;

  let fullText = '';

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
      const text = extractText(message);
      if (text) fullText += text;
    }

    if (!fullText.trim()) {
      console.warn(`[wiki-compile] ${wiki.name} 编译输出为空`);
      return false;
    }

    const updated: WikiEntry = {
      ...wiki,
      content: fullText.trim(),
      summary: extractSummary(fullText, wiki.summary),
      updatedAt: new Date().toISOString(),
    };
    await saveWikiEntry(updated);
    console.log(`[wiki-compile] ${wiki.name} 全量重编译完成，综合 ${sourceTexts.length} 篇来源`);
    return true;
  } catch (err) {
    console.error(`[wiki-compile] ${wiki.name} 重编译失败:`, err);
    return false;
  }
}

// ============================================================
// 跨概念关联发现：新概念入库后，扫描已有概念寻找隐含关系
// ============================================================

interface DiscoveredRelation {
  from: string;      // 概念 id
  to: string;        // 概念 id
  type: WikiRelation['type'];
  description: string;
}

// 反向类型映射
const INVERSE_TYPE: Record<string, WikiRelation['type']> = {
  'composed-of': 'part-of',
  'part-of': 'composed-of',
  'related': 'related',
};

async function discoverRelations(newConceptIds: string[]): Promise<void> {
  const allIndex = await getWikiEntries();
  if (allIndex.length < 2) return; // 少于 2 个概念无法发现关系

  // 加载新概念和所有已有概念的全文
  const allEntries = await getWikiEntriesByIds(allIndex.map(i => i.id));

  // 构建概念摘要列表
  const conceptSummaries = allEntries.map((e: WikiEntry) => {
    const existingRels = e.relations.map(r => `${r.type}: ${r.conceptName}`).join(', ');
    return `- [${e.id}] ${e.name} (${e.domain}): ${e.summary}${existingRels ? ` | 已有关系: ${existingRels}` : ''}`;
  }).join('\n');

  // 新概念的详细内容
  const newConceptDetails = allEntries
    .filter((e: WikiEntry) => newConceptIds.includes(e.id))
    .map((e: WikiEntry) => `### ${e.name} (${e.id})\n${e.content}`)
    .join('\n\n');

  // 已有概念的详细内容（排除新概念）
  const existingDetails = allEntries
    .filter((e: WikiEntry) => !newConceptIds.includes(e.id))
    .map((e: WikiEntry) => `### ${e.name} (${e.id})\n${e.content}`)
    .join('\n\n');

  if (!newConceptDetails || !existingDetails) return;

  const prompt = `以下是知识库中的新概念和已有概念。请分析新概念与已有概念之间是否存在尚未记录的关系。

## 所有概念索引
${conceptSummaries}

## 新入库的概念（详细）
${newConceptDetails}

## 已有概念（详细）
${existingDetails}

## 任务
找出新概念与已有概念之间**尚未在"已有关系"中记录的**隐含关系。只输出有实质意义的关系，不要为了输出而输出。

所有关系类型统一为 related，用 description 字段描述具体关系（如"A 在 B 基础上发展"、"A 使 B 成为可能"、"A 与 B 互为替代"）。

严格按以下 JSON 格式输出，用标记包裹。如果没有发现新关系，输出空数组。

===RELATIONS_START===
[
  { "from": "concept-id-a", "to": "concept-id-b", "type": "related", "description": "一句话说明具体关系" }
]
===RELATIONS_END===`;

  console.log(`[wiki-link] 开始跨概念关联发现，${newConceptIds.length} 个新概念，${allIndex.length} 个总概念`);

  let fullText = '';
  try {
    const q = query({
      prompt,
      options: {
        systemPrompt: '你是一个知识图谱分析专家。你的任务是发现概念之间的隐含关系。只发现有实质意义的关系，宁缺毋滥。所有输出用中文。',
        cwd: process.cwd(),
        allowedTools: [],
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        maxTurns: 1,
        persistSession: false,
      },
    });

    for await (const message of q) {
      const text = extractText(message);
      if (text) fullText += text;
    }

    // 解析发现的关系
    const match = fullText.match(/===RELATIONS_START===([\s\S]*?)===RELATIONS_END===/);
    if (!match) {
      console.log('[wiki-link] 未发现新关系');
      return;
    }

    let relations: DiscoveredRelation[];
    try {
      const raw = match[1].trim().replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
      relations = JSON.parse(raw);
    } catch {
      console.warn('[wiki-link] 关系 JSON 解析失败');
      return;
    }

    if (!Array.isArray(relations) || relations.length === 0) {
      console.log('[wiki-link] 未发现新关系');
      return;
    }

    // 写入双向关系（有向关系使用反向类型）
    const now = new Date().toISOString();
    for (const rel of relations) {
      // 正向：from → to
      const fromEntry = await getWikiEntry(rel.from);
      if (fromEntry && !fromEntry.relations.some(r => r.conceptId === rel.to && r.type === rel.type)) {
        const toEntry = await getWikiEntry(rel.to);
        fromEntry.relations.push({
          conceptId: rel.to,
          conceptName: toEntry?.name || rel.to,
          type: rel.type,
          description: rel.description,
        });
        fromEntry.updatedAt = now;
        await saveWikiEntry(fromEntry);
      }

      // 反向：to → from（使用反向类型，如 enables → enabled-by）
      const inverseType = INVERSE_TYPE[rel.type];
      if (inverseType) {
        const toEntry = await getWikiEntry(rel.to);
        if (toEntry && !toEntry.relations.some(r => r.conceptId === rel.from && r.type === inverseType)) {
          toEntry.relations.push({
            conceptId: rel.from,
            conceptName: fromEntry?.name || rel.from,
            type: inverseType,
            description: rel.description,
          });
          toEntry.updatedAt = now;
          await saveWikiEntry(toEntry);
        }
      }

      console.log(`[wiki-link] 发现关系: ${rel.from} --${rel.type}--> ${rel.to}: ${rel.description}`);
    }

    console.log(`[wiki-link] 完成，新增 ${relations.length} 条关系`);
  } catch (err) {
    console.error('[wiki-link] 关联发现失败:', err);
  }
}
