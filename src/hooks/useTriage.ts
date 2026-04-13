'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { TriageBatch } from '@/lib/types';

interface TriageState {
  batchId: string | null;
  batch: TriageBatch | null;
  isSubmitting: boolean;
  isProcessing: boolean;
  error: string | null;
}

export function useTriage() {
  const [state, setState] = useState<TriageState>({
    batchId: null,
    batch: null,
    isSubmitting: false,
    isProcessing: false,
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

  // 重置
  const reset = useCallback(() => {
    stopPolling();
    setState({
      batchId: null,
      batch: null,
      isSubmitting: false,
      isProcessing: false,
      error: null,
    });
  }, [stopPolling]);

  // 统计
  const counts = {
    total: state.batch?.entries.length ?? 0,
    done: state.batch?.entries.filter(e => e.status === 'done').length ?? 0,
  };

  return {
    ...state,
    counts,
    submit,
    reset,
  };
}
