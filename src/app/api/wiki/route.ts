import { NextRequest } from 'next/server';
import { getWikiIndex, getWikiItem, getWikiItemsByCategory, getWikiCategories, saveWikiItem, deleteWikiItem } from '@/lib/storage';
import type { WikiItem } from '@/lib/types';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('itemId');
  const categoryId = searchParams.get('categoryId');

  // 单个条目
  if (itemId) {
    const item = await getWikiItem(itemId);
    if (!item) return Response.json({ error: '条目不存在' }, { status: 404 });
    return Response.json(item);
  }

  // 分类下条目
  if (categoryId) {
    const items = await getWikiItemsByCategory(categoryId);
    return Response.json(items);
  }

  // 全量：分类 + 索引
  const [categories, items] = await Promise.all([getWikiCategories(), getWikiIndex()]);
  return Response.json({ categories, items });
}

export async function PUT(req: NextRequest) {
  const item = await req.json() as WikiItem;
  if (!item.id || !item.name) {
    return Response.json({ error: '缺少 id 或 name' }, { status: 400 });
  }
  item.updatedAt = new Date().toISOString();
  await saveWikiItem(item);
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('itemId');
  if (!itemId) return Response.json({ error: '缺少 itemId' }, { status: 400 });
  const ok = await deleteWikiItem(itemId);
  return Response.json({ ok });
}
