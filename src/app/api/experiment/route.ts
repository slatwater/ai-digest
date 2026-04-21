import { NextRequest } from 'next/server';
import { runExperiment, destroyExperimentSession, abortExperimentRun } from '@/lib/experiment';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const {
    itemIds,
    message,
    history = [],
    sessionId = null,
    model = 'sonnet',
    seedText,
    seedTitle,
  } = await req.json();

  // 两种素材来源：itemIds（从 wiki 挑条目，老模式）或 seedText（从画布 answer 节点直接起，新模式）
  const hasItems = Array.isArray(itemIds) && itemIds.length > 0;
  const hasSeed = typeof seedText === 'string' && seedText.trim().length > 0;
  if ((!hasItems && !hasSeed) || !message) {
    return Response.json({ error: '缺少 itemIds/seedText 或 message' }, { status: 400 });
  }

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
        await runExperiment(
          { itemIds: hasItems ? itemIds : undefined, seedText: hasSeed ? seedText : undefined, seedTitle },
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
  const ok = await destroyExperimentSession(sessionId);
  return Response.json({ ok });
}

// 中止当前运行（保留会话，可继续对话）
export async function PATCH(req: NextRequest) {
  const { sessionId } = await req.json();
  if (!sessionId) {
    return Response.json({ error: '缺少 sessionId' }, { status: 400 });
  }
  const ok = await abortExperimentRun(sessionId);
  return Response.json({ ok });
}
