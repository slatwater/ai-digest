'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { TriageBatch, TriageVerdict } from '@/lib/types';

interface TriageState {
  batchId: string | null;
  batch: TriageBatch | null;
  isSubmitting: boolean;
  isProcessing: boolean;
  overrides: Record<string, TriageVerdict>;
  error: string | null;
}

export function useTriage() {
  const [state, setState] = useState<TriageState>({
    batchId: null,
    batch: null,
    isSubmitting: false,
    isProcessing: false,
    overrides: {},
    error: null,
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 清理轮询
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // 卸载时清理
  useEffect(() => stopPolling, [stopPolling]);

  // 轮询 batch 状态
  const startPolling = useCallback((batchId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/triage?batchId=${batchId}`);
        if (!res.ok) return;
        const batch: TriageBatch = await res.json();
        setState(prev => ({
          ...prev,
          batch,
          isProcessing: batch.status === 'processing',
        }));
        if (batch.status === 'done') {
          stopPolling();
        }
      } catch {
        // 轮询失败静默忽略
      }
    }, 3000);
  }, [stopPolling]);

  // 提交 URLs
  const submit = useCallback(async (urls: string[]) => {
    setState(prev => ({
      ...prev,
      isSubmitting: true,
      error: null,
      batch: null,
      batchId: null,
      overrides: {},
    }));

    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '提交失败');
      }

      const { batchId } = await res.json();

      // 立即创建占位 batch，让视图直接切换到骨架屏
      const placeholderBatch: TriageBatch = {
        id: batchId,
        createdAt: new Date().toISOString(),
        status: 'processing',
        entries: urls.map((url, i) => ({
          id: `${batchId}-${i}`,
          url,
          title: url,
          status: 'pending' as const,
        })),
      };

      setState(prev => ({
        ...prev,
        batchId,
        batch: placeholderBatch,
        isSubmitting: false,
        isProcessing: true,
      }));

      startPolling(batchId);
    } catch (error) {
      setState(prev => ({
        ...prev,
        isSubmitting: false,
        error: (error as Error).message,
      }));
    }
  }, [startPolling]);

  // 用户改判
  const setVerdict = useCallback((entryId: string, verdict: TriageVerdict) => {
    setState(prev => ({
      ...prev,
      overrides: { ...prev.overrides, [entryId]: verdict },
    }));
  }, []);

  // 获取条目的最终 verdict（用户覆盖 > 系统建议）
  const getVerdict = useCallback((entryId: string): TriageVerdict | undefined => {
    if (state.overrides[entryId]) return state.overrides[entryId];
    const entry = state.batch?.entries.find(e => e.id === entryId);
    return entry?.verdict;
  }, [state.overrides, state.batch]);

  // 确认：deep-dive 返回 URL 列表，save 存入知识库
  const confirm = useCallback(async (): Promise<string[]> => {
    if (!state.batch) return [];

    const deepDiveUrls: string[] = [];

    for (const entry of state.batch.entries) {
      const v = state.overrides[entry.id] ?? entry.verdict;

      if (v === 'deep-dive') {
        deepDiveUrls.push(entry.url);
      } else if (v === 'save' && entry.status === 'done') {
        // 留底：把研判提取的知识点一并存入知识库
        const conceptsMd = entry.concepts?.map(c =>
          `### ${c.name}\n\n**溯源：** ${c.root}\n\n**能做什么：** ${c.whatItEnables}${c.sourceUrl ? `\n\n**来源：** ${c.sourceUrl}` : ''}`
        ).join('\n\n') || '';

        await fetch('/api/entries', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: entry.id,
            url: entry.url,
            title: entry.title,
            tldr: entry.explanation || '',
            tags: entry.concepts?.map(c => c.name) || [],
            concepts: entry.concepts,
            scores: entry.scores,
            verdictReason: entry.verdictReason,
            fullMarkdown: conceptsMd,
          }),
        }).catch(() => { /* 静默 */ });
      }
    }

    return deepDiveUrls;
  }, [state.batch, state.overrides]);

  // 重置
  const reset = useCallback(() => {
    stopPolling();
    setState({
      batchId: null,
      batch: null,
      isSubmitting: false,
      isProcessing: false,
      overrides: {},
      error: null,
    });
  }, [stopPolling]);

  // 统计
  const counts = {
    total: state.batch?.entries.length ?? 0,
    done: state.batch?.entries.filter(e => e.status === 'done').length ?? 0,
    'deep-dive': 0,
    save: 0,
    skip: 0,
  };

  if (state.batch) {
    for (const entry of state.batch.entries) {
      const v = state.overrides[entry.id] ?? entry.verdict;
      if (v === 'deep-dive') counts['deep-dive']++;
      else if (v === 'save') counts.save++;
      else if (v === 'skip') counts.skip++;
    }
  }

  return {
    ...state,
    counts,
    submit,
    setVerdict,
    getVerdict,
    confirm,
    reset,
  };
}
