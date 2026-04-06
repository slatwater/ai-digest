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

// 每个 session 已上报的累计量（用于 result 差值补偿）
const _reported: Map<string, { input: number; output: number; cache_read: number; cache_creation: number }> = new Map();

export function reportTokenUsage(project: string, event: TokenEvent): void {
  fetch(TOKEN_MONITOR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, event }),
  }).catch(() => {});
}

// 从 SDK 消息中提取并上报用量（assistant + result 补偿）
export function reportFromSDKMessage(project: string, message: any, sessionId?: string): void {
  if (message.type === 'assistant') {
    const msg = message.message;
    const usage = msg?.usage;
    if (!usage) return;

    const sid = sessionId || message.session_id || msg?.id || 'sdk';
    const input = usage.input_tokens || 0;
    const output = usage.output_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    const cacheCreation = usage.cache_creation_input_tokens || 0;

    reportTokenUsage(project, {
      session_id: sid,
      model: msg?.model || 'unknown',
      input_tokens: input,
      output_tokens: output,
      cache_read: cacheRead,
      cache_creation: cacheCreation,
    });

    // 累计已上报量
    const acc = _reported.get(sid) || { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
    acc.input += input;
    acc.output += output;
    acc.cache_read += cacheRead;
    acc.cache_creation += cacheCreation;
    _reported.set(sid, acc);
    return;
  }

  if (message.type === 'result') {
    const usage = message.usage;
    if (!usage) return;

    const sid = sessionId || message.session_id || 'sdk';
    const acc = _reported.get(sid) || { input: 0, output: 0, cache_read: 0, cache_creation: 0 };

    // result.usage 是权威累计值，差值 = 未被 assistant 消息覆盖的内部开销（compaction 等）
    const deltaInput = (usage.input_tokens || 0) - acc.input;
    const deltaOutput = (usage.output_tokens || 0) - acc.output;
    const deltaCacheRead = (usage.cache_read_input_tokens || 0) - acc.cache_read;
    const deltaCacheCreation = (usage.cache_creation_input_tokens || 0) - acc.cache_creation;

    if (deltaInput > 0 || deltaOutput > 0 || deltaCacheRead > 0 || deltaCacheCreation > 0) {
      reportTokenUsage(project, {
        session_id: sid,
        model: 'overhead',
        input_tokens: Math.max(0, deltaInput),
        output_tokens: Math.max(0, deltaOutput),
        cache_read: Math.max(0, deltaCacheRead),
        cache_creation: Math.max(0, deltaCacheCreation),
      });
    }

    // 清理
    _reported.delete(sid);
  }
}
