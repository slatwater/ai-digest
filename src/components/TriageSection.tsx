'use client';

import { useState, Fragment } from 'react';
import { TriageEntry, TriageConcept, SourceInfo } from '@/lib/types';

// ── B 方向视觉常量 ──
const INK = '#1a1713';
const INK2 = '#4a4238';
const INK3 = '#7a6f60';
const RED = '#c94a1a';
const PAPER = '#f4ede0';
const PAPER_WARM = '#fff7e8';
const ERR = 'oklch(55% 0.2 25)';
const MONO = '"JetBrains Mono", ui-monospace, monospace';
const SERIF = 'var(--font-fraunces), Georgia, serif';

interface Props {
  entry: TriageEntry;
  index: number;
  onExpand?: (entry: TriageEntry, question: string) => void;
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
function getPath(url: string): string {
  try { const u = new URL(url); return u.pathname + (u.search || ''); } catch { return ''; }
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatDuration(ms?: number): string {
  if (!ms) return '—';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}m ${r}s`;
}

// 解析「新增量」：有 delta.gap 且无 relatedEntries 为 novel；有相关条目为 incremental；skip 为 known
type Novelty = 'novel' | 'incremental' | 'known';
function deriveNovelty(entry: TriageEntry): Novelty {
  if (entry.verdict === 'skip') return 'known';
  const hasRelated = (entry.relatedEntries?.length ?? 0) > 0;
  return hasRelated ? 'incremental' : 'novel';
}

// ── Novelty 徽章 ──
function NoveltyBadge({ novelty }: { novelty: Novelty }) {
  const map: Record<Novelty, { label: string; sub: string; tone: 'red' | 'ink' | 'mute' }> = {
    novel: { label: 'NOVEL', sub: '新增量', tone: 'red' },
    incremental: { label: 'INCREMENT', sub: '迭代', tone: 'ink' },
    known: { label: 'KNOWN', sub: '已知', tone: 'mute' },
  };
  const m = map[novelty];
  const colors = {
    red: { bg: RED, fg: PAPER, line: RED },
    ink: { bg: 'transparent', fg: INK, line: INK },
    mute: { bg: 'transparent', fg: INK3, line: 'rgba(26,23,19,0.3)' },
  }[m.tone];
  return (
    <span style={{
      fontFamily: MONO,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 9, letterSpacing: 1.4,
      padding: '3px 8px',
      background: colors.bg, color: colors.fg,
      border: `1px solid ${colors.line}`,
    }}>
      <span style={{ fontWeight: 600 }}>{m.label}</span>
      <span style={{ opacity: 0.7 }}>{m.sub}</span>
    </span>
  );
}

// ── Narrative 渲染：[[name]] 红色虚线链接 + **bold** ──
function Narrative({ text, concepts }: { text: string; concepts: TriageConcept[] }) {
  const nodes: React.ReactNode[] = [];
  let idx = 0;
  const re = /(\*\*[^*]+\*\*)|(\[\[[^\]]+\]\])/g;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > idx) nodes.push(<Fragment key={`t${key++}`}>{text.slice(idx, m.index)}</Fragment>);
    const tok = m[0];
    if (tok.startsWith('**')) {
      nodes.push(<strong key={`b${key++}`} style={{ color: INK, fontWeight: 600 }}>{tok.slice(2, -2)}</strong>);
    } else {
      const inner = tok.slice(2, -2).split('|')[0];
      const concept = concepts.find(c => c.name.trim().toLowerCase() === inner.trim().toLowerCase());
      nodes.push(
        <a key={`a${key++}`} href={concept?.sourceUrl || '#'}
          target={concept?.sourceUrl ? '_blank' : undefined}
          rel="noopener noreferrer"
          style={{
            color: RED, textDecoration: 'none',
            borderBottom: `1px dashed ${RED}`,
            padding: '0 2px', whiteSpace: 'nowrap',
          }}>
          {inner}
        </a>
      );
    }
    idx = m.index + tok.length;
  }
  if (idx < text.length) nodes.push(<Fragment key={`t${key++}`}>{text.slice(idx)}</Fragment>);
  return (
    <div style={{
      fontSize: 14.5, lineHeight: 1.75, color: INK,
      whiteSpace: 'pre-wrap',
    }}>
      {nodes}
    </div>
  );
}

// ── 源头 kind 推断 ──
function kindFromSource(s: SourceInfo): string {
  switch (s.type) {
    case 'paper': return 'paper';
    case 'github': return 'code';
    case 'docs': return 'docs';
    case 'original': return 'blog';
    case 'related': return 'related';
    default: return 'link';
  }
}

// ── 处理中卡片 ──
function ProcessingCard({ entry, index }: { entry: TriageEntry; index: number }) {
  const current = entry.liveStatus || '正在解析';
  return (
    <article style={{
      border: `1px dashed ${INK}`,
      background: 'rgba(255,252,244,0.4)',
      marginBottom: 18,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: 2,
        background: RED, animation: 'scan 1.8s linear infinite',
        boxShadow: '0 0 8px rgba(201,74,26,0.6)',
      }} />
      <div style={{
        padding: '14px 20px', display: 'grid',
        gridTemplateColumns: 'auto 1fr auto', gap: 16, alignItems: 'center',
      }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: RED, letterSpacing: 1 }}>
          <span style={{ color: INK3, opacity: 0.6 }}>№</span>
          {String(index).padStart(2, '0')}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: MONO, fontSize: 12, color: INK2, marginBottom: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {entry.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: RED, letterSpacing: 0.5 }}>
            {current}
            <span style={{ marginLeft: 8, display: 'inline-flex', gap: 2 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  display: 'inline-block', width: 3, height: 3, borderRadius: '50%',
                  background: RED,
                  animation: `typingDot 1.2s ease-in-out infinite`,
                  animationDelay: `${i * 0.2}s`,
                }} />
              ))}
            </span>
          </div>
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 9, color: INK3, letterSpacing: 1.4,
          textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8,
            border: `1.5px solid ${RED}`, borderTopColor: 'transparent', borderRadius: '50%',
            animation: 'drift 0.9s linear infinite',
          }} />
          streaming
        </div>
      </div>
    </article>
  );
}

// ── 失败卡片 ──
function ErrorCard({ entry, index }: { entry: TriageEntry; index: number }) {
  return (
    <article style={{
      border: `1px solid ${ERR}`,
      background: 'rgba(220,60,30,0.03)',
      marginBottom: 18, padding: '12px 20px',
      display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, alignItems: 'center',
    }}>
      <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: ERR }}>
        <span style={{ opacity: 0.6 }}>№</span>{String(index).padStart(2, '0')}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: MONO, fontSize: 11, color: ERR, fontWeight: 500,
          marginBottom: 3, letterSpacing: 0.3,
        }}>
          ✗ {entry.error || '解析失败'}
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 10, color: INK3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {entry.url}
        </div>
      </div>
      <a href={entry.url} target="_blank" rel="noopener noreferrer" style={{
        fontFamily: MONO, fontSize: 11, padding: '5px 12px',
        border: `1px solid ${ERR}`, color: ERR, textDecoration: 'none',
      }}>
        ↻ open
      </a>
    </article>
  );
}

// ══════════════════════════════════════
// 主组件：TriageSection (按实体状态分发)
// ══════════════════════════════════════
export function TriageSection({ entry, index, onExpand }: Props) {
  if (entry.status === 'error') return <ErrorCard entry={entry} index={index} />;
  if (entry.status === 'processing' || entry.status === 'pending') {
    return <ProcessingCard entry={entry} index={index} />;
  }
  return <DoneCard entry={entry} index={index} onExpand={onExpand} />;
}

// ── 完成卡片主体 ──
function DoneCard({ entry, index, onExpand }: Props) {
  const [expanded, setExpanded] = useState(index === 1);
  const [activeConcept, setActiveConcept] = useState<number | null>(null);

  const concepts = entry.concepts || [];
  const sources = entry.sources || [];
  const domain = getDomain(entry.url);
  const novelty = deriveNovelty(entry);

  const tokens = entry.tokenUsage
    ? formatTokens(entry.tokenUsage.inputTokens + entry.tokenUsage.outputTokens)
    : '—';
  const duration = formatDuration(entry.tokenUsage?.durationMs);

  const related = entry.relatedEntries?.[0];

  // 构造溯源链：第 1 条以 origin 模式展示；其余 linked
  const originIdx = (() => {
    const i = sources.findIndex(s => s.type === 'original' || s.type === 'paper');
    return i === -1 ? 0 : i;
  })();

  return (
    <article style={{
      border: `1px solid ${INK}`,
      background: 'rgba(255,252,244,0.85)',
      boxShadow: `3px 3px 0 ${INK}`,
      marginBottom: 28,
      position: 'relative',
      animation: 'fadeIn 0.3s ease-out',
    }}>
      {/* 卡片头 */}
      <div style={{
        borderBottom: expanded ? `1px solid ${INK}` : '1px dashed rgba(26,23,19,0.3)',
        padding: '12px 20px',
        display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, alignItems: 'center',
      }}>
        <div style={{
          fontFamily: MONO, fontSize: 11, fontWeight: 600, color: RED,
          letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ color: INK3, opacity: 0.6 }}>№</span>
          {String(index).padStart(2, '0')}
        </div>
        <button onClick={() => setExpanded(!expanded)} style={{
          textAlign: 'left', display: 'block', width: '100%',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        }}>
          <div style={{
            fontFamily: SERIF, fontSize: 21, fontWeight: 500, color: INK,
            lineHeight: 1.25, letterSpacing: -0.3,
          }}>
            {entry.title}
          </div>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NoveltyBadge novelty={novelty} />
          <button onClick={() => setExpanded(!expanded)} style={{
            fontFamily: MONO, fontSize: 10, color: INK3, letterSpacing: 1,
            width: 40, textAlign: 'right',
            background: 'none', border: 'none', cursor: 'pointer',
          }}>
            {expanded ? '[ −   ]' : '[ +   ]'}
          </button>
        </div>
      </div>

      {/* 元信息条 */}
      <div style={{
        fontFamily: MONO,
        padding: '8px 20px',
        display: 'flex', gap: 18, fontSize: 10, color: INK3,
        background: 'rgba(26,23,19,0.03)',
        borderBottom: expanded ? '1px dashed rgba(26,23,19,0.25)' : 'none',
        letterSpacing: 0.5, flexWrap: 'wrap',
      }}>
        <span style={{ color: RED }}>●</span>
        <a href={entry.url} target="_blank" rel="noopener noreferrer"
          style={{ color: INK3, textDecoration: 'none' }}>{domain}</a>
        <span style={{ opacity: 0.4 }}>│</span>
        <span>duration {duration}</span>
        <span style={{ opacity: 0.4 }}>│</span>
        <span>{tokens} tokens</span>
        <span style={{ opacity: 0.4 }}>│</span>
        <span>{sources.length} sources</span>
        {entry.verdictReason && (
          <>
            <span style={{ opacity: 0.4 }}>│</span>
            <span style={{ fontStyle: 'italic', color: INK2 }}>{entry.verdictReason}</span>
          </>
        )}
      </div>

      {expanded && (
        <div style={{ padding: '24px 32px 28px 32px' }}>
          {/* 概念 chips */}
          {concepts.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, alignItems: 'baseline' }}>
                <span style={{
                  fontFamily: MONO, fontSize: 10, color: INK3, letterSpacing: 1.2,
                  textTransform: 'uppercase', marginRight: 10, paddingTop: 4,
                }}>主角 · subjects →</span>
                {concepts.map((c, i) => {
                  const isActive = activeConcept === i;
                  const hasDesc = !!(c.root || c.whatItEnables);
                  const noteText = c.role === 'subject' ? '主角' : c.role === 'component' ? '组件' : null;
                  return (
                    <button key={i} onClick={() => setActiveConcept(isActive ? null : (hasDesc ? i : null))}
                      style={{
                        fontFamily: MONO,
                        display: 'inline-flex', alignItems: 'baseline', gap: 5,
                        fontSize: 11, color: isActive ? PAPER : INK,
                        border: `1px solid ${INK}`, padding: '3px 8px',
                        marginRight: -1, marginBottom: -1,
                        background: isActive ? INK : (i % 2 === 0 ? PAPER_WARM : PAPER),
                        cursor: hasDesc ? 'pointer' : 'default',
                        position: 'relative',
                      }}>
                      <span style={{ fontWeight: 500 }}>{c.name}</span>
                      {noteText && (
                        <span style={{
                          fontSize: 9,
                          color: isActive ? 'rgba(255,252,244,0.6)' : INK3,
                          opacity: isActive ? 1 : 0.8,
                        }}>/{noteText}</span>
                      )}
                      {hasDesc && (
                        <span style={{
                          fontSize: 9, marginLeft: 3,
                          color: isActive ? '#ff8a5c' : RED,
                        }}>{isActive ? '▾' : '▸'}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 详情面板 */}
              {activeConcept !== null && concepts[activeConcept] && (
                <div style={{
                  marginTop: 10,
                  padding: '12px 14px',
                  background: PAPER_WARM,
                  border: `1px solid ${INK}`,
                  borderLeft: `3px solid ${RED}`,
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 14, alignItems: 'start',
                  animation: 'fadeIn 0.18s ease-out',
                }}>
                  <span style={{
                    fontFamily: MONO, fontSize: 10, color: RED, letterSpacing: 1,
                    textTransform: 'uppercase', paddingTop: 3,
                  }}>详情 ·</span>
                  <div>
                    <div style={{
                      fontFamily: MONO, fontSize: 12, color: INK, fontWeight: 600, marginBottom: 3,
                    }}>
                      {concepts[activeConcept].name}
                      {concepts[activeConcept].role && (
                        <span style={{ fontSize: 10, color: INK3, fontWeight: 400, marginLeft: 6 }}>
                          / {concepts[activeConcept].role === 'subject' ? '主角' : '组件'}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.65, color: INK2 }}>
                      {concepts[activeConcept].root}
                      {concepts[activeConcept].whatItEnables && (
                        <div style={{ marginTop: 6, color: INK2 }}>
                          <span style={{ fontFamily: MONO, fontSize: 10, color: INK3, marginRight: 6 }}>→</span>
                          {concepts[activeConcept].whatItEnables}
                        </div>
                      )}
                    </div>
                    {concepts[activeConcept].sourceUrl && (
                      <div style={{
                        fontFamily: MONO, fontSize: 10, color: INK3, marginTop: 6, letterSpacing: 0.3,
                      }}>
                        → <a href={concepts[activeConcept].sourceUrl} target="_blank" rel="noopener noreferrer"
                          style={{ color: RED, textDecoration: 'none' }}>
                          {getDomain(concepts[activeConcept].sourceUrl!)}
                        </a>
                      </div>
                    )}
                  </div>
                  <button onClick={() => setActiveConcept(null)} style={{
                    fontFamily: MONO, fontSize: 11, color: INK3,
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px',
                  }}>×</button>
                </div>
              )}
            </div>
          )}

          {/* 叙述 */}
          {entry.narrative && (
            <div style={{
              display: 'grid', gridTemplateColumns: '36px 1fr', gap: 16, marginBottom: 24,
            }}>
              <div style={{
                fontFamily: MONO, fontSize: 9, color: INK3, letterSpacing: 1,
                textTransform: 'uppercase',
                writingMode: 'vertical-rl', transform: 'rotate(180deg)', paddingTop: 4,
              }}>
                narrative
              </div>
              <div>
                <Narrative text={entry.narrative} concepts={concepts} />
              </div>
            </div>
          )}

          {/* 溯源链 */}
          {sources.length > 0 && (
            <div style={{ paddingTop: 18, borderTop: '1px dashed rgba(26,23,19,0.25)' }}>
              <div style={{
                fontFamily: MONO, fontSize: 10, color: RED, letterSpacing: 1.4,
                textTransform: 'uppercase', marginBottom: 12,
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              }}>
                <span>─ 溯源链 · source trace</span>
                <span style={{ color: INK3 }}>{sources.length} 个节点</span>
              </div>
              <div>
                {sources.map((s, i) => {
                  const isOrigin = i === originIdx;
                  const isLast = i === sources.length - 1;
                  return (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '64px 1fr',
                      position: 'relative',
                    }}>
                      <div style={{
                        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
                      }}>
                        <div style={{
                          width: isOrigin ? 28 : 18,
                          height: isOrigin ? 28 : 18,
                          marginTop: isOrigin ? 2 : 7,
                          borderRadius: '50%',
                          border: isOrigin ? `2px solid ${RED}` : `1.5px solid ${INK}`,
                          background: isOrigin ? RED : PAPER,
                          display: 'grid', placeItems: 'center',
                          fontSize: isOrigin ? 11 : 9,
                          color: isOrigin ? PAPER : INK,
                          fontFamily: MONO,
                          fontWeight: isOrigin ? 700 : 500,
                          zIndex: 2,
                          boxShadow: isOrigin ? `0 0 0 3px ${PAPER}, 2px 2px 0 ${INK}` : 'none',
                        }}>
                          {isOrigin ? '◉' : String(i + 1).padStart(2, '0')}
                        </div>
                        {!isLast && (
                          <div style={{
                            width: 1, flex: 1,
                            background: `repeating-linear-gradient(to bottom, ${INK} 0 3px, transparent 3px 6px)`,
                            opacity: 0.5,
                            marginTop: 2, marginBottom: -6,
                            minHeight: 24,
                          }} />
                        )}
                      </div>
                      <div style={{
                        paddingBottom: isLast ? 4 : 18,
                        paddingLeft: 8,
                        paddingTop: isOrigin ? 0 : 4,
                      }}>
                        <div style={{
                          fontFamily: MONO,
                          fontSize: isOrigin ? 10 : 9,
                          color: isOrigin ? RED : INK3,
                          letterSpacing: 1.2, textTransform: 'uppercase',
                          marginBottom: 3,
                          fontWeight: isOrigin ? 600 : 400,
                        }}>
                          {isOrigin
                            ? '※ 源头 · origin'
                            : <>↳ 发现自 正文 · {s.type === 'paper' ? '引用' : '链接'}</>}
                        </div>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" style={{
                          fontFamily: MONO,
                          display: 'inline-flex', alignItems: 'baseline', gap: 8,
                          fontSize: isOrigin ? 13 : 11.5,
                          color: INK, textDecoration: 'none',
                          fontWeight: isOrigin ? 600 : 400,
                          borderBottom: '1px solid transparent',
                          flexWrap: 'wrap',
                        }}
                          onMouseEnter={e => (e.currentTarget.style.borderBottomColor = RED)}
                          onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
                        >
                          <span style={{ color: RED }}>{getDomain(s.url)}</span>
                          <span style={{ color: INK3 }}>{getPath(s.url)}</span>
                          <span style={{
                            fontSize: 8.5, color: INK3, padding: '1px 6px',
                            border: '1px solid rgba(26,23,19,0.3)',
                            letterSpacing: 0.5, textTransform: 'uppercase',
                            alignSelf: 'center',
                          }}>{kindFromSource(s)}</span>
                        </a>
                        {(s.snippet || s.title) && (
                          <div style={{
                            fontSize: 11, color: INK2, marginTop: 3, lineHeight: 1.5,
                          }}>
                            {s.snippet || s.title}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 深入追问 CTA */}
          {onExpand && (
            <div style={{
              marginTop: 22,
              paddingTop: 18,
              borderTop: `1px solid ${INK}`,
            }}>
              <button
                onClick={() => onExpand(entry, '')}
                className="action-btn"
                style={{
                  fontFamily: MONO,
                  width: '100%',
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 16,
                  alignItems: 'center', textAlign: 'left',
                  padding: '18px 24px',
                  border: `1px solid ${INK}`,
                  background: RED, color: PAPER,
                  boxShadow: `3px 3px 0 ${INK}`,
                  cursor: 'pointer',
                  transition: 'transform 0.12s, box-shadow 0.12s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translate(-1px,-1px)';
                  e.currentTarget.style.boxShadow = `4px 4px 0 ${INK}`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = '';
                  e.currentTarget.style.boxShadow = `3px 3px 0 ${INK}`;
                }}
              >
                <span style={{
                  width: 32, height: 32, border: `1px solid ${PAPER}`,
                  display: 'grid', placeItems: 'center', fontSize: 15,
                  background: 'transparent', color: PAPER,
                }}>?</span>
                <span>
                  <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.4, marginBottom: 3 }}>
                    深入追问
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.78, letterSpacing: 0.5 }}>
                    进入流程式提问 · 分支式探查 · 完成后沉淀入 Wiki
                  </div>
                </span>
                <span style={{
                  fontFamily: MONO, fontSize: 10, opacity: 0.85, letterSpacing: 1,
                  padding: '4px 10px', border: '1px solid rgba(255,252,244,0.35)',
                }}>
                  {related ? <>→ 关联 {related.title}</> : <>→ 新建词条</>}
                </span>
                <span style={{ fontSize: 16 }}>→</span>
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
