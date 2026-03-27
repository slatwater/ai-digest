'use client';

import { DigestEntry } from '@/lib/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function AnalysisView({ entry }: { entry: DigestEntry }) {
  const { analysis } = entry;

  // 构建动态 section 编号
  let sectionNum = 0;
  const nextNum = () => String(++sectionNum).padStart(2, '0');

  return (
    <article className="space-y-10">
      {/* TLDR — pull-quote style */}
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

      {/* 核心要点 */}
      {analysis.keyPoints.length > 0 && (
        <Section title="核心要点" number={nextNum()}>
          <div className="space-y-3">
            {analysis.keyPoints.map((point, i) => (
              <div key={i} className="flex gap-4">
                <span
                  className="tabular-nums shrink-0 pt-0.5"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-quaternary)',
                    minWidth: '20px',
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p style={{ color: 'var(--text-primary)', lineHeight: '1.65' }}>{point}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 技术分析 */}
      {analysis.technical && (
        <Section title="技术分析" number={nextNum()}>
          <Prose>{analysis.technical}</Prose>
        </Section>
      )}

      {/* 行业意义 */}
      {analysis.significance && (
        <Section title="行业意义" number={nextNum()}>
          <Prose>{analysis.significance}</Prose>
        </Section>
      )}

      {/* 局限与争议 */}
      {analysis.limitations && (
        <Section title="局限与争议" number={nextNum()}>
          <Prose>{analysis.limitations}</Prose>
        </Section>
      )}

      {/* 横向对比 */}
      {analysis.comparison && (
        <Section title="横向对比" number={nextNum()}>
          <Prose>{analysis.comparison}</Prose>
        </Section>
      )}

      {/* Demo */}
      {entry.demo && (
        <Section title="Demo" number={nextNum()}>
          <div
            className="rounded-md overflow-hidden"
            style={{ border: '1px solid var(--text-primary)' }}
          >
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ background: 'var(--text-primary)' }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-quaternary)',
                }}
              >
                {entry.demo.filename}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(entry.demo!.code)}
                className="link-subtle"
                style={{ fontSize: 'var(--text-xs)' }}
              >
                复制代码
              </button>
            </div>
            <pre
              className="overflow-x-auto px-4 py-4"
              style={{
                background: 'oklch(12% 0.01 75)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: 'oklch(85% 0.005 75)',
                lineHeight: '1.7',
                margin: 0,
              }}
            >
              {entry.demo.code}
            </pre>
          </div>
          {entry.demo.instructions && (
            <p className="mt-3" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
              {entry.demo.instructions}
            </p>
          )}
        </Section>
      )}

      {/* 来源 */}
      {entry.sources.length > 0 && (
        <Section title="来源" number={nextNum()}>
          <div className="space-y-2">
            {entry.sources.map((src, i) => (
              <div key={i} className="flex items-baseline gap-3">
                <span
                  className="shrink-0 uppercase tracking-widest"
                  style={{
                    fontSize: '0.625rem', /* 10px in rem */
                    color: 'var(--text-quaternary)',
                    minWidth: '3rem',
                  }}
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
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-subtle)',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : <div />}
          <time
            className="shrink-0"
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-quaternary)',
              fontFamily: 'var(--font-mono)',
            }}
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
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--accent)',
            letterSpacing: '0.05em',
          }}
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

function Prose({ children }: { children: string }) {
  return (
    <div className="prose prose-neutral prose-sm max-w-none" style={{ color: 'var(--text-primary)' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
