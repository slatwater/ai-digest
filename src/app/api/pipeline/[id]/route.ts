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

// 增量更新：只更新允许的字段（nodes/wikiCandidate/draft）
// 其它字段（id/entryId/sdkSessionId/createdAt 等）由服务端掌握
interface PatchBody {
  nodes?: PipelineNode[];
  nodeAdd?: PipelineNode;
  nodePatch?: { id: string; patch: Partial<PipelineNode> };
  wikiCandidate?: PipelineWikiCandidate;
  draft?: PipelineDraft;
  // 清理某些分支的孤儿 SDK session（删光了某分支所有 Q/A 后调用）
  // 传入要清除的 branchIdx 数组；若含 0，同步清 sdkSessionId
  clearBranchSessionIds?: number[];
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
  if (body.wikiCandidate) {
    session.wikiCandidate = body.wikiCandidate;
  }
  if (body.draft) {
    session.draft = body.draft;
  }
  if (body.clearBranchSessionIds && body.clearBranchSessionIds.length > 0) {
    if (session.branchSessionIds) {
      for (const idx of body.clearBranchSessionIds) {
        delete session.branchSessionIds[idx];
      }
      if (Object.keys(session.branchSessionIds).length === 0) {
        session.branchSessionIds = undefined;
      }
    }
    // 主分支 sdkSessionId 同步
    if (body.clearBranchSessionIds.includes(0)) {
      session.sdkSessionId = undefined;
    }
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
