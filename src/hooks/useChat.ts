'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChatMessage } from '@/lib/types';

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentReply: string;
  error: string | null;
}

// 持久化 chat 历史到服务端
function persistChat(entryId: string, messages: ChatMessage[]) {
  fetch('/api/entries', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: entryId, chatHistory: messages }),
  }).catch(() => { /* 静默失败 */ });
}

export function useChat(entryId: string | null) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isStreaming: false,
    currentReply: '',
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  // 用 ref 跟踪最新 messages，避免 async 回调中闭包陈旧
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = state.messages;

  // 加载已有 chat 历史
  useEffect(() => {
    if (!entryId) return;
    fetch(`/api/entries?id=${entryId}`)
      .then(r => r.json())
      .then(entry => {
        if (entry.chatHistory?.length) {
          setState(prev => ({ ...prev, messages: entry.chatHistory }));
        }
      })
      .catch(() => { /* 忽略 */ });
  }, [entryId]);

  // SSE 流解析（独立回调，无外部状态依赖）
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
          setState(prev => ({ ...prev, currentReply: fullReply }));
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
        // 处理残留 buffer
        if (buffer.trim()) parseEvent(buffer.trim());
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        parseEvent(line);
      }
    }

    return fullReply;
  }, []);

  const ask = useCallback(async (question: string) => {
    if (!entryId || !question.trim()) return;

    // 取消上一个请求
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const userMsg: ChatMessage = {
      role: 'user',
      content: question.trim(),
      timestamp: Date.now(),
    };

    // 快照当前历史（在 setState 之前读 ref，确保拿到最新值）
    const history = messagesRef.current;

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      isStreaming: true,
      currentReply: '',
      error: null,
    }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId,
          question: question.trim(),
          history,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '请求失败');
      }

      const fullReply = await streamFromResponse(res);

      // 流结束，将完整回复追加到历史并持久化
      if (fullReply) {
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: fullReply,
          timestamp: Date.now(),
        };
        setState(prev => {
          const updated = [...prev.messages, assistantMsg];
          if (entryId) persistChat(entryId, updated);
          return {
            ...prev,
            messages: updated,
            isStreaming: false,
            currentReply: '',
          };
        });
      } else {
        setState(prev => ({ ...prev, isStreaming: false }));
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setState(prev => ({
          ...prev,
          error: (error as Error).message,
          isStreaming: false,
          currentReply: '',
        }));
      }
    }
  }, [entryId, streamFromResponse]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setState({ messages: [], isStreaming: false, currentReply: '', error: null });
    if (entryId) persistChat(entryId, []);
  }, [entryId]);

  return { ...state, ask, clear };
}
