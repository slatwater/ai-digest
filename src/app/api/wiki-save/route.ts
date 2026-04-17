import { NextRequest } from 'next/server';
import { runWikiSave } from '@/lib/wiki-save';
import type { TriageEntry } from '@/lib/types';
import type { ExpandStage } from '@/hooks/useExpand';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { entry, stages, userMessage, wikiSessionId } = await req.json() as {
    entry: TriageEntry;
    stages: ExpandStage[];
    userMessage: string;
    wikiSessionId: string;
  };

  if (!entry) {
    return Response.json({ error: '缺少 entry' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { clearInterval(heartbeat); }
      }, 15_000);

      const send = (type: string, data: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`)); } catch { /* */ }
      };

      try {
        await runWikiSave(entry, stages || [], userMessage || '', wikiSessionId || '', send);
      } catch (error) {
        send('error', { message: error instanceof Error ? error.message : 'Unknown error' });
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* */ }
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
