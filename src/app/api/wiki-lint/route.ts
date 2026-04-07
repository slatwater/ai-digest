import { runWikiLint } from '@/lib/wiki-lint';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) => {
        const event = `data: ${JSON.stringify({ type, data })}\n\n`;
        try {
          controller.enqueue(encoder.encode(event));
        } catch { /* 流已关闭 */ }
      };

      try {
        await runWikiLint(send);
      } catch (error) {
        send('error', { message: error instanceof Error ? error.message : 'Unknown error' });
      } finally {
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
