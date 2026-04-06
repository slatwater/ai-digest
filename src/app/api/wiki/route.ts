import { getWikiEntries, getWikiEntry, getWikiEntriesByIds } from '@/lib/storage';
import { WikiEntry } from '@/lib/types';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const neighborhood = req.nextUrl.searchParams.get('neighborhood');
  const entryId = req.nextUrl.searchParams.get('entryId');

  // 按来源条目 ID 查询关联 Wiki 词条
  if (entryId) {
    const index = await getWikiEntries();
    const all = await getWikiEntriesByIds(index.map(c => c.id));
    const related = all.filter((c: WikiEntry) =>
      c.sources.some(s => s.entryId === entryId)
    );
    return Response.json(related.map(c => ({
      id: c.id, name: c.name, domain: c.domain, summary: c.summary,
      relationCount: c.relations.length, sourceCount: c.sources.length,
      updatedAt: c.updatedAt,
    })));
  }

  if (id) {
    const wiki = await getWikiEntry(id);
    if (!wiki) {
      return Response.json({ error: '词条不存在' }, { status: 404 });
    }

    if (neighborhood) {
      const neighborIds = wiki.relations.map(r => r.conceptId);
      const neighbors = await getWikiEntriesByIds(neighborIds);
      return Response.json({ concept: wiki, neighbors });
    }

    return Response.json(wiki);
  }

  const entries = await getWikiEntries();
  return Response.json(entries);
}
