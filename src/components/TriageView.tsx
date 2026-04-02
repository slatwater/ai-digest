'use client';

import { useState, useCallback } from 'react';
import { useTriage } from '@/hooks/useTriage';
import { TriageCard } from './TriageCard';
import { TriageEntry } from '@/lib/types';

interface Props {
  onStartDigest: (urls: string[]) => void;
  onConfirm?: (stats: { saved: number; skipped: number }) => void;
}

// verdict 排序权重
function verdictOrder(entry: TriageEntry, overrides: Record<string, string>): number {
  const v = overrides[entry.id] ?? entry.verdict;
  if (v === 'deep-dive') return 0;
  if (v === 'save') return 1;
  if (v === 'skip') return 2;
  return 3; // pending
}

export function TriageView({ onStartDigest, onConfirm }: Props) {
  const triage = useTriage();
  const [input, setInput] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const urls = input
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('http'));
    if (urls.length === 0) return;
    triage.submit(urls);
  }, [input, triage]);

  const handleConfirm = useCallback(async () => {
    const saved = triage.counts.save;
    const skipped = triage.counts.skip;
    const urls = await triage.confirm();
    if (urls.length > 0) {
      onStartDigest(urls);
    }
    onConfirm?.({ saved, skipped });
    triage.reset();
  }, [triage, onStartDigest, onConfirm]);

  // 排序：deep-dive > save > skip > pending
  const sortedEntries = triage.batch?.entries
    ? [...triage.batch.entries].sort((a, b) => {
        const oa = verdictOrder(a, triage.overrides);
        const ob = verdictOrder(b, triage.overrides);
        return oa - ob;
      })
    : [];

  const hasBatch = triage.batch !== null;
  const hasResults = sortedEntries.some(e => e.status === 'done');
  const allDone = triage.batch?.status === 'done';

  return (
    <div>
      {/* 空状态：输入区 */}
      {!hasBatch && (
        <div className="py-12">
          <h2
            className="font-semibold tracking-tight leading-tight"
            style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
          >
            每日研判
          </h2>
          <p
            className="mt-2"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: '1.6' }}
          >
            粘贴今天收藏的链接，系统逐一研究底层技术，帮你决定哪些值得深入。
          </p>

          <form onSubmit={handleSubmit} className="mt-8">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={'粘贴链接，每行一个\nhttps://...\nhttps://...'}
              rows={5}
              className="w-full px-4 py-3 rounded-md resize-none"
              style={{
                fontSize: 'var(--text-sm)',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                lineHeight: '1.8',
              }}
              disabled={triage.isSubmitting}
            />
            <div className="flex items-center justify-between mt-4">
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
                {input.split('\n').filter(l => l.trim().startsWith('http')).length} 条有效链接
              </span>
              <button
                type="submit"
                disabled={triage.isSubmitting || !input.trim()}
                className="btn btn-primary px-5 py-2.5 rounded-md font-medium"
                style={{ fontSize: 'var(--text-sm)' }}
              >
                {triage.isSubmitting ? '提交中...' : '开始研判'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Error */}
      {triage.error && (
        <div
          className="mb-6 px-4 py-3 rounded-md"
          style={{ background: 'var(--error-bg)', fontSize: 'var(--text-sm)', color: 'var(--error)' }}
        >
          {triage.error}
        </div>
      )}

      {/* Batch 处理中 / 完成 */}
      {hasBatch && (
        <div>
          {/* 头部 */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2
                className="font-semibold tracking-tight"
                style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}
              >
                研判结果
              </h2>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                {triage.isProcessing
                  ? `正在处理... ${triage.counts.done}/${triage.counts.total}`
                  : `${triage.counts.total} 条处理完成`
                }
              </p>
            </div>
            <button
              onClick={() => triage.reset()}
              className="link-subtle"
              style={{ fontSize: 'var(--text-xs)' }}
            >
              重新开始
            </button>
          </div>

          {/* 进度条 */}
          {triage.isProcessing && (
            <div
              className="mb-6 h-1 rounded-full overflow-hidden"
              style={{ background: 'var(--bg-subtle)' }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  background: 'var(--accent)',
                  width: `${triage.counts.total > 0 ? (triage.counts.done / triage.counts.total) * 100 : 0}%`,
                  transition: 'width 0.5s ease-out',
                }}
              />
            </div>
          )}

          {/* 卡片列表 */}
          <div className="space-y-3">
            {sortedEntries.map(entry => (
              <TriageCard
                key={entry.id}
                entry={entry}
                verdict={triage.getVerdict(entry.id)}
                onVerdictChange={(v) => triage.setVerdict(entry.id, v)}
              />
            ))}
          </div>

          {/* 底部确认栏 */}
          {hasResults && (
            <div
              className="mt-8 px-5 py-4 rounded-lg flex items-center justify-between"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
            >
              <div className="flex gap-4" style={{ fontSize: 'var(--text-sm)' }}>
                {triage.counts['deep-dive'] > 0 && (
                  <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                    {triage.counts['deep-dive']} 深入
                  </span>
                )}
                {triage.counts.save > 0 && (
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {triage.counts.save} 留底
                  </span>
                )}
                {triage.counts.skip > 0 && (
                  <span style={{ color: 'var(--text-quaternary)' }}>
                    {triage.counts.skip} 跳过
                  </span>
                )}
              </div>
              <button
                onClick={handleConfirm}
                disabled={!allDone}
                className="btn btn-primary px-5 py-2.5 rounded-md font-medium"
                style={{ fontSize: 'var(--text-sm)' }}
              >
                {!allDone
                  ? '等待处理完成...'
                  : triage.counts['deep-dive'] > 0
                    ? `确认，开始研究 ${triage.counts['deep-dive']} 条`
                    : triage.counts.save > 0
                      ? `确认，留底 ${triage.counts.save} 条`
                      : '确认，全部跳过'
                }
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
