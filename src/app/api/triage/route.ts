import { NextRequest } from 'next/server';
import { createBatch, createDirectBatch, getBatch, deleteBatch } from '@/lib/triage';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 创建研判 batch
export async function POST(req: NextRequest) {
  const { urls, model, direct, texts } = await req.json();

  if (!Array.isArray(urls) || urls.length === 0) {
    return Response.json({ error: '请提供至少一个 URL' }, { status: 400 });
  }

  // 原文粘贴模式：url 以 paste:// 开头，texts[url] 是原文；必须走 direct 分支
  const hasTexts = texts && typeof texts === 'object' && Object.keys(texts).length > 0;

  // 过滤：允许 http(s) 或 paste://（原文粘贴），最多 20 条
  const validUrls = urls
    .map((u: string) => u.trim())
    .filter((u: string) => u && (u.startsWith('http') || u.startsWith('paste://')))
    .slice(0, 20);

  if (validUrls.length === 0) {
    return Response.json({ error: '未找到有效的 URL' }, { status: 400 });
  }

  // 校验模型参数
  const validModel = (model === 'opus' || model === 'opus-4-6') ? model : 'sonnet';
  // direct=true 或有 texts：跳过 triage agent，只建锚点（用户已知一手来源 / 直接粘原文）
  const useDirect = direct === true || hasTexts;
  const batch = useDirect
    ? createDirectBatch(validUrls, validModel, hasTexts ? texts : undefined)
    : createBatch(validUrls, validModel);
  return Response.json({ batchId: batch.id, count: validUrls.length, direct: useDirect });
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
