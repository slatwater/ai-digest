'use client';

import { useState, useCallback, useRef } from 'react';
import { TriageEntry } from '@/lib/types';

export interface ExpandStage {
  question: string;
  answer: string;
  loading: boolean;
  toolStatus?: string;
  finished: boolean;
}

interface ExpandState {
  entry: TriageEntry;
  stages: ExpandStage[];
  sessionId: string;   // 整轮会话 ID，新会话时重新生成
}

export function useExpand() {
  const [state, setState] = useState<ExpandState | null>(null);
  const stateRef = useRef<ExpandState | null>(null);

  // 流式请求单个问题
  const runExpand = useCallback((entry: TriageEntry, question: string, idx: number, sessionId: string, resetSession: boolean) => {
    (async () => {
      try {
        const res = await fetch('/api/expand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entry, question, expandSessionId: sessionId, resetSession }),
        });

        const reader = res.body?.getReader();
        if (!reader) return;

        let accumulated = '';
        let buffer = '';
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.trim()) {
              const line = buffer.trim();
              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6));
                  if (event.type === 'done') {
                    setState(s => s ? { ...s, stages: s.stages.map((st, i) => i === idx ? { ...st, finished: true, loading: false } : st) } : s);
                  } else if (event.type === 'replace') {
                    accumulated = event.data.content;
                    setState(s => s ? { ...s, stages: s.stages.map((st, i) => i === idx ? { ...st, answer: accumulated, toolStatus: undefined } : st) } : s);
                  }
                } catch { /* skip */ }
              }
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'tool_status') {
                setState(s => s ? { ...s, stages: s.stages.map((st, i) => i === idx ? { ...st, toolStatus: event.data.label } : st) } : s);
              } else if (event.type === 'replace') {
                // 覆盖式：每轮纯文本替换前一轮
                accumulated = event.data.content;
                setState(s => s ? { ...s, stages: s.stages.map((st, i) => i === idx ? { ...st, answer: accumulated, toolStatus: undefined } : st) } : s);
              } else if (event.type === 'text') {
                accumulated += event.data.content;
                setState(s => s ? { ...s, stages: s.stages.map((st, i) => i === idx ? { ...st, answer: accumulated, toolStatus: undefined } : st) } : s);
              } else if (event.type === 'done') {
                setState(s => s ? { ...s, stages: s.stages.map((st, i) => i === idx ? { ...st, finished: true, loading: false } : st) } : s);
              }
            } catch { /* skip */ }
          }
        }
        // 兜底
        setState(s => s ? { ...s, stages: s.stages.map((st, i) => i === idx && st.loading ? { ...st, finished: true, loading: false, toolStatus: undefined } : st) } : s);
      } catch {
        setState(s => s ? { ...s, stages: s.stages.map((st, i) => i === idx ? { ...st, answer: '请求失败', loading: false, finished: true } : st) } : s);
      }
    })();
  }, []);

  // 开始新会话（自动发起第一个问题）
  const startSession = useCallback((entry: TriageEntry, initialQuestion: string) => {
    const sessionId = `expand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newState: ExpandState = {
      entry,
      stages: [{ question: initialQuestion, answer: '', loading: true, finished: false }],
      sessionId,
    };
    setState(newState);
    stateRef.current = newState;
    runExpand(entry, initialQuestion, 0, sessionId, true); // 新会话重置
  }, [runExpand]);

  // 追问（复用同一 sessionId，保留上下文）
  const askQuestion = useCallback((question: string) => {
    const current = stateRef.current;
    if (!current) return;
    const idx = current.stages.length;
    const newState: ExpandState = {
      ...current,
      stages: [...current.stages, { question, answer: '', loading: true, finished: false }],
    };
    setState(newState);
    stateRef.current = newState;
    runExpand(current.entry, question, idx, current.sessionId, false); // 续问不重置
  }, [runExpand]);

  // 退出
  const reset = useCallback(() => {
    setState(null);
    stateRef.current = null;
  }, []);

  // 保持 ref 同步
  if (state) stateRef.current = state;

  const lastStage = state?.stages[state.stages.length - 1];

  return {
    active: state !== null,
    entry: state?.entry ?? null,
    stages: state?.stages ?? [],
    canAsk: !lastStage || lastStage.finished,
    startSession,
    askQuestion,
    reset,
  };
}
