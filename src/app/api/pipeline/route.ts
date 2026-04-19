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

// 基于一个 triage entry 创建新的 pipeline session
export async function POST(req: NextRequest) {
  const { entry, wikiCandidate, model } = (await req.json()) as {
    entry: TriageEntry;
    wikiCandidate?: PipelineWikiCandidate;
    model?: TriageModel;
  };

  if (!entry?.id || !entry?.title || !entry?.url) {
    return Response.json({ error: '缺少 entry.id / title / url' }, { status: 400 });
  }

  const validModel: TriageModel =
    model === 'opus' || model === 'opus-4-6' ? model : 'sonnet';

  const now = new Date().toISOString();
  const session: PipelineSession = {
    id: uuidv4(),
    entryId: entry.id,
    entrySnapshot: {
      title: entry.title,
      url: entry.url,
      narrative: entry.narrative,
      concepts: entry.concepts,
      sources: entry.sources,
    },
    nodes: [],
    sediment: [],
    wikiCandidate,
    model: validModel,
    createdAt: now,
    updatedAt: now,
  };

  await savePipelineSession(session);
  return Response.json({ session });
}
