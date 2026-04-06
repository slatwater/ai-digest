import { DigestEntry, WikiEntry, AnalysisConcept } from './types';
import { getWikiEntry, saveWikiEntry } from './storage';

// 从深研已提取的概念直接存入 Wiki（无需独立 LLM 调用）
export async function saveConceptsToWiki(
  concepts: AnalysisConcept[],
  entry: { id: string; title: string; date: string; tldr: string },
): Promise<void> {
  if (!concepts || concepts.length === 0) return;

  const now = new Date().toISOString();
  const sourceRef = {
    entryId: entry.id,
    entryTitle: entry.title,
    date: entry.date,
    contribution: entry.tldr || entry.title,
  };

  for (const concept of concepts) {
    const content = [
      concept.what ? `## 是什么\n\n${concept.what}` : '',
      concept.enables ? `## 能做什么\n\n${concept.enables}` : '',
      concept.limitations ? `## 现状与局限\n\n${concept.limitations}` : '',
    ].filter(Boolean).join('\n\n');

    const existing = await getWikiEntry(concept.id);

    if (existing) {
      // 合并：追加来源，更新内容，合并关系
      const hasSource = existing.sources.some(s => s.entryId === entry.id);
      const mergedSources = hasSource ? existing.sources : [...existing.sources, sourceRef];

      const existingRelIds = new Set(existing.relations.map(r => r.conceptId));
      const newRelations = (concept.relations || []).filter(r => !existingRelIds.has(r.conceptId));

      const merged: WikiEntry = {
        ...existing,
        content: content || existing.content,
        summary: concept.summary || existing.summary,
        origin: concept.origin || existing.origin,
        aliases: [...new Set([...existing.aliases, ...(concept.aliases || [])])],
        relations: [...existing.relations, ...newRelations] as WikiEntry['relations'],
        sources: mergedSources,
        updatedAt: now,
      };
      await saveWikiEntry(merged);
      console.log(`[wiki] 更新词条: ${merged.name} (${merged.id})`);
    } else {
      // 新建
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
}
