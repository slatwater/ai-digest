import { NextRequest } from 'next/server';
import { createBatch, getBatch, deleteBatch } from '@/lib/triage';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 创建研判 batch
export async function POST(req: NextRequest) {
  const { urls, model } = await req.json();

  if (!Array.isArray(urls) || urls.length === 0) {
    return Response.json({ error: '请提供至少一个 URL' }, { status: 400 });
  }

  // 过滤空行，最多 20 条
  const validUrls = urls
    .map((u: string) => u.trim())
    .filter((u: string) => u && u.startsWith('http'))
    .slice(0, 20);

  if (validUrls.length === 0) {
    return Response.json({ error: '未找到有效的 URL' }, { status: 400 });
  }

  // 校验模型参数
  const validModel = (model === 'opus' || model === 'opus-4-6') ? model : 'sonnet';
  const batch = createBatch(validUrls, validModel);
  return Response.json({ batchId: batch.id, count: validUrls.length });
}

// 查询 batch 状态
export async function GET(req: NextRequest) {
  const batchId = req.nextUrl.searchParams.get('batchId');

  if (!batchId) {
    return Response.json({ error: '缺少 batchId 参数' }, { status: 400 });
  }

  const batch = getBatch(batchId);
  if (!batch) {
    return Response.json({ error: 'batch 不存在或已过期' }, { status: 404 });
  }

  return Response.json(batch);
}

// 删除 batch
export async function DELETE(req: NextRequest) {
  const batchId = req.nextUrl.searchParams.get('batchId');

  if (!batchId) {
    return Response.json({ error: '缺少 batchId 参数' }, { status: 400 });
  }

  const ok = deleteBatch(batchId);
  return Response.json({ ok });
}
