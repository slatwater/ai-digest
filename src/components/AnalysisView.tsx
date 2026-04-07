'use client';

import { useState, useEffect } from 'react';
import { DigestEntry, WikiIndexEntry } from '@/lib/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function AnalysisView({ entry, onSelectWiki }: { entry: DigestEntry; onSelectWiki?: (id: string) => void }) {
  const [relatedWiki, setRelatedWiki] = useState<WikiIndexEntry[]>([]);

  // 加载关联 Wiki 词条
  useEffect(() => {
    fetch(`/api/wiki?entryId=${entry.id}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setRelatedWiki(data); })
      .catch(() => {});
  }, [entry.id]);

  const { analysis } = entry;
  const narrative = analysis.narrative;
  const hasConcepts = analysis.concepts && analysis.concepts.length > 0;

  let sectionNum = 0;
  const nextNum = () => String(++sectionNum).padStart(2, '0');

  return (
    <article className="space-y-10">
      {/* ── 叙事报告（新格式） ── */}
      {narrative ? (
        <>
          {/* 一句话 */}
          <blockquote
            className="relative pl-5 py-1"
            style={{ borderLeft: '2px solid var(--accent)' }}
          >
            <p
              className="font-medium leading-relaxed"
              style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}
            >
              {narrative.oneliner}
            </p>
          </blockquote>

          {/* 现状与矛盾 */}
          {narrative.situation && (
            <Section title="现状与矛盾" number={nextNum()}>
              <Prose>{narrative.situation}</Prose>
            </Section>
          )}

          {/* 核心洞察 */}
          {narrative.insight && (
            <Section title="核心洞察" number={nextNum()}>
              <Prose>{narrative.insight}</Prose>
              {narrative.insightHighlight && (
                <div
                  className="mt-5 px-5 py-4 rounded-md"
                  style={{
                    background: 'var(--accent-subtle)',
                    border: '1px solid var(--accent)',
                  }}
                >
                  <p
                    className="font-medium leading-relaxed"
                    style={{ fontSize: 'var(--text-sm)', color: 'var(--accent-text)' }}
                  >
                    {narrative.insightHighlight}
                  </p>
                </div>
              )}
            </Section>
          )}

          {/* 方案机制 */}
          {narrative.mechanism && (
            <Section title="方案机制" number={nextNum()}>
              <Prose>{narrative.mechanism}</Prose>
            </Section>
          )}

          {/* 效果与边界 */}
          {narrative.evidence && (
            <Section title="效果与边界" number={nextNum()}>
              <Prose>{narrative.evidence}</Prose>
            </Section>
          )}

          {/* 启发 */}
          {narrative.implications && (
            <Section title="启发" number={nextNum()}>
              <Prose>{narrative.implications}</Prose>
            </Section>
          )}

          {/* 概念索引 */}
          {relatedWiki.length > 0 && (
            <Section title="概念索引" number={nextNum()}>
              <div className="space-y-2">
                {relatedWiki.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onSelectWiki?.(c.id)}
                    className="flex items-baseline gap-3 w-full text-left group"
                    style={{ cursor: onSelectWiki ? 'pointer' : 'default' }}
                  >
                    <span
                      className="font-medium shrink-0"
                      style={{
                        fontSize: 'var(--text-sm)',
                        color: 'var(--accent-text)',
                        transition: 'color var(--duration-fast) var(--ease-out)',
                      }}
                    >
                      {c.name}
                    </span>
                    <span
                      className="truncate"
                      style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}
                    >
                      {c.summary}
                    </span>
                  </button>
                ))}
              </div>
            </Section>
          )}
        </>
      ) : hasConcepts ? (
        <>
          {/* ── 旧概念格式（兼容已有条目） ── */}
          {analysis.tldr && (
            <blockquote
              className="relative pl-5 py-1"
              style={{ borderLeft: '2px solid var(--accent)' }}
            >
              <p
                className="font-medium leading-relaxed"
                style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}
              >
                {analysis.tldr}
              </p>
            </blockquote>
          )}

          {/* 结构分解图 */}
          {(() => {
            const compositions = analysis.concepts!.filter(c => c.relations?.some(r => r.type === 'composed-of'));
            if (compositions.length > 0) {
              return (
                <Section title="结构分解" number={nextNum()}>
                  <div className="space-y-4">
                    {compositions.map(comp => (
                      <div key={comp.id} className="px-4 py-3 rounded-md" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                        <div className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                          {comp.name}
                          {comp.isNew && <span className="ml-2 px-1.5 py-0.5 rounded text-[0.625rem] font-medium" style={{ color: 'var(--accent)', background: 'var(--accent-subtle)' }}>新</span>}
                        </div>
                        <div className="mt-2 space-y-1">
                          {comp.relations!.filter(r => r.type === 'composed-of').map((r, i) => {
                            const atom = analysis.concepts!.find(c => c.id === r.conceptId);
                            return (
                              <div key={i} className="flex items-baseline gap-2 pl-3" style={{ fontSize: 'var(--text-xs)' }}>
                                <span style={{ color: 'var(--text-quaternary)' }}>├──</span>
                                <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{r.conceptName}</span>
                                {atom?.isNew === false && <span style={{ color: 'var(--text-quaternary)' }}>✓已知</span>}
                                {atom?.isNew === true && <span className="px-1 rounded" style={{ color: 'var(--accent)', background: 'var(--accent-subtle)', fontWeight: 500 }}>新</span>}
                                {atom?.origin && <span style={{ color: 'var(--text-quaternary)' }}>{atom.origin}</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              );
            }
            return null;
          })()}

          {/* 概念卡片 */}
          {analysis.concepts!.map(concept => (
            <Section title={concept.name} number={nextNum()} key={concept.id}>
              <div className="flex items-center gap-2 mb-4">
                {concept.isNew === false && (
                  <span className="px-2 py-0.5 rounded" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', background: 'var(--bg-subtle)', fontWeight: 500 }}>✓已知</span>
                )}
                {concept.isNew === true && (
                  <span className="px-2 py-0.5 rounded" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', background: 'var(--accent-subtle)', fontWeight: 500 }}>新发现</span>
                )}
                {concept.domain && (
                  <span className="px-2 py-0.5 rounded" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-text)', background: 'var(--accent-subtle)', fontWeight: 500 }}>
                    {concept.domain}
                  </span>
                )}
                {concept.origin && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>{concept.origin}</span>
                )}
              </div>
              {concept.summary && (
                <blockquote className="relative pl-4 py-0.5 mb-6" style={{ borderLeft: '2px solid var(--border)' }}>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: '1.65' }}>
                    {concept.summary}
                  </p>
                </blockquote>
              )}
              {concept.what && <SubSection title="是什么"><Prose>{concept.what}</Prose></SubSection>}
              {concept.enables && <SubSection title="能做什么"><Prose>{concept.enables}</Prose></SubSection>}
              {concept.limitations && <SubSection title="现状与局限"><Prose>{concept.limitations}</Prose></SubSection>}
            </Section>
          ))}

          {analysis.comparison && (
            <Section title="横向对比" number={nextNum()}>
              <Prose>{analysis.comparison}</Prose>
            </Section>
          )}

          {/* 关联 Wiki（旧格式用） */}
          {relatedWiki.length > 0 && (
            <Section title="关联 Wiki" number={nextNum()}>
              <div className="flex flex-wrap gap-2">
                {relatedWiki.map(c => (
                  <button
                    key={c.id}
                    onClick={() => onSelectWiki?.(c.id)}
                    className="px-3 py-1.5 rounded-md"
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--accent-text)',
                      background: 'var(--accent-subtle)',
                      border: '1px solid transparent',
                      fontWeight: 500,
                      cursor: onSelectWiki ? 'pointer' : 'default',
                      transition: 'border-color var(--duration-fast) var(--ease-out)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </Section>
          )}
        </>
      ) : (
        <>
          {/* ── 最旧格式兼容 ── */}
          {analysis.tldr && (
            <blockquote
              className="relative pl-5 py-1"
              style={{ borderLeft: '2px solid var(--accent)' }}
            >
              <p
                className="font-medium leading-relaxed"
                style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}
              >
                {analysis.tldr}
              </p>
            </blockquote>
          )}
          {analysis.keyPoints && analysis.keyPoints.length > 0 && (
            <Section title="核心要点" number={nextNum()}>
              <div className="space-y-3">
                {analysis.keyPoints.map((point, i) => (
                  <div key={i} className="flex gap-4">
                    <span
                      className="tabular-nums shrink-0 pt-0.5"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', minWidth: '20px' }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <p style={{ color: 'var(--text-primary)', lineHeight: '1.65' }}>{point}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {analysis.technical && (
            <Section title="技术分析" number={nextNum()}><Prose>{analysis.technical}</Prose></Section>
          )}
          {analysis.significance && (
            <Section title="行业意义" number={nextNum()}><Prose>{analysis.significance}</Prose></Section>
          )}
          {analysis.limitations && (
            <Section title="局限与争议" number={nextNum()}><Prose>{analysis.limitations}</Prose></Section>
          )}
          {analysis.comparison && (
            <Section title="横向对比" number={nextNum()}><Prose>{analysis.comparison}</Prose></Section>
          )}
        </>
      )}

      {/* 来源 */}
      {entry.sources.length > 0 && (
        <Section title="来源" number={nextNum()}>
          <div className="space-y-2">
            {entry.sources.map((src, i) => (
              <div key={i} className="flex items-baseline gap-3">
                <span
                  className="shrink-0 uppercase tracking-widest"
                  style={{ fontSize: '0.625rem', color: 'var(--text-quaternary)', minWidth: '3rem' }}
                >
                  {src.type}
                </span>
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="prose-link truncate"
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  {src.title || src.url}
                </a>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 标签 + 元信息 */}
      {(entry.tags.length > 0 || entry.date) && (
        <footer
          className="flex items-start justify-between gap-4 pt-8"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          {entry.tags.length > 0 ? (
            <div className="flex flex-wrap gap-2 min-w-0">
              {entry.tags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded shrink-0"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', background: 'var(--bg-subtle)' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : <div />}
          <time
            className="shrink-0"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}
          >
            {entry.date.slice(0, 10)}
          </time>
        </footer>
      )}
    </article>
  );
}

function Section({ title, number, children }: { title: string; number: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-4">
        <span
          className="tabular-nums"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--accent)', letterSpacing: '0.05em' }}
        >
          {number}
        </span>
        <h3
          className="font-semibold tracking-tight"
          style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}
        >
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4
        className="font-medium mb-2"
        style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}

function Prose({ children }: { children: string }) {
  return (
    <div className="prose prose-neutral prose-sm max-w-none" style={{ color: 'var(--text-primary)' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
