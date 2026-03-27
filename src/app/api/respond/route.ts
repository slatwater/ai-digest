import { NextRequest } from 'next/server';
import { respondToQuestion } from '@/lib/agent';

export async function POST(req: NextRequest) {
  const { sessionId, answer } = await req.json();

  if (!sessionId || !answer) {
    return Response.json({ error: '缺少 sessionId 或 answer' }, { status: 400 });
  }

  const ok = respondToQuestion(sessionId, answer);

  if (!ok) {
    return Response.json({ error: '未找到活跃的提问' }, { status: 404 });
  }

  return Response.json({ ok: true });
}
