import { NextRequest } from 'next/server';
import { getPipelineSession } from '@/lib/storage';
import { runPipelineAsk } from '@/lib/pipeline';
import type { TriageModel } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 180;

interface AskBody {
  parentId: string | null;
  question: string;
  branchLabel?: string;
  newBranch?: boolean;
  model?: TriageModel;
  questionPos?: { x: number; y: number; w?: number };
  answerPos?: { x: number; y: number; w?: number };
}

// SSE 流式：在 pipeline 里提一个挂在 parentId 下的问题
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as AskBody;

  if (!body.question?.trim()) {
    return Response.json({ error: '缺少 question' }, { status: 400 });
  }

  const session = await getPipelineSession(id);
  if (!session) return Response.json({ error: 'session 不存在' }, { status: 404 });

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
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
        } catch {
          /* 流已关闭 */
        }
      };

      try {
        await runPipelineAsk(
          {
            session,
            parentId: body.parentId ?? null,
            question: body.question,
            branchLabel: body.branchLabel,
            newBranch: body.newBranch,
            model: body.model,
            questionPos: body.questionPos,
            answerPos: body.answerPos,
          },
          send,
        );
      } catch (error) {
        send('error', {
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* */
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
