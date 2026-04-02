import { getEntries, getEntry, deleteEntry, saveChatHistory, saveEntry } from '@/lib/storage';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');

  if (id) {
    const entry = await getEntry(id);
    if (!entry) {
      return Response.json({ error: '条目不存在' }, { status: 404 });
    }
    return Response.json(entry);
  }

  const entries = await getEntries();
  return Response.json(entries);
}

// 保存轻量条目（留底）
export async function PUT(req: NextRequest) {
  const { id, url, title, tldr, tags, concepts, scores, verdictReason, fullMarkdown: customMd } = await req.json();
  if (!id || !url) {
    return Response.json({ error: '缺少 id 或 url' }, { status: 400 });
  }

  const conceptNames = concepts?.map((c: { name: string }) => c.name) || [];
  const allTags = [...new Set([...(tags || []), ...conceptNames])];

  // 构建 keyPoints：从 concepts 提取核心信息
  const keyPoints = concepts?.map((c: { name: string; root: string }) =>
    `${c.name}：${c.root}`
  ) || [];

  const defaultMd = `# ${title || url}\n\n> ${tldr || '留底条目'}\n\n来源: ${url}\n\n---\n留底自每日研判，未做深度研究。`;

  await saveEntry({
    id,
    url,
    title: title || url,
    date: new Date().toISOString(),
    tags: allTags,
    tldr: tldr || '',
    analysis: {
      tldr: tldr || '',
      keyPoints,
      technical: '',
      significance: verdictReason || '',
      limitations: '',
      comparison: '',
      tags: allTags,
    },
    sources: [],
    fullMarkdown: customMd || defaultMd,
  });

  return Response.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const { id, chatHistory } = await req.json();
  if (!id || !Array.isArray(chatHistory)) {
    return Response.json({ error: '缺少 id 或 chatHistory' }, { status: 400 });
  }

  const ok = await saveChatHistory(id, chatHistory);
  if (!ok) {
    return Response.json({ error: '条目不存在' }, { status: 404 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return Response.json({ error: '缺少 id 参数' }, { status: 400 });
  }

  const ok = await deleteEntry(id);
  if (!ok) {
    return Response.json({ error: '条目不存在' }, { status: 404 });
  }

  return Response.json({ ok: true });
}
