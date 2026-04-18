import { NextRequest } from 'next/server';
import { getExperienceIndex, getExperience, saveExperience, deleteExperience } from '@/lib/storage';
import type { ExperienceEntry } from '@/lib/types';

export const runtime = 'nodejs';

// GET: 列表（无 id）或详情（?id=xxx）
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const item = await getExperience(id);
    if (!item) return Response.json({ error: '未找到' }, { status: 404 });
    return Response.json(item);
  }
  const index = await getExperienceIndex();
  return Response.json({ items: index });
}

// POST: 新建或更新
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, title, summary, content, wikiItemIds = [], wikiItemNames = [], cozeRuns = [] } = body || {};

  if (!title || !content) {
    return Response.json({ error: '缺少 title 或 content' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const existing = id ? await getExperience(id) : null;

  const entry: ExperienceEntry = {
    id: id || `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    summary: summary || '',
    content,
    wikiItemIds,
    wikiItemNames,
    cozeRuns,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await saveExperience(entry);
  return Response.json({ ok: true, id: entry.id });
}

// DELETE: ?id=xxx
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return Response.json({ error: '缺少 id' }, { status: 400 });
  const ok = await deleteExperience(id);
  return Response.json({ ok });
}
