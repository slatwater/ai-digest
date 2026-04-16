import { NextRequest } from 'next/server';
import { runSandbox, destroySession } from '@/lib/sandbox';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { itemIds, message, history = [], sessionId = null, model = 'sonnet' } = await req.json();

  if (!itemIds?.length || !message) {
    return Response.json({ error: '缺少 itemIds 或 message' }, { status: 400 });
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
        await runSandbox(itemIds, message, history, sessionId, model, send);
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

// 退出沙盒：清理子进程 + 临时目录 + SDK 会话文件
export async function DELETE(req: NextRequest) {
  const { sessionId } = await req.json();
  if (!sessionId) {
    return Response.json({ error: '缺少 sessionId' }, { status: 400 });
  }
  const ok = await destroySession(sessionId);
  return Response.json({ ok });
}
