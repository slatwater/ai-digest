import { NextRequest } from 'next/server';
import { getWikiCategories, saveWikiCategories, getWikiIndex } from '@/lib/storage';
import type { WikiCategory } from '@/lib/types';

export async function GET() {
  const categories = await getWikiCategories();
  return Response.json(categories);
}

export async function POST(req: NextRequest) {
  const { name } = await req.json() as { name: string };
  if (!name?.trim()) return Response.json({ error: '缺少分类名' }, { status: 400 });

  const categories = await getWikiCategories();
  const id = name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');
  if (categories.some(c => c.id === id)) {
    return Response.json({ error: '分类已存在' }, { status: 409 });
  }

  const cat: WikiCategory = {
    id,
    name: name.trim(),
    order: categories.length,
    createdAt: new Date().toISOString(),
  };
  categories.push(cat);
  await saveWikiCategories(categories);
  return Response.json(cat);
}

export async function PUT(req: NextRequest) {
  const { id, name, order } = await req.json() as { id: string; name?: string; order?: number };
  if (!id) return Response.json({ error: '缺少 id' }, { status: 400 });

  const categories = await getWikiCategories();
  const cat = categories.find(c => c.id === id);
  if (!cat) return Response.json({ error: '分类不存在' }, { status: 404 });

  if (name !== undefined) cat.name = name.trim();
  if (order !== undefined) cat.order = order;
  await saveWikiCategories(categories);
  return Response.json(cat);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: '缺少 id' }, { status: 400 });

  const [categories, index] = await Promise.all([getWikiCategories(), getWikiIndex()]);
  const hasItems = index.some(i => i.categoryId === id);
  if (hasItems) return Response.json({ error: '分类下还有条目，无法删除' }, { status: 409 });

  const filtered = categories.filter(c => c.id !== id);
  if (filtered.length === categories.length) return Response.json({ error: '分类不存在' }, { status: 404 });

  await saveWikiCategories(filtered);
  return Response.json({ ok: true });
}
