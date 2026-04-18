'use client';

import { useState, useCallback, useRef } from 'react';
import { ChatMessage, CozeRun } from '@/lib/types';

export interface ToolTrace {
  tool: string;
  detail: string;
  timestamp: number;
}

interface MaterialInfo {
  itemId: string;
  name: string;
  linkCount: number;
}

interface ExperimentState {
  sessionId: string | null;
  materials: MaterialInfo[];
  messages: ChatMessage[];
  isStreaming: boolean;
  currentReply: string;
  toolStatus: string | null;
  toolTraces: ToolTrace[];
  cozeRuns: CozeRun[];
  error: string | null;
  selectedItemIds: string[];
  model: 'sonnet' | 'opus' | 'opus-4-6';
  resolvedModel: string | null; // SDK 解析出的真实 model ID（如 claude-opus-4-6）
  started: boolean;
}

const INITIAL: ExperimentState = {
  sessionId: null,
  materials: [],
  messages: [],
  isStreaming: false,
  currentReply: '',
  toolStatus: null,
  toolTraces: [],
  cozeRuns: [],
  error: null,
  selectedItemIds: [],
  model: 'sonnet',
  resolvedModel: null,
  started: false,
};

export function useExperiment() {
  const [state, setState] = useState<ExperimentState>(INITIAL);

  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = state.messages;
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = state.sessionId;

  const streamFromResponse = useCallback(async (res: Response) => {
    const reader = res.body?.getReader();
    if (!reader) throw new Error('无法读取响应流');

    const decoder = new TextDecoder();
    let buffer = '';
    let fullReply = '';

    const parseEvent = (line: string) => {
      if (!line.startsWith('data: ')) return;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'text') {
          fullReply += event.data.content;
          setState(prev => ({ ...prev, currentReply: fullReply, toolStatus: null }));
        } else if (event.type === 'session') {
          setState(prev => ({
            ...prev,
            sessionId: event.data.sessionId,
            materials: event.data.materials || [],
          }));
        } else if (event.type === 'tool_status') {
          setState(prev => ({ ...prev, toolStatus: event.data.label }));
        } else if (event.type === 'tool_trace') {
          setState(prev => ({
            ...prev,
            toolTraces: [...prev.toolTraces, {
              tool: event.data.tool,
              detail: event.data.detail,
              timestamp: event.data.timestamp,
            }],
          }));
        } else if (event.type === 'coze_run_start') {
          const run: CozeRun = {
            id: event.data.id,
            command: event.data.command,
            status: 'running',
            startedAt: event.data.startedAt,
            stdout: '',
            stderr: '',
          };
          setState(prev => ({
            ...prev,
            cozeRuns: [...prev.cozeRuns, run],
            toolStatus: 'coze 运行中...',
          }));
        } else if (event.type === 'coze_run_end') {
          setState(prev => ({
            ...prev,
            cozeRuns: prev.cozeRuns.map(r => r.id === event.data.id
              ? { ...r, status: event.data.status, endedAt: event.data.endedAt, stdout: event.data.output || '' }
              : r),
            toolStatus: null,
          }));
        } else if (event.type === 'resolved_model') {
          setState(prev => ({ ...prev, resolvedModel: event.data.model }));
        } else if (event.type === 'aborted') {
          // 中止：把 running 的 coze 标为 failed，落流
          setState(prev => ({
            ...prev,
            cozeRuns: prev.cozeRuns.map(r => r.status === 'running'
              ? { ...r, status: 'failed', endedAt: Date.now() }
              : r),
          }));
        } else if (event.type === 'error') {
          throw new Error(event.data.message);
        }
      } catch (e) {
        if (e instanceof Error &&
            e.message !== 'Unexpected end of JSON input' &&
            !e.message.startsWith('Unexpected token')) {
          throw e;
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) parseEvent(buffer.trim());
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';
      for (const line of lines) parseEvent(line);
    }

    if (fullReply) {
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: fullReply,
        timestamp: Date.now(),
      };
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMsg],
        isStreaming: false,
        currentReply: '',
        toolStatus: null,
      }));
    } else {
      setState(prev => ({ ...prev, isStreaming: false, toolStatus: null }));
    }
  }, []);

  const send = useCallback(async (message: string) => {
    if (!message.trim() || !state.selectedItemIds.length) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const userMsg: ChatMessage = {
      role: 'user',
      content: message.trim(),
      timestamp: Date.now(),
    };

    const history = messagesRef.current;
    const currentSessionId = sessionRef.current;

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      isStreaming: true,
      currentReply: '',
      toolStatus: null,
      error: null,
      started: true,
    }));

    try {
      const res = await fetch('/api/experiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds: state.selectedItemIds,
          message: message.trim(),
          history,
          sessionId: currentSessionId,
          model: state.model,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '请求失败');
      }
      await streamFromResponse(res);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setState(prev => ({
          ...prev,
          error: (error as Error).message,
          isStreaming: false,
          currentReply: '',
          toolStatus: null,
        }));
      }
    }
  }, [state.selectedItemIds, state.model, streamFromResponse]);

  const toggleItem = useCallback((id: string) => {
    setState(prev => {
      const ids = prev.selectedItemIds.includes(id)
        ? prev.selectedItemIds.filter(i => i !== id)
        : [...prev.selectedItemIds, id];
      return { ...prev, selectedItemIds: ids };
    });
  }, []);

  const setModel = useCallback((m: 'sonnet' | 'opus' | 'opus-4-6') => {
    setState(prev => ({ ...prev, model: m }));
  }, []);

  const start = useCallback(async () => {
    if (state.selectedItemIds.length === 0) return;
    setState(prev => ({ ...prev, started: true }));

    try {
      const res = await fetch('/api/experiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds: state.selectedItemIds,
          message: '__init__',
          history: [],
          sessionId: null,
          model: state.model,
        }),
      });
      if (!res.ok) return;

      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'session') {
              setState(prev => ({
                ...prev,
                sessionId: event.data.sessionId,
                materials: event.data.materials || [],
              }));
              reader.cancel();
              return;
            }
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }, [state.selectedItemIds, state.model]);

  // 中止当前运行，保留会话可继续对话
  const abort = useCallback(async () => {
    const sid = sessionRef.current;
    if (sid) {
      try {
        await fetch('/api/experiment', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sid }),
        });
      } catch { /* ignore */ }
    }
    abortRef.current?.abort();
    setState(prev => ({
      ...prev,
      isStreaming: false,
      toolStatus: null,
      currentReply: '',
      cozeRuns: prev.cozeRuns.map(r => r.status === 'running'
        ? { ...r, status: 'failed', endedAt: Date.now() }
        : r),
      messages: prev.currentReply
        ? [...prev.messages, { role: 'assistant', content: prev.currentReply + '\n\n_（已中止）_', timestamp: Date.now() }]
        : prev.messages,
    }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    const sid = sessionRef.current;
    if (sid) {
      fetch('/api/experiment', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid }),
      }).catch(() => {});
    }
    setState(INITIAL);
  }, []);

  // 保存当前对话为经验条目
  const saveAsExperience = useCallback(async (payload: { title: string; summary: string; content: string }): Promise<{ ok: boolean; id?: string; error?: string }> => {
    try {
      const res = await fetch('/api/experiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: payload.title,
          summary: payload.summary,
          content: payload.content,
          wikiItemIds: state.selectedItemIds,
          wikiItemNames: state.materials.map(m => m.name),
          cozeRuns: state.cozeRuns,
        }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || '保存失败' };
      return { ok: true, id: data.id };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, [state.selectedItemIds, state.materials, state.cozeRuns]);

  return { ...state, send, start, toggleItem, setModel, reset, abort, saveAsExperience };
}
