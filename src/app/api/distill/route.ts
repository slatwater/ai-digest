import { NextRequest } from 'next/server';
import { runDistill, destroyDistillSession, abortDistillRun } from '@/lib/distill';
import type { DistillFile } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 经验沉淀 agent SSE：files + history + 新消息 → 流式回复
export async function POST(req: NextRequest) {
  const {
    files = [],
    message,
    history = [],
    sessionId = null,
    model = 'sonnet',
  } = await req.json();

  if (typeof message !== 'string' || !message) {
    return Response.json({ error: '缺少 message' }, { status: 400 });
  }

  // 简单校验文件结构
  const safeFiles: DistillFile[] = Array.isArray(files)
    ? files.filter((f): f is DistillFile =>
        f && typeof f.name === 'string' && typeof f.content === 'string',
      )
    : [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      const send = (type: string, data: unknown) => {
        const event = `data: ${JSON.stringify({ type, data })}\n\n`;
        try {
          controller.enqueue(encoder.encode(event));
        } catch { /* 流已关闭 */ }
      };

      try {
        await runDistill(
          { files: safeFiles },
          message,
          history,
          sessionId,
          model,
          send,
        );
      } catch (error) {
        send('error', { message: error instanceof Error ? error.message : 'Unknown error' });
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* 已关闭 */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export async function DELETE(req: NextRequest) {
  const { sessionId } = await req.json();
  if (!sessionId) {
    return Response.json({ error: '缺少 sessionId' }, { status: 400 });
  }
  const ok = await destroyDistillSession(sessionId);
  return Response.json({ ok });
}

// 中止当前运行（保留会话）
export async function PATCH(req: NextRequest) {
  const { sessionId } = await req.json();
  if (!sessionId) {
    return Response.json({ error: '缺少 sessionId' }, { status: 400 });
  }
  const ok = await abortDistillRun(sessionId);
  return Response.json({ ok });
}
