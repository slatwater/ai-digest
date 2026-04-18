'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTriage } from '@/hooks/useTriage';
import { TriageSection } from './TriageSection';
import { TriageEntry, TriageModel } from '@/lib/types';

// ── B 方向视觉常量 ──
const INK = '#1a1713';
const RED = '#c94a1a';
const MUTE = '#7a6f60';
const PAPER = '#f4ede0';
const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menrow, monospace';

// fig.01 · pipeline 动画带：粘贴 → 解析 → 卡片 → 沉淀
function FlowStripB() {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const loop = (now: number) => {
      setT(((now - start) / 6000) % 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const stage = Math.min(3, Math.floor(t * 4));
  const local = (t * 4) - stage;

  const panelW = 148, gap = 16, panelH = 96;

  const Panel = ({ children, active, done, label, idx }: { children: React.ReactNode; active: boolean; done: boolean; label: [string, string]; idx: number }) => (
    <div style={{ position: 'relative', width: panelW, flex: '0 0 auto' }}>
      <div style={{ fontFamily: MONO, fontSize: 9, color: active ? RED : MUTE, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
        <span>step.{String(idx + 1).padStart(2, '0')}</span>
        <span style={{ opacity: active ? 1 : 0.4 }}>{active ? '● running' : done ? '✓ done' : '○ idle'}</span>
      </div>
      <div style={{ border: `1px solid ${INK}`, borderRadius: 1, background: active ? 'rgba(201,74,26,0.04)' : 'rgba(255,252,244,0.8)', boxShadow: active ? `2px 2px 0 ${RED}` : `2px 2px 0 ${INK}`, padding: '10px 12px', height: panelH, position: 'relative', transition: 'all 220ms cubic-bezier(0.25,1,0.5,1)', overflow: 'hidden' }}>
        {children}
        {active && <div style={{ position: 'absolute', left: 0, right: 0, top: -1, height: 2, background: RED, animation: 'scan 1.2s linear infinite' }} />}
      </div>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: INK, marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontWeight: 500 }}>{label[0]}</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: MUTE }}>{label[1]}</span>
      </div>
    </div>
  );

  const Connector = ({ idx }: { idx: number }) => {
    const done = stage > idx;
    const prog = stage === idx ? Math.min(1, local * 1.4) : (done ? 1 : 0);
    return (
      <div style={{ position: 'relative', width: gap * 2, height: panelH, marginTop: 15, flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
        <svg width={gap * 2} height={panelH} viewBox={`0 0 ${gap * 2} ${panelH}`} style={{ overflow: 'visible' }}>
          <line x1="2" y1={panelH / 2} x2={gap * 2 - 2} y2={panelH / 2} stroke={INK} strokeWidth="1" opacity="0.25" strokeDasharray="2 3" />
          <line x1="2" y1={panelH / 2} x2={2 + (gap * 2 - 4) * prog} y2={panelH / 2} stroke={RED} strokeWidth="1.5" />
          {prog > 0.3 && (
            <g transform={`translate(${2 + (gap * 2 - 4) * prog}, ${panelH / 2})`} opacity={Math.min(1, (prog - 0.3) * 3)}>
              <path d="M0 0 L-4 -3 L-4 3 Z" fill={RED} />
            </g>
          )}
        </svg>
      </div>
    );
  };

  const typedLines = stage === 0 ? Math.min(3, Math.ceil(local * 3.2)) : 3;
  const parseProg = stage === 1 ? local : stage > 1 ? 1 : 0;
  const cardProg = stage === 2 ? local : stage > 2 ? 1 : 0;
  const archiveProg = stage === 3 ? local : 0;

  return (
    <div style={{ border: `1px dashed ${INK}`, borderRadius: 1, background: 'rgba(255,252,244,0.4)', padding: '14px 20px 10px', marginBottom: 20, position: 'relative' }}>
      <div style={{ position: 'absolute', top: -1, left: 14, padding: '0 8px', background: PAPER, fontFamily: MONO, fontSize: 9, color: MUTE, letterSpacing: 1.6, textTransform: 'uppercase', transform: 'translateY(-50%)' }}>
        fig.01 · pipeline schematic · auto-cycle
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <Panel idx={0} active={stage === 0} done={stage > 0} label={['粘贴', 'paste']}>
          <div style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.8, color: INK }}>
            {['arxiv.org/abs/2501…', 'github.com/dm/flex', 'twitter.com/…/status'].slice(0, typedLines).map((s, i) => (
              <div key={i} style={{ opacity: stage === 0 && i === typedLines - 1 ? 0.55 : 1 }}>
                <span style={{ color: RED }}>›</span>&nbsp;{s}
              </div>
            ))}
            {stage === 0 && typedLines < 3 && <span style={{ display: 'inline-block', width: 6, height: 11, background: INK, animation: 'blink 0.8s step-end infinite', verticalAlign: 'middle' }} />}
          </div>
        </Panel>
        <Connector idx={0} />
        <Panel idx={1} active={stage === 1} done={stage > 1} label={['解析', 'triage']}>
          <div style={{ fontFamily: MONO, fontSize: 9, color: MUTE, lineHeight: 1.8 }}>
            <div>fetching → arxiv</div>
            <div style={{ opacity: parseProg > 0.3 ? 1 : 0.3 }}>↳ follow → doi.org</div>
            <div style={{ opacity: parseProg > 0.6 ? 1 : 0.3 }}>↳ extract → pdf</div>
          </div>
          <div style={{ position: 'absolute', right: 10, bottom: 8 }}>
            <svg width="22" height="22" viewBox="0 0 22 22">
              <circle cx="11" cy="11" r="8" fill="none" stroke={INK} strokeWidth="1" opacity="0.2" />
              <circle cx="11" cy="11" r="8" fill="none" stroke={RED} strokeWidth="1.5" strokeDasharray={`${50.3 * parseProg} 50.3`} transform="rotate(-90 11 11)" />
            </svg>
          </div>
        </Panel>
        <Connector idx={1} />
        <Panel idx={2} active={stage === 2} done={stage > 2} label={['卡片', 'card']}>
          <div style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: 12, fontWeight: 500, color: INK, lineHeight: 1.25, marginBottom: 6, opacity: Math.min(1, cardProg * 2) }}>
            FlexAttention<br />Kernels
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
            {['attn', 'kernel', 'tri'].map((c, i) => (
              <span key={c} style={{ fontFamily: MONO, fontSize: 8, padding: '1px 5px', border: `0.5px solid ${INK}`, opacity: cardProg > 0.2 + i * 0.15 ? 1 : 0, transition: 'opacity 200ms', color: INK }}>{c}</span>
            ))}
          </div>
          <svg width="100%" height="8" style={{ opacity: cardProg > 0.7 ? 1 : 0 }}>
            <line x1="0" y1="4" x2="100%" y2="4" stroke={INK} strokeWidth="0.5" opacity="0.3" strokeDasharray="2 2" />
          </svg>
          <div style={{ fontFamily: MONO, fontSize: 8, color: MUTE, opacity: cardProg > 0.7 ? 1 : 0, marginTop: 2 }}>
            3 sources · novel
          </div>
        </Panel>
        <Connector idx={2} />
        <Panel idx={3} active={stage === 3} done={false} label={['沉淀', 'wiki']}>
          <svg width="100%" height="70" viewBox="0 0 130 70" style={{ overflow: 'visible' }}>
            <rect x="8" y="52" width="114" height="12" fill="none" stroke={INK} strokeWidth="1" />
            <line x1="30" y1="52" x2="30" y2="64" stroke={INK} strokeWidth="0.5" />
            <line x1="52" y1="52" x2="52" y2="64" stroke={INK} strokeWidth="0.5" />
            <line x1="74" y1="52" x2="74" y2="64" stroke={INK} strokeWidth="0.5" />
            <line x1="96" y1="52" x2="96" y2="64" stroke={INK} strokeWidth="0.5" />
            <g transform={`translate(52, ${4 + archiveProg * 38})`} opacity={stage === 3 ? 1 : 0}>
              <rect x="0" y="0" width="22" height="14" fill="rgba(201,74,26,0.15)" stroke={RED} strokeWidth="1" />
              <line x1="3" y1="4" x2="19" y2="4" stroke={RED} strokeWidth="0.5" />
              <line x1="3" y1="7" x2="15" y2="7" stroke={RED} strokeWidth="0.5" opacity="0.6" />
              <line x1="3" y1="10" x2="17" y2="10" stroke={RED} strokeWidth="0.5" opacity="0.6" />
            </g>
            {[0.2, 0.4, 0.6, 0.8].map((p, i) => (
              <circle key={i} cx={63} cy={4 + p * 38 + 7} r="1" fill={RED} opacity={archiveProg > p ? 0.3 : 0} />
            ))}
          </svg>
          <div style={{ fontFamily: MONO, fontSize: 8, color: MUTE, textAlign: 'center', marginTop: 2 }}>
            wiki / ai-tools
          </div>
        </Panel>
      </div>
      <div style={{ display: 'flex', gap: 24, justifyContent: 'flex-end', fontFamily: MONO, fontSize: 9, color: MUTE, letterSpacing: 0.6, marginTop: 12, paddingTop: 8, borderTop: '1px dotted rgba(26,23,19,0.2)' }}>
        <span><span style={{ color: RED }}>━━</span> active</span>
        <span><span style={{ color: INK }}>── ── ──</span> path</span>
        <span>cycle 6.0s</span>
      </div>
    </div>
  );
}

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
  const [runStamp, setRunStamp] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setRunStamp(`${d.toISOString().slice(0, 10)} · ${d.toTimeString().slice(0, 8)}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

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

  // ═══ 空态 · 方向 B：暖米方格纸 / 朱砂红 / 实验室笔记本 ═══
  if (!hasBatch) {
    const lineCount = Math.max(6, input.split('\n').length);
    return (
      <div className="min-h-full relative flex flex-col" style={{ background: PAPER, color: INK }}>
        {/* 4pt + 80pt 方格纸 */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `
            linear-gradient(to right, rgba(26,23,19,0.045) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(26,23,19,0.045) 1px, transparent 1px),
            linear-gradient(to right, rgba(26,23,19,0.09) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(26,23,19,0.09) 1px, transparent 1px)`,
          backgroundSize: '8px 8px, 8px 8px, 80px 80px, 80px 80px',
        }} />
        {/* 纸张噪点 */}
        <div className="absolute inset-0 pointer-events-none" style={{
          opacity: 0.5, mixBlendMode: 'multiply',
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0 0.05  0 0 0 0.12 0'/></filter><rect width='300' height='300' filter='url(%23n)'/></svg>")`,
        }} />

        {/* 右上瞄准器装饰 */}
        <svg style={{ position: 'absolute', top: 20, right: 32, zIndex: 1 }} width="96" height="96" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" fill="none" stroke={INK} strokeWidth="0.5" opacity="0.35" />
          <circle cx="60" cy="60" r="34" fill="none" stroke={INK} strokeWidth="0.5" opacity="0.35" strokeDasharray="2 3" />
          <line x1="0" y1="60" x2="120" y2="60" stroke={INK} strokeWidth="0.5" opacity="0.25" />
          <line x1="60" y1="0" x2="60" y2="120" stroke={INK} strokeWidth="0.5" opacity="0.25" />
          <circle cx="60" cy="60" r="3" fill={RED} />
          <text x="64" y="58" fontFamily="JetBrains Mono" fontSize="7" fill={INK} opacity="0.6">N.01</text>
        </svg>

        {/* 主栏 */}
        <div style={{ position: 'relative', zIndex: 2, padding: '24px 56px 0 56px', display: 'grid', gridTemplateColumns: '64px 1fr', gap: 20, flex: 1 }}>
          {/* 左边距 · 竖排运行元数据 */}
          <div style={{ fontFamily: MONO, fontSize: 10, color: MUTE, letterSpacing: 1.2, lineHeight: 1.6, paddingTop: 6, writingMode: 'vertical-rl', transform: 'rotate(180deg)', textTransform: 'uppercase' }}>
            RUN · {runStamp || '────────── · ────────'} · Operator Seven Stars
          </div>

          <div style={{ maxWidth: 900, width: '100%', margin: '0 auto' }}>
            {/* § 01 · Intake 段标 */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 12 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, color: RED, letterSpacing: 2, textTransform: 'uppercase' }}>§ 01 · Intake</div>
              <div style={{ flex: 1, borderTop: `1px solid ${INK}`, opacity: 0.25, marginTop: 4 }} />
              <div style={{ fontFamily: MONO, fontSize: 10, color: MUTE }}>
                {hasUrls ? `${validUrlCount} lines ready` : 'awaiting input'}
              </div>
            </div>

            {/* fig.01 pipeline 示意动画 */}
            <FlowStripB />

            {triage.error && (
              <div style={{ fontFamily: MONO, fontSize: 12, color: RED, marginBottom: 14, padding: '8px 12px', border: `1px dashed ${RED}`, background: 'rgba(201,74,26,0.06)' }}>
                ! {triage.error}
              </div>
            )}

            {/* 粘贴框主体 */}
            <form onSubmit={handleSubmit}>
              <div style={{ border: `1px solid ${INK}`, background: 'rgba(255,252,244,0.7)', boxShadow: `4px 4px 0 ${INK}`, position: 'relative' }}>
                {/* 顶部 header 条（深墨色） */}
                <div style={{ borderBottom: `1px solid ${INK}`, padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', background: INK, color: PAPER }}>
                  <span>── field-intake ─────────────────────────────────────────────────</span>
                  <span style={{ display: 'flex', gap: 12 }}>
                    <span>{validUrlCount} / ∞</span>
                    <span style={{ color: hasUrls ? '#5ce6b3' : PAPER }}>●</span>
                  </span>
                </div>

                {/* 输入区 · 行号 gutter + `>` prompt 列 + 等宽文字
                    行高 34 确保文字居中于每格，横线落在格底、不割字 */}
                <div style={{
                  position: 'relative', minHeight: 6 * 34 + 28,
                  backgroundImage: 'linear-gradient(to bottom, transparent 0, transparent 33px, rgba(26,23,19,0.08) 33px, rgba(26,23,19,0.08) 34px, transparent 34px)',
                  backgroundSize: '100% 34px',
                  backgroundPosition: '0 14px',
                  paddingTop: 14, paddingBottom: 14,
                }}>
                  {/* 行号 gutter */}
                  <div style={{
                    position: 'absolute', left: 0, top: 14, width: 44,
                    fontFamily: MONO, fontSize: 13, color: MUTE,
                    textAlign: 'right', paddingRight: 10, lineHeight: '34px',
                    pointerEvents: 'none', borderRight: '1px solid rgba(26,23,19,0.18)',
                  }}>
                    {Array.from({ length: lineCount }).map((_, i) => (
                      <div key={i} style={{ height: 34 }}>{String(i + 1).padStart(2, '0')}</div>
                    ))}
                  </div>
                  {/* `>` prompt 列 */}
                  <div style={{
                    position: 'absolute', left: 44, top: 14, width: 24,
                    fontFamily: MONO, fontSize: 13, color: RED, fontWeight: 600,
                    lineHeight: '34px', textAlign: 'center', pointerEvents: 'none',
                  }}>
                    {Array.from({ length: lineCount }).map((_, i) => (
                      <div key={i} style={{ height: 34 }}>&gt;</div>
                    ))}
                  </div>
                  {/* textarea — 与 gutter 同字号同行高 */}
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    rows={lineCount}
                    autoFocus
                    disabled={triage.isSubmitting}
                    className="resize-none"
                    style={{
                      display: 'block',
                      width: 'calc(100% - 72px - 20px)',
                      fontFamily: MONO, fontSize: 13, lineHeight: '34px', color: INK,
                      caretColor: INK,
                      background: 'transparent', border: 'none', outline: 'none',
                      padding: 0,
                      marginTop: 0, marginBottom: 0, marginLeft: 72, marginRight: 20,
                      verticalAlign: 'top',
                    }}
                  />
                  {/* 第一行占位闪烁光标 — 仅在未聚焦 & 未输入时显示 */}
                  {!input && !isFocused && (
                    <span style={{
                      position: 'absolute', left: 72, top: 14, height: 34,
                      display: 'flex', alignItems: 'center', pointerEvents: 'none',
                    }}>
                      <span style={{
                        display: 'inline-block', width: 2, height: 16,
                        background: INK, animation: 'blink 1s step-end infinite',
                      }} />
                    </span>
                  )}
                </div>

                {/* 底部：flags + triage 按钮 */}
                <div style={{ borderTop: '1px dashed rgba(26,23,19,0.35)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: MONO, fontSize: 11, color: '#4a4238', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>✓ auto-source</span>
                    <span>✓ detect-novelty</span>
                    <span>✓ match-wiki</span>
                    <span style={{ opacity: 0.4 }}>│</span>
                    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
                      <span style={{ opacity: 0.55, marginRight: 4 }}>model</span>
                      {([
                        { value: 'sonnet' as TriageModel, label: 'sonnet' },
                        { value: 'opus-4-6' as TriageModel, label: 'opus 4.6' },
                        { value: 'opus' as TriageModel, label: 'opus 4.7' },
                      ]).map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setModel(value)}
                          style={{
                            fontFamily: MONO, fontSize: 11, padding: '2px 8px',
                            border: `1px solid ${INK}`,
                            background: model === value ? INK : 'transparent',
                            color: model === value ? PAPER : INK,
                            cursor: 'pointer', marginLeft: -1,
                          }}
                        >{label}</button>
                      ))}
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={triage.isSubmitting || !hasUrls}
                    style={{
                      fontFamily: MONO, fontSize: 12,
                      background: hasUrls ? RED : 'rgba(122,111,96,0.5)',
                      color: PAPER, border: 'none',
                      padding: '8px 18px', letterSpacing: 1,
                      cursor: hasUrls && !triage.isSubmitting ? 'pointer' : 'not-allowed',
                      boxShadow: hasUrls ? `2px 2px 0 ${INK}` : 'none',
                      transition: 'transform 120ms, box-shadow 120ms',
                    }}
                    onMouseDown={e => { if (hasUrls) { e.currentTarget.style.transform = 'translate(2px,2px)'; e.currentTarget.style.boxShadow = `0 0 0 ${INK}`; } }}
                    onMouseUp={e => { if (hasUrls) { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `2px 2px 0 ${INK}`; } }}
                    onMouseLeave={e => { if (hasUrls) { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = `2px 2px 0 ${INK}`; } }}
                  >
                    {triage.isSubmitting ? 'triaging…' : 'triage  →'}
                  </button>
                </div>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: MUTE, marginTop: 10, display: 'flex', gap: 16 }}>
                <span>⌘↵ triage</span>
                <span style={{ opacity: 0.3 }}>∙</span>
                <span>⇧↵ newline</span>
              </div>
            </form>
          </div>
        </div>

        {/* 底部刻度尺 */}
        <div style={{ position: 'relative', zIndex: 2, margin: '20px auto 12px', paddingLeft: 84, paddingRight: 0, maxWidth: 900 + 84 + 56, width: 'calc(100% - 112px)', display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, fontSize: 9, color: MUTE }}>
          <span>0</span>
          <div style={{ flex: 1, height: 8, position: 'relative', borderTop: `1px solid ${INK}`, opacity: 0.3 }}>
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} style={{ position: 'absolute', top: 0, left: `${i * 5}%`, width: 1, height: i % 5 === 0 ? 6 : 3, background: INK, opacity: 0.6 }} />
            ))}
          </div>
          <span>log ▸</span>
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
            const rawModel = usages[0]?.model;
            const usedModel = rawModel === 'opus-4-6' ? 'opus 4.6' : rawModel === 'opus' ? 'opus 4.7' : rawModel;
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
