'use client';

import { useState, useCallback } from 'react';
import { DigestEntry } from '@/lib/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function buildExportMarkdown(entry: DigestEntry): string {
  const { analysis, title } = entry;
  const narrative = analysis.narrative;
  const parts: string[] = [`# ${title}`, ''];
  if (narrative) {
    parts.push(`> ${narrative.oneliner}`, '');
    if (narrative.situation) parts.push('## 现状与矛盾', '', narrative.situation, '');
    if (narrative.insight) { parts.push('## 核心洞察', '', narrative.insight, ''); if (narrative.insightHighlight) parts.push(`> **${narrative.insightHighlight}**`, ''); }
    if (narrative.mechanism) parts.push('## 方案机制', '', narrative.mechanism, '');
    if (narrative.evidence) parts.push('## 效果与边界', '', narrative.evidence, '');
    if (narrative.implications) parts.push('## 启发', '', narrative.implications, '');
  } else if (analysis.concepts?.length) {
    if (analysis.tldr) parts.push(`> ${analysis.tldr}`, '');
    for (const c of analysis.concepts) { parts.push(`## ${c.name}`, ''); if (c.summary) parts.push(`> ${c.summary}`, ''); if (c.what) parts.push('### 是什么', '', c.what, ''); if (c.enables) parts.push('### 能做什么', '', c.enables, ''); if (c.limitations) parts.push('### 现状与局限', '', c.limitations, ''); }
    if (analysis.comparison) parts.push('## 横向对比', '', analysis.comparison, '');
  } else {
    if (analysis.tldr) parts.push(`> ${analysis.tldr}`, '');
    if (analysis.keyPoints?.length) { parts.push('## 核心要点', ''); analysis.keyPoints.forEach((p, i) => parts.push(`${i + 1}. ${p}`)); parts.push(''); }
    if (analysis.technical) parts.push('## 技术分析', '', analysis.technical, '');
    if (analysis.significance) parts.push('## 行业意义', '', analysis.significance, '');
    if (analysis.limitations) parts.push('## 局限与争议', '', analysis.limitations, '');
    if (analysis.comparison) parts.push('## 横向对比', '', analysis.comparison, '');
  }
  return parts.join('\n');
}

