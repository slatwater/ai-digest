'use client';

import { useState, useCallback, useRef } from 'react';
import { ChatMessage } from '@/lib/types';

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentReply: string;
  error: string | null;
}

export function useChat(entryId: string | null) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isStreaming: false,
    currentReply: '',
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

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
          history: state.messages,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '请求失败');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullReply = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'text') {
              fullReply += event.data.content;
              setState(prev => ({ ...prev, currentReply: fullReply }));
            } else if (event.type === 'error') {
              throw new Error(event.data.message);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== '请求失败') {
              // JSON 解析失败忽略，其他错误向上抛
              if (e.message !== 'Unexpected end of JSON input' &&
                  !e.message.startsWith('Unexpected token')) {
                throw e;
              }
            }
          }
        }
      }

      // 流结束，将完整回复追加到历史
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
  }, [entryId, state.messages]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setState({ messages: [], isStreaming: false, currentReply: '', error: null });
  }, []);

  return { ...state, ask, clear };
}
