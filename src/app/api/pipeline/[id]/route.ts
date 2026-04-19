import { NextRequest } from 'next/server';
import {
  getPipelineSession,
  savePipelineSession,
  deletePipelineSession,
} from '@/lib/storage';
import type {
  PipelineDraft,
  PipelineNode,
  PipelineSession,
  PipelineWikiCandidate,
  SedimentPoint,
} from '@/lib/types';

export const runtime = 'nodejs';

// 读取 session 全量
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getPipelineSession(id);
  if (!session) return Response.json({ error: 'session 不存在' }, { status: 404 });
  return Response.json({ session });
}

// 增量更新：只更新允许的字段（nodes/sediment/wikiCandidate/draft）
// 其它字段（id/entryId/sdkSessionId/createdAt 等）由服务端掌握
interface PatchBody {
  nodes?: PipelineNode[];
  nodeAdd?: PipelineNode;
  nodePatch?: { id: string; patch: Partial<PipelineNode> };
  sediment?: SedimentPoint[];
  sedimentAdd?: SedimentPoint;
  sedimentRemoveId?: string;
  sedimentPatch?: { id: string; patch: Partial<SedimentPoint> };
  wikiCandidate?: PipelineWikiCandidate;
  draft?: PipelineDraft;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getPipelineSession(id);
  if (!session) return Response.json({ error: 'session 不存在' }, { status: 404 });

  const body = (await req.json()) as PatchBody;

  if (body.nodes) {
    session.nodes = body.nodes;
  }
  if (body.nodeAdd) {
    const existsIdx = session.nodes.findIndex(n => n.id === body.nodeAdd!.id);
    if (existsIdx >= 0) {
      session.nodes[existsIdx] = { ...session.nodes[existsIdx], ...body.nodeAdd };
    } else {
      session.nodes.push(body.nodeAdd);
    }
  }
  if (body.nodePatch) {
    session.nodes = session.nodes.map(n =>
      n.id === body.nodePatch!.id ? { ...n, ...body.nodePatch!.patch } : n,
    );
  }
  if (body.sediment) {
    session.sediment = body.sediment;
  }
  if (body.sedimentAdd) {
    const exists = session.sediment.find(s => s.id === body.sedimentAdd!.id);
    if (!exists) session.sediment.push(body.sedimentAdd);
  }
  if (body.sedimentRemoveId) {
    session.sediment = session.sediment.filter(s => s.id !== body.sedimentRemoveId);
  }
  if (body.sedimentPatch) {
    session.sediment = session.sediment.map(s =>
      s.id === body.sedimentPatch!.id ? { ...s, ...body.sedimentPatch!.patch } : s,
    );
  }
  if (body.wikiCandidate) {
    session.wikiCandidate = body.wikiCandidate;
  }
  if (body.draft) {
    session.draft = body.draft;
  }

  await savePipelineSession(session as PipelineSession);
  return Response.json({ session });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deletePipelineSession(id);
  return Response.json({ ok });
}
