import { NextRequest } from 'next/server';
import { runDigest, findExistingEntry } from '@/lib/agent';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 分钟超时

export async function POST(req: NextRequest) {
  const { url, force, existingId } = await req.json();

  if (!url || typeof url !== 'string') {
    return Response.json({ error: '请提供有效的 URL' }, { status: 400 });
  }

  // URL 去重检查（force=true 时跳过）
  if (!force) {
    const existing = await findExistingEntry(url);
    if (existing) {
      return Response.json(
        { error: 'duplicate', entryId: existing.id, title: existing.title },
        { status: 409 },
      );
    }
  }

  // 创建 SSE 流
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) => {
        const event = `data: ${JSON.stringify({ type, data })}\n\n`;
        try {
          controller.enqueue(encoder.encode(event));
        } catch {
          // 流已关闭
        }
      };

      try {
        await runDigest(url, send, existingId);
      } catch (error) {
        send('error', { message: error instanceof Error ? error.message : 'Unknown error' });
      } finally {
        try {
          controller.close();
        } catch {
          // 已经关闭
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
