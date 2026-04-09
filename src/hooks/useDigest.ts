'use client';

import { useState, useCallback, useRef } from 'react';
import { DigestPhase, StreamMessage, QuestionEvent, DigestEntry, PhaseSummary, SourceInfo, AnalysisConcept } from '@/lib/types';

interface DuplicateInfo {
  entryId: string;
  title: string;
}

interface DigestState {
  phase: DigestPhase | null;
  phaseLabel: string;
  toolStatus: string | null;
  messages: StreamMessage[];
  phaseSummary: PhaseSummary;
  question: QuestionEvent | null;
  isRunning: boolean;
  entry: DigestEntry | null;
  error: string | null;
  duplicate: DuplicateInfo | null;
}

export function useDigest() {
  const [state, setState] = useState<DigestState>({
    phase: null,
    phaseLabel: '',
    toolStatus: null,
    messages: [],
    phaseSummary: {},
    question: null,
    isRunning: false,
    entry: null,
    error: null,
    duplicate: null,
  });

  const sessionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (url: string, force = false, existingId?: string) => {
    // 重置状态
    setState({
      phase: 'capture',
      phaseLabel: '正在采集内容...',
      toolStatus: null,
      messages: [],
      phaseSummary: {},
      question: null,
      isRunning: true,
      entry: null,
      error: null,
      duplicate: null,
    });

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, force, existingId }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        // URL 去重：返回 duplicate 信息让前端处理
        if (res.status === 409 && err.error === 'duplicate') {
          setState(prev => ({
            ...prev,
            isRunning: false,
            phase: null,
            duplicate: { entryId: err.entryId, title: err.title },
          }));
          return;
        }
        throw new Error(err.error || '请求失败');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // 处理 buffer 中残留的最后一个事件
          if (buffer.trim()) {
            const remaining = buffer.trim();
            if (remaining.startsWith('data: ')) {
              try {
                const event = JSON.parse(remaining.slice(6));
                handleEvent(event);
              } catch { /* 解析失败忽略 */ }
            }
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 事件
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleEvent(event);
          } catch {
            // 解析失败忽略
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setState(prev => ({
          ...prev,
          error: (error as Error).message,
          isRunning: false,
        }));
      }
    }
  }, []);

  const handleEvent = useCallback((event: { type: string; data: Record<string, unknown> }) => {
    switch (event.type) {
      case 'phase': {
        const phase = event.data.phase as DigestPhase;
        setState(prev => {
          const ps = { ...prev.phaseSummary };
          if (phase === 'compose') ps.compose = { done: false };
          if (phase === 'archive') ps.archive = { done: false };
          return { ...prev, phase, phaseLabel: event.data.label as string, toolStatus: null, phaseSummary: ps };
        });
        break;
      }

      case 'tool_status': {
        setState(prev => ({ ...prev, toolStatus: event.data.label as string }));
        break;
      }

      case 'text': {
        const msg: StreamMessage = {
          id: crypto.randomUUID(),
          type: 'text',
          content: event.data.content as string,
          phase: event.data.phase as DigestPhase,
          timestamp: Date.now(),
        };
        setState(prev => ({
          ...prev,
          toolStatus: null,
          messages: [...prev.messages, msg],
        }));
        break;
      }

      case 'question':
        setState(prev => ({
          ...prev,
          question: event.data as unknown as QuestionEvent,
        }));
        break;

      case 'title':
        setState(prev => ({
          ...prev,
          phaseSummary: { ...prev.phaseSummary, capture: { ...prev.phaseSummary.capture, title: event.data.title as string } },
        }));
        break;

      case 'sources':
        setState(prev => ({
          ...prev,
          phaseSummary: { ...prev.phaseSummary, trace: { sources: event.data.sources as SourceInfo[] } },
        }));
        break;

      case 'concepts':
        setState(prev => ({
          ...prev,
          phaseSummary: {
            ...prev.phaseSummary,
            decompose: { concepts: (event.data.concepts as Array<{ name: string; isNew?: boolean }>) },
          },
        }));
        break;

      case 'narrative':
        setState(prev => ({
          ...prev,
          phaseSummary: { ...prev.phaseSummary, compose: { done: true } },
        }));
        break;

      case 'analysis':
        setState(prev => ({
          ...prev,
          entry: prev.entry
            ? { ...prev.entry, analysis: event.data as unknown as DigestEntry['analysis'] }
            : null,
        }));
        break;

      case 'complete': {
        const entryId = event.data.entryId as string;
        sessionIdRef.current = entryId;
        setState(prev => ({
          ...prev,
          phase: 'complete',
          phaseLabel: '分析完成',
          isRunning: false,
        }));
        // 加载完整条目（覆盖留底数据）
        fetch(`/api/entries?id=${entryId}`)
          .then(r => r.ok ? r.json() : null)
          .then(entry => {
            if (entry && !entry.error) {
              setState(prev => ({ ...prev, entry }));
            }
          });
        break;
      }

      case 'error':
        setState(prev => ({
          ...prev,
          phase: 'error',
          error: event.data.message as string,
          isRunning: false,
        }));
        break;
    }
  }, []);

  const respond = useCallback(async (answer: string) => {
    if (!sessionIdRef.current) return;
    setState(prev => ({ ...prev, question: null }));
    await fetch('/api/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionIdRef.current, answer }),
    });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setState(prev => ({ ...prev, isRunning: false }));
  }, []);

  return { ...state, start, respond, stop };
}