export function AnalysisView({ entry }: { entry: DigestEntry }) {
  const { analysis } = entry;
  const narrative = analysis.narrative;
  const hasConcepts = analysis.concepts && analysis.concepts.length > 0;

  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const md = buildExportMarkdown(entry);
      await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: entry.title, content: md }),
      });
    } finally { setExporting(false); }
  }, [entry]);

  return (
    <article className="space-y-10">
      {/* 导出 */}
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-quaternary)',
            opacity: exporting ? 0.5 : 1,
            transition: 'color var(--duration-fast) var(--ease-out)',
          }}
          onMouseEnter={e => { if (!exporting) e.currentTarget.style.color = 'var(--text-secondary)'; }}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-quaternary)')}
        >
          {exporting ? '导出中...' : '导出 Markdown'}
        </button>
      </div>

      {/* ── 叙事报告 ── */}
      {narrative ? (
        <>
          <blockquote className="relative pl-5 py-1" style={{ borderLeft: '2px solid var(--accent)' }}>
            <p className="font-medium leading-relaxed" style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>
              {narrative.oneliner}
            </p>
          </blockquote>
          {narrative.situation && <Section title="现状与矛盾"><Prose>{narrative.situation}</Prose></Section>}
          {narrative.insight && (
            <Section title="核心洞察">
              <Prose>{narrative.insight}</Prose>
              {narrative.insightHighlight && (
                <div className="mt-4 pl-5 py-3" style={{ borderLeft: '2px solid var(--accent)' }}>
                  <p className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--accent-text)', lineHeight: '1.6' }}>
                    {narrative.insightHighlight}
                  </p>
                </div>
              )}
            </Section>
          )}
          {narrative.mechanism && <Section title="方案机制"><Prose>{narrative.mechanism}</Prose></Section>}
          {narrative.evidence && <Section title="效果与边界"><Prose>{narrative.evidence}</Prose></Section>}
          {narrative.implications && <Section title="启发"><Prose>{narrative.implications}</Prose></Section>}
        </>
      ) : hasConcepts ? (
        <>
          {analysis.tldr && (
            <blockquote className="relative pl-5 py-1" style={{ borderLeft: '2px solid var(--accent)' }}>
              <p className="font-medium leading-relaxed" style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>{analysis.tldr}</p>
            </blockquote>
          )}
          {analysis.concepts!.map(concept => (
            <Section title={concept.name} key={concept.id}>
              <div className="flex items-center gap-2 mb-4">
                {concept.isNew === false && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>已知</span>}
                {concept.isNew === true && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 500 }}>新发现</span>}
                {concept.domain && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{concept.domain}</span>}
                {concept.origin && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>{concept.origin}</span>}
              </div>
              {concept.summary && (
                <blockquote className="relative pl-4 py-0.5 mb-6" style={{ borderLeft: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: '1.65' }}>{concept.summary}</p>
                </blockquote>
              )}
              {concept.what && <SubSection title="是什么"><Prose>{concept.what}</Prose></SubSection>}
              {concept.enables && <SubSection title="能做什么"><Prose>{concept.enables}</Prose></SubSection>}
              {concept.limitations && <SubSection title="现状与局限"><Prose>{concept.limitations}</Prose></SubSection>}
            </Section>
          ))}
          {analysis.comparison && <Section title="横向对比"><Prose>{analysis.comparison}</Prose></Section>}
        </>
      ) : (
        <>
          {analysis.tldr && (
            <blockquote className="relative pl-5 py-1" style={{ borderLeft: '2px solid var(--accent)' }}>
              <p className="font-medium leading-relaxed" style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>{analysis.tldr}</p>
            </blockquote>
          )}
          {analysis.keyPoints && analysis.keyPoints.length > 0 && (
            <Section title="核心要点">
              <div className="space-y-2">
                {analysis.keyPoints.map((point, i) => (
                  <div key={i} className="flex gap-3">
                    <span className="tabular-nums shrink-0" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <p style={{ lineHeight: '1.65' }}>{point}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {analysis.technical && <Section title="技术分析"><Prose>{analysis.technical}</Prose></Section>}
          {analysis.significance && <Section title="行业意义"><Prose>{analysis.significance}</Prose></Section>}
          {analysis.limitations && <Section title="局限与争议"><Prose>{analysis.limitations}</Prose></Section>}
          {analysis.comparison && <Section title="横向对比"><Prose>{analysis.comparison}</Prose></Section>}
        </>
      )}

      {/* 来源 */}
      {entry.sources.length > 0 && (
        <Section title="来源">
          <div className="space-y-1.5">
            {entry.sources.map((src, i) => (
              <div key={i} className="flex items-baseline gap-3">
                <span className="shrink-0 uppercase tracking-widest" style={{ fontSize: '0.625rem', color: 'var(--text-quaternary)', minWidth: '3rem' }}>
                  {src.type}
                </span>
                <a href={src.url} target="_blank" rel="noopener noreferrer" className="prose-link truncate" style={{ fontSize: 'var(--text-sm)' }}>
                  {src.title || src.url}
                </a>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 底部元信息 */}
      {(entry.tags.length > 0 || entry.date) && (
        <footer className="flex items-start justify-between gap-4 pt-8" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="flex flex-wrap gap-2 min-w-0">
            {entry.tags.map((tag, i) => (
              <span key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{tag}</span>
            ))}
          </div>
          <time className="shrink-0" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}>
            {entry.date.slice(0, 10)}
          </time>
        </footer>
      )}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-semibold tracking-tight mb-4" style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h4 className="font-medium mb-2" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>{title}</h4>
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
