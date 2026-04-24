import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getPipelineIndex, savePipelineSession } from '@/lib/storage';
import type {
  PipelineSession,
  PipelineWikiCandidate,
  TriageEntry,
  TriageModel,
} from '@/lib/types';

export const runtime = 'nodejs';

// 列出所有 pipeline session（摘要）
export async function GET() {
  const index = await getPipelineIndex();
  return Response.json({ sessions: index });
}

// 创建 pipeline session
// - 新模型：无 entry 也可创建（统一画布下用户先落地「输入卡」再解析）
// - 兼容旧调用：若带 entry，则写入 entryId + entrySnapshot 以便迁移期不报错
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    entry?: TriageEntry;
    wikiCandidate?: PipelineWikiCandidate;
    model?: TriageModel;
  };
  const { entry, wikiCandidate, model } = body;

  const validModel: TriageModel =
    model === 'opus' || model === 'opus-4-6' ? model : 'sonnet';

  const now = new Date().toISOString();
  const session: PipelineSession = {
    id: uuidv4(),
    nodes: [],
    wikiCandidate,
    model: validModel,
    createdAt: now,
    updatedAt: now,
  };

  if (entry?.id && entry.title && entry.url) {
    session.entryId = entry.id;
    session.entrySnapshot = {
      title: entry.title,
      url: entry.url,
      narrative: entry.narrative,
      concepts: entry.concepts,
      sources: entry.sources,
    };
  }

  await savePipelineSession(session);
  return Response.json({ session });
}
