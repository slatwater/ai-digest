import { getWikiEntries, getWikiEntry, getWikiEntriesByIds } from '@/lib/storage';
import { recompileWikiEntry } from '@/lib/compiler';
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

// POST /api/wiki?recompile=<id> — 手动触发词条重编译
export async function POST(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('recompile');
  if (!id) {
    return Response.json({ error: '需要 recompile 参数' }, { status: 400 });
  }

  const success = await recompileWikiEntry(id);
  if (success) {
    const updated = await getWikiEntry(id);
    return Response.json({ ok: true, entry: updated });
  }
  return Response.json({ ok: false, error: '重编译失败或来源不足' }, { status: 400 });
}
