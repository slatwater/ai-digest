import { NextRequest } from 'next/server';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

export const runtime = 'nodejs';
export const maxDuration = 60;

function extractText(message: SDKMessage): string | null {
  if (message.type === 'assistant') {
    const blocks = message.message?.content;
    if (Array.isArray(blocks)) {
      return blocks
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { type: string; text?: string }) => b.text ?? '')
        .join('');
    }
  }
  if (message.type === 'result' && message.subtype === 'success') {
    return message.result;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { question, context } = await req.json();

  if (!question || !context) {
    return Response.json({ error: '缺少 question 或 context' }, { status: 400 });
  }

  const systemPrompt = `你是一个技术问答助手。用户正在快速浏览一篇 AI 技术文章的解析结果，遇到不懂的术语或概念，向你提问。

## 文章解析上下文
标题: ${context.title || ''}
叙述: ${context.narrative || ''}
涉及技术: ${context.concepts?.map((c: { name: string }) => c.name).join(', ') || ''}

## 规则
- 用简洁的大白话解释，假设用户不是技术专家
- 解释要结合文章上下文，说清楚这个术语在本文中的作用
- 回答控制在 2-4 句话
- 用中文回答`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const q = query({
          prompt: question,
          options: {
            systemPrompt,
            cwd: process.cwd(),
            allowedTools: ['WebSearch'],
            permissionMode: 'bypassPermissions' as const,
            allowDangerouslySkipPermissions: true,
            maxTurns: 3,
            abortController: new AbortController(),
            persistSession: false,
          },
        });

        for await (const message of q) {
          if (message.type === 'assistant') {
            // 检测工具调用，推送状态
            const blocks = message.message?.content;
            if (Array.isArray(blocks)) {
              for (const block of blocks) {
                if (block.type === 'tool_use' && block.name === 'WebSearch') {
                  const status = `data: ${JSON.stringify({ type: 'tool_status', data: { label: '正在搜索...' } })}\n\n`;
                  try { controller.enqueue(encoder.encode(status)); } catch { /* closed */ }
                }
              }
            }
            // 提取文本
            const text = extractText(message);
            if (text) {
              const event = `data: ${JSON.stringify({ type: 'text', data: { content: text } })}\n\n`;
              try { controller.enqueue(encoder.encode(event)); } catch { /* closed */ }
            }
          }
        }

        const done = `data: ${JSON.stringify({ type: 'done' })}\n\n`;
        try { controller.enqueue(encoder.encode(done)); } catch { /* closed */ }
      } catch (error) {
        const err = `data: ${JSON.stringify({ type: 'error', data: { message: (error as Error).message } })}\n\n`;
        try { controller.enqueue(encoder.encode(err)); } catch { /* closed */ }
      } finally {
        try { controller.close(); } catch { /* closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
