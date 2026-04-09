'use client';

import { useState, useCallback, useRef } from 'react';
import { ChatMessage } from '@/lib/types';

interface WikiChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentReply: string;
  error: string | null;
}

export function useWikiChat() {
  const [state, setState] = useState<WikiChatState>({
    messages: [],
    isStreaming: false,
    currentReply: '',
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  // 用 ref 跟踪最新 messages，避免 async 回调中闭包陈旧
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = state.messages;

  // 公共 SSE 流读取逻辑
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
      }));
    } else {
      setState(prev => ({ ...prev, isStreaming: false }));
    }
  }, []);

  const ask = useCallback(async (question: string) => {
    if (!question.trim()) return;

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
      const res = await fetch('/api/wiki-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          history,
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
        }));
      }
    }
  }, [streamFromResponse]);

  // 知识库健康检查
  const lint = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const userMsg: ChatMessage = {
      role: 'user',
      content: '知识库健康检查',
      timestamp: Date.now(),
    };

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      isStreaming: true,
      currentReply: '',
      error: null,
    }));

    try {
      const res = await fetch('/api/wiki-lint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
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
        }));
      }
    }
  }, [streamFromResponse]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setState({ messages: [], isStreaming: false, currentReply: '', error: null });
  }, []);

  return { ...state, ask, lint, clear };
}
