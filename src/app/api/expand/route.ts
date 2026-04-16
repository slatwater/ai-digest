import { NextRequest } from 'next/server';
import { runExpand, resetExpandSession } from '@/lib/expand';
import type { TriageEntry } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { entry, question, expandSessionId, resetSession } = await req.json() as {
    entry: TriageEntry;
    question: string;
    expandSessionId: string;
    resetSession?: boolean;
  };

  if (!entry || !question || !expandSessionId) {
    return Response.json({ error: '缺少 entry、question 或 expandSessionId' }, { status: 400 });
  }

  // 新会话开始时重置
  if (resetSession) resetExpandSession(expandSessionId);

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
        } catch {
          // 流已关闭
        }
      };

      try {
        await runExpand(entry, question, expandSessionId, send);
      } catch (error) {
        send('error', { message: error instanceof Error ? error.message : 'Unknown error' });
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // 已关闭
        }
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
