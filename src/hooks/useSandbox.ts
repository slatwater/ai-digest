'use client';

import { useState, useCallback, useRef } from 'react';
import { ChatMessage } from '@/lib/types';

interface SkillInfo {
  name: string;
  command: string;
  description: string;
}

interface SandboxState {
  sessionId: string | null;
  loadedSkills: SkillInfo[];
  activeSkill: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  currentReply: string;
  toolStatus: string | null;
  error: string | null;
  // 选择的 wiki item ids（启动前设置）
  selectedItemIds: string[];
  started: boolean;
}

export function useSandbox() {
  const [state, setState] = useState<SandboxState>({
    sessionId: null,
    loadedSkills: [],
    activeSkill: null,
    messages: [],
    isStreaming: false,
    currentReply: '',
    toolStatus: null,
    error: null,
    selectedItemIds: [],
    started: false,
  });

  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = state.messages;
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = state.sessionId;

  // SSE 流读取
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
          // 会话初始化信息
          setState(prev => ({
            ...prev,
            sessionId: event.data.sessionId,
            loadedSkills: event.data.skills,
            activeSkill: event.data.activeSkill,
          }));
        } else if (event.type === 'skill_switch') {
          setState(prev => ({ ...prev, activeSkill: event.data.command }));
        } else if (event.type === 'tool_status') {
          setState(prev => ({ ...prev, toolStatus: event.data.label }));
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
      for (const line of lines) { parseEvent(line); }
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

  // 发送消息
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
      const res = await fetch('/api/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds: state.selectedItemIds,
          message: message.trim(),
          history,
          sessionId: currentSessionId,
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
  }, [state.selectedItemIds, streamFromResponse]);

  // 设置选中的 wiki item ids
  const setSelectedItems = useCallback((ids: string[]) => {
    setState(prev => ({ ...prev, selectedItemIds: ids }));
  }, []);

  // 切换选中状态
  const toggleItem = useCallback((id: string) => {
    setState(prev => {
      const ids = prev.selectedItemIds.includes(id)
        ? prev.selectedItemIds.filter(i => i !== id)
        : [...prev.selectedItemIds, id];
      return { ...prev, selectedItemIds: ids };
    });
  }, []);

  // 重置沙盒
  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({
      sessionId: null,
      loadedSkills: [],
      activeSkill: null,
      messages: [],
      isStreaming: false,
      currentReply: '',
      toolStatus: null,
      error: null,
      selectedItemIds: [],
      started: false,
    });
  }, []);

  return { ...state, send, setSelectedItems, toggleItem, reset };
}
