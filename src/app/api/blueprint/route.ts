import { buildSystemPrompt } from '@/lib/agent';

export async function GET() {
  return Response.json({ prompt: buildSystemPrompt() });
}
