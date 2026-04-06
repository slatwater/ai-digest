// 向 token monitor 上报 SDK token 用量（fire-and-forget）

const TOKEN_MONITOR_URL = 'http://127.0.0.1:5588/api/live/report';

interface TokenEvent {
  session_id?: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_creation: number;
}

export function reportTokenUsage(project: string, event: TokenEvent): void {
  fetch(TOKEN_MONITOR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, event }),
  }).catch(() => {});
}

// 从 SDK assistant 消息中提取并上报用量
export function reportFromSDKMessage(project: string, message: any, sessionId?: string): void {
  if (message.type !== 'assistant') return;
  const msg = message.message;
  const usage = msg?.usage;
  if (!usage) return;
  reportTokenUsage(project, {
    session_id: sessionId || msg?.id || 'sdk',
    model: msg?.model || 'unknown',
    input_tokens: usage.input_tokens || 0,
    output_tokens: usage.output_tokens || 0,
    cache_read: usage.cache_read_input_tokens || 0,
    cache_creation: usage.cache_creation_input_tokens || 0,
  });
}
