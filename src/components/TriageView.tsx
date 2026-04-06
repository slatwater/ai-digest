'use client';

import { useState, useCallback } from 'react';
import { useTriage } from '@/hooks/useTriage';
import { TriageCard } from './TriageCard';
import { TriageEntry } from '@/lib/types';

interface Props {
  triage: ReturnType<typeof useTriage>;
  onStartDigest: (urls: string[]) => void;
  onStartDeepResearch: (url: string) => void;
  onConfirm?: (stats: { saved: number; skipped: number }) => void;
  isDigestRunning?: boolean;
}

// verdict 排序权重
function verdictOrder(entry: TriageEntry, overrides: Record<string, string>): number {
  const v = overrides[entry.id] ?? entry.verdict;
  if (v === 'deep-dive') return 0;
  if (v === 'save') return 1;
  if (v === 'skip') return 2;
  return 3; // pending
}

export function TriageView({ triage, onStartDigest, onStartDeepResearch, onConfirm, isDigestRunning }: Props) {
  const [input, setInput] = useState('');
  const [singleUrl, setSingleUrl] = useState('');

  // 单条深度研究
  const handleSingleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!singleUrl.trim() || isDigestRunning) return;
    onStartDeepResearch(singleUrl.trim());
    setSingleUrl('');
  }, [singleUrl, isDigestRunning, onStartDeepResearch]);

  // 批量解析
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
  const validUrlCount = input.split('\n').filter(l => l.trim().startsWith('http')).length;

  return (
    <div>
      {/* 空状态：输入区 */}
      {!hasBatch && (
        <div className="py-12">
          {/* ── 批量解析 ── */}
          <div
            className="rounded-lg px-6 py-6"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <h2
              className="font-semibold tracking-tight"
              style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}
            >
              批量解析
            </h2>
            <p
              className="mt-1"
              style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', lineHeight: '1.5' }}
            >
              粘贴多个链接，逐一快速扫描后选择方向
            </p>
            <form onSubmit={handleSubmit} className="mt-4">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={'每行一个链接\nhttps://...\nhttps://...'}
                rows={4}
                className="w-full px-4 py-3 rounded-md resize-none"
                style={{
                  fontSize: 'var(--text-sm)',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  lineHeight: '1.8',
                }}
                disabled={triage.isSubmitting}
              />
              <div className="flex items-center justify-between mt-3">
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
                  {validUrlCount} 条有效链接
                </span>
                <button
                  type="submit"
                  disabled={triage.isSubmitting || !input.trim()}
                  className="btn btn-primary px-5 py-2 rounded-md font-medium"
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  {triage.isSubmitting ? '提交中...' : '开始解析'}
                </button>
              </div>
            </form>
          </div>

          {/* ── 深度研究 ── */}
          <div className="mt-5 px-6 py-5 rounded-lg" style={{ border: '1px solid var(--border-subtle)' }}>
            <h2
              className="font-semibold tracking-tight"
              style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}
            >
              深度研究
            </h2>
            <p
              className="mt-1"
              style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', lineHeight: '1.5' }}
            >
              单条链接，跳过筛选直接全面分析
            </p>
            <form onSubmit={handleSingleSubmit} className="mt-4 flex gap-3">
              <input
                type="url"
                value={singleUrl}
                onChange={e => setSingleUrl(e.target.value)}
                placeholder="粘贴链接"
                disabled={isDigestRunning}
                className="input-field flex-1 px-4 py-2 rounded-md"
                style={{
                  fontSize: 'var(--text-sm)',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              {isDigestRunning ? (
                <span
                  className="px-4 py-2 rounded-md font-medium flex items-center gap-2"
                  style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
                  研究中
                </span>
              ) : (
                <button
                  type="submit"
                  disabled={!singleUrl.trim()}
                  className="btn btn-primary px-5 py-2 rounded-md font-medium"
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  研究
                </button>
              )}
            </form>
          </div>
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
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2
                className="font-semibold tracking-tight"
                style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}
              >
                解析结果
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

          {triage.isProcessing && (
            <div className="mb-6 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-subtle)' }}>
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
