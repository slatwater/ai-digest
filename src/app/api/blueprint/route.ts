import { buildSystemPrompt } from '@/lib/agent';

export async function GET() {
  return Response.json({ prompt: buildSystemPrompt('（预抓取内容将在实际运行时注入）') });
}
