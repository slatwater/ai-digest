import { NextRequest } from 'next/server';
import { runExpand } from '@/lib/expand';
import type { TriageEntry } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { entry, question } = await req.json() as {
    entry: TriageEntry;
    question: string;
  };

  if (!entry || !question) {
    return Response.json({ error: '缺少 entry 或 question' }, { status: 400 });
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
        } catch {
          // 流已关闭
        }
      };

      try {
        await runExpand(entry, question, send);
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
