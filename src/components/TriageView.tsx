'use client';

import { useState, useCallback } from 'react';
import { useTriage } from '@/hooks/useTriage';
import { TriageSection } from './TriageSection';
import { TriageEntry, TriageModel } from '@/lib/types';

interface Props {
  triage: ReturnType<typeof useTriage>;
  onExpand?: (entry: TriageEntry, question: string) => void;
}

// ── 处理工单（逐步打勾进度） ──
function ProcessingEntry({ entry }: { entry: TriageEntry }) {
  const isProcessing = entry.status === 'processing';
  const phases = entry.livePhases || [];
  const current = entry.liveStatus;

  return (
    <div className="py-4">
      {/* 头部 */}
      <div className="flex items-center gap-3 mb-3">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: isProcessing ? 'var(--text-new)' : 'var(--text-quaternary)', fontWeight: 500 }}>
          {isProcessing ? 'processing' : 'queued'}
        </span>
        <div className="flex-1 h-px" style={{ background: isProcessing ? 'var(--border-new)' : 'var(--border-subtle)' }} />
      </div>

      {/* URL */}
      <div className="truncate mb-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
        {entry.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
      </div>

      {/* 阶段进度 */}
      {isProcessing && (phases.length > 0 || current) && (
        <div className="flex items-center gap-3 flex-wrap" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
          {phases.map((phase, i) => (
            <span key={i} className="flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
              <span style={{ color: 'var(--text-new)' }}>✓</span>
              {phase}
            </span>
          ))}
          {current && (
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-new)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-new)', animation: 'pulseDot 2s ease-in-out infinite' }} />
              {current}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function TriageView({ triage, onExpand }: Props) {
  const [input, setInput] = useState('');
  const [model, setModel] = useState<TriageModel>('sonnet');

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const urls = input.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
    if (urls.length === 0) return;
    triage.submit(urls, model);
  }, [input, triage, model]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
  }, [handleSubmit]);

  const hasBatch = triage.batch !== null;
  const validUrlCount = input.split('\n').filter(l => l.trim().startsWith('http')).length;
  const hasUrls = validUrlCount > 0;
  const allDone = hasBatch && !triage.isProcessing;
  const doneEntries = triage.batch?.entries.filter(e => e.status === 'done') || [];
  const processingEntries = triage.batch?.entries.filter(e => e.status === 'pending' || e.status === 'processing') || [];
  const errorEntries = triage.batch?.entries.filter(e => e.status === 'error') || [];

  // ═══ 空态 ═══
  if (!hasBatch) {
    return (
      <div className="h-full relative overflow-hidden">
        {/* 渐变光晕 */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: [
            'radial-gradient(ellipse 900px 700px at 25% 35%, oklch(94% 0.035 192 / 0.35) 0%, transparent 70%)',
            'radial-gradient(ellipse 700px 600px at 75% 55%, oklch(95% 0.025 260 / 0.25) 0%, transparent 70%)',
            'radial-gradient(ellipse 500px 400px at 55% 85%, oklch(96% 0.02 320 / 0.15) 0%, transparent 70%)',
          ].join(', '),
        }} />

        {/* 内容 */}
        <div className="relative h-full flex flex-col items-center justify-center" style={{ zIndex: 1 }}>
          <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 480, padding: '0 24px' }}>
            {triage.error && (
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--error)', marginBottom: 16 }}>{triage.error}</p>
            )}

            {/* 毛玻璃卡片 */}
            <div
              style={{
                background: hasUrls ? 'oklch(100% 0 0 / 0.75)' : 'oklch(100% 0 0 / 0.55)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: hasUrls ? '1px solid var(--border-new)' : '1px solid oklch(90% 0.005 260 / 0.6)',
                borderRadius: 16,
                padding: '28px 28px 20px',
                boxShadow: hasUrls
                  ? '0 0 0 1px oklch(55% 0.15 192 / 0.08), 0 8px 40px oklch(55% 0.15 192 / 0.06)'
                  : '0 0 0 1px oklch(0% 0 0 / 0.03), 0 8px 32px oklch(0% 0 0 / 0.04)',
                transition: 'border-color 0.3s, box-shadow 0.3s, background 0.3s',
              }}
            >
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="粘贴链接，每行一个"
                rows={4}
                autoFocus
                className="w-full resize-none"
                style={{
                  fontSize: 'var(--text-sm)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  lineHeight: '2',
                  padding: 0,
                  outline: 'none',
                }}
                disabled={triage.isSubmitting}
              />

              {/* 卡片内底栏 */}
              <div
                className="flex items-center justify-between pt-3 mt-2"
                style={{ borderTop: '1px solid oklch(90% 0.005 260 / 0.4)' }}
              >
                <span className="flex items-center gap-3">
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}>
                    {hasUrls ? `${validUrlCount} 条链接` : '自动溯源 · 识别具名技术 · 匹配 Wiki'}
                  </span>
                  {hasUrls && (
                    <span
                      className="inline-flex items-center"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        background: 'oklch(96% 0.005 260 / 0.6)',
                        borderRadius: 6,
                        overflow: 'hidden',
                      }}
                    >
                      {(['sonnet', 'opus'] as TriageModel[]).map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setModel(m)}
                          style={{
                            padding: '3px 10px',
                            color: model === m ? 'var(--text-new)' : 'var(--text-quaternary)',
                            background: model === m ? 'oklch(100% 0 0 / 0.8)' : 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            fontSize: 'inherit',
                            fontWeight: model === m ? 600 : 400,
                            transition: 'all 0.15s',
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    </span>
                  )}
                </span>

                <button
                  type="submit"
                  disabled={triage.isSubmitting || !hasUrls}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    color: hasUrls ? 'var(--text-new)' : 'var(--text-quaternary)',
                    background: 'none',
                    border: 'none',
                    cursor: hasUrls ? 'pointer' : 'default',
                    opacity: hasUrls ? 1 : 0,
                    transition: 'opacity 0.2s, color 0.2s',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {triage.isSubmitting ? '解析中...' : '解析 →'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ═══ 有 batch ═══
  return (
    <div className="max-w-[860px] mx-auto px-8 py-10 pb-24">
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
          {triage.isProcessing && (
            <span className="flex items-center gap-2" style={{ color: 'var(--text-new)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--text-new)', animation: 'pulseDot 2s ease-in-out infinite' }} />
              {triage.counts.done}/{triage.counts.total}
            </span>
          )}
          {allDone && (() => {
            const totalConcepts = doneEntries.reduce((s, e) => s + (e.concepts?.length || 0), 0);
            const usages = doneEntries.map(e => e.tokenUsage).filter(Boolean);
            const totalInput = usages.reduce((s, u) => s + (u!.inputTokens + u!.cacheReadTokens), 0);
            const totalOutput = usages.reduce((s, u) => s + u!.outputTokens, 0);
            const usedModel = usages[0]?.model;
            return (
              <span style={{ color: 'var(--text-tertiary)' }}>
                {triage.counts.total} 条解析完成
                {totalConcepts > 0 && ` · ${totalConcepts} 概念`}
                {usages.length > 0 && (
                  <span style={{ color: 'var(--text-quaternary)', marginLeft: 8 }}>
                    {usedModel && `${usedModel} · `}
                    {totalInput > 1000 ? `${(totalInput / 1000).toFixed(1)}k` : totalInput} in
                    {' / '}
                    {totalOutput > 1000 ? `${(totalOutput / 1000).toFixed(1)}k` : totalOutput} out
                  </span>
                )}
              </span>
            );
          })()}
        </div>
        <button onClick={() => triage.reset()}
          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-quaternary)')}>
          重新开始
        </button>
      </div>

      {doneEntries.map((entry, i) => (
        <div key={entry.id} style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <TriageSection entry={entry} index={i + 1} onExpand={onExpand} />
        </div>
      ))}

      {processingEntries.length > 0 && (
        <div className="rounded -mx-4 px-4" style={{ background: 'var(--bg-processing)' }}>
          {processingEntries.map(entry => <ProcessingEntry key={entry.id} entry={entry} />)}
        </div>
      )}

      {errorEntries.map(entry => (
        <div key={entry.id} className="py-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--error)' }}>
          {entry.title} — {entry.error || '解析失败'}
        </div>
      ))}

    </div>
  );
}
