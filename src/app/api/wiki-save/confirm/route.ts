import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { saveWikiItem, getWikiCategories, saveWikiCategories } from '@/lib/storage';
import type { WikiItem, WikiCategory, WikiSection, WikiSourceLink } from '@/lib/types';

export async function POST(req: NextRequest) {
  const { name, categoryId, newCategory, sections, sourceLinks } = await req.json() as {
    name: string;
    categoryId: string;
    newCategory?: { name: string } | null;
    sections: WikiSection[];
    sourceLinks: WikiSourceLink[];
  };

  if (!name?.trim()) {
    return Response.json({ error: '缺少条目名称' }, { status: 400 });
  }

  let finalCategoryId = categoryId;

  // 需要新建分类
  if (newCategory?.name) {
    const categories = await getWikiCategories();
    const catId = newCategory.name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');
    if (!categories.some(c => c.id === catId)) {
      const cat: WikiCategory = {
        id: catId,
        name: newCategory.name.trim(),
        order: categories.length,
        createdAt: new Date().toISOString(),
      };
      categories.push(cat);
      await saveWikiCategories(categories);
    }
    finalCategoryId = catId;
  }

  if (!finalCategoryId) {
    return Response.json({ error: '缺少分类' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const item: WikiItem = {
    id: uuidv4(),
    name: name.trim(),
    categoryId: finalCategoryId,
    sections: sections || [],
    sourceLinks: sourceLinks || [],
    createdAt: now,
    updatedAt: now,
  };

  await saveWikiItem(item);
  return Response.json({ ok: true, itemId: item.id });
}
