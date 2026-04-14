'use client';

import { useState, useCallback, useRef } from 'react';
import { TriageEntry, ChatMessage, WikiSection, WikiSourceLink } from '@/lib/types';
import type { ExpandStage } from './useExpand';

export interface WikiSaveProposal {
  name: string;
  categoryId: string;
  newCategory?: { name: string } | null;
  sections: WikiSection[];
  sourceLinks: WikiSourceLink[];
}

interface WikiSaveMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function useWikiSave() {
  const [active, setActive] = useState(false);
  const [messages, setMessages] = useState<WikiSaveMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [proposal, setProposal] = useState<WikiSaveProposal | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedItemId, setSavedItemId] = useState<string | null>(null);

  const entryRef = useRef<TriageEntry | null>(null);
  const stagesRef = useRef<ExpandStage[]>([]);
  const historyRef = useRef<ChatMessage[]>([]);

  const runStream = useCallback(async (entry: TriageEntry, stages: ExpandStage[], userMessage: string, history: ChatMessage[]) => {
    setIsStreaming(true);
    setToolStatus(null);
    setProposal(null);

    try {
      const res = await fetch('/api/wiki-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry, stages, userMessage, history }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      let accumulated = '';
      let buffer = '';
      const decoder = new TextDecoder();

      const handleEvent = (event: { type: string; data: Record<string, unknown> }) => {
        if (event.type === 'tool_status') {
          setToolStatus(event.data.label as string);
        } else if (event.type === 'text') {
          setToolStatus(null);
          accumulated += event.data.content as string;
          setMessages(prev => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: accumulated };
            } else {
              copy.push({ role: 'assistant', content: accumulated });
            }
            return copy;
          });
        } else if (event.type === 'proposal') {
          setProposal(event.data as unknown as WikiSaveProposal);
        } else if (event.type === 'done') {
          historyRef.current = [
            ...historyRef.current,
            { role: 'assistant' as const, content: accumulated, timestamp: Date.now() },
          ];
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            const line = buffer.trim();
            if (line.startsWith('data: ')) {
              try { handleEvent(JSON.parse(line.slice(6))); } catch { /* skip */ }
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
          try { handleEvent(JSON.parse(line.slice(6))); } catch { /* skip */ }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '请求失败，请重试' }]);
    } finally {
      setIsStreaming(false);
      setToolStatus(null);
    }
  }, []);

  // 开始存入流程
  const startSession = useCallback((entry: TriageEntry, stages: ExpandStage[]) => {
    entryRef.current = entry;
    stagesRef.current = stages;
    historyRef.current = [];
    setActive(true);
    setMessages([]);
    setProposal(null);
    setSaved(false);
    setSavedItemId(null);
    runStream(entry, stages, '', []);
  }, [runStream]);

  // 发送用户调整意见
  const sendMessage = useCallback((text: string) => {
    if (!entryRef.current || !text.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: text.trim(), timestamp: Date.now() };
    historyRef.current = [...historyRef.current, userMsg];
    setMessages(prev => [...prev, { role: 'user', content: text.trim() }]);
    setProposal(null);
    runStream(entryRef.current, stagesRef.current, text.trim(), historyRef.current);
  }, [runStream]);

  // 确认存入
  const confirmSave = useCallback(async (p: WikiSaveProposal) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/wiki-save/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      const data = await res.json();
      if (data.ok) {
        setSaved(true);
        setSavedItemId(data.itemId);
      }
    } catch { /* */ }
    setIsSaving(false);
  }, []);

  // 重置
  const reset = useCallback(() => {
    setActive(false);
    setMessages([]);
    setProposal(null);
    setSaved(false);
    setSavedItemId(null);
    setIsStreaming(false);
    entryRef.current = null;
    stagesRef.current = [];
    historyRef.current = [];
  }, []);

  return {
    active,
    messages,
    isStreaming,
    toolStatus,
    proposal,
    isSaving,
    saved,
    savedItemId,
    startSession,
    sendMessage,
    confirmSave,
    reset,
  };
}
