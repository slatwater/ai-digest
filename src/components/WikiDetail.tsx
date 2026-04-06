'use client';

import { WikiEntry } from '@/lib/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface WikiDetailProps {
  entry: WikiEntry;
  neighbors: WikiEntry[];
  onBack: () => void;
  onSelectWiki: (id: string) => void;
  onSelectEntry: (entryId: string) => void;
}

const RELATION_LABELS: Record<string, string> = {
  'builds-on': '基于',
  'enables': '使能',
  'part-of': '属于',
  'contrasts': '对比',
  'related': '相关',
};

export function WikiDetail({ entry, neighbors, onBack, onSelectWiki, onSelectEntry }: WikiDetailProps) {
  return (
    <div>
      {/* 返回 */}
      <button
        onClick={onBack}
        className="link-subtle flex items-center gap-1.5 mb-8"
        style={{ fontSize: 'var(--text-sm)' }}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        返回
      </button>

      {/* 标题 */}
      <header className="mb-10">
        <h2
          className="font-semibold tracking-tight leading-tight"
          style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}
        >
          {entry.name}
        </h2>
        {entry.aliases.length > 0 && (
          <p className="mt-1.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
            {entry.aliases.join(' · ')}
          </p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span
            className="px-2 py-0.5 rounded"
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--accent-text)',
              background: 'var(--accent-subtle)',
              fontWeight: 500,
            }}
          >
            {entry.domain}
          </span>
        </div>
      </header>

      <article className="space-y-10">
        {/* 概要 */}
        {entry.summary && (
          <blockquote
            className="relative pl-5 py-1"
            style={{ borderLeft: '2px solid var(--accent)' }}
          >
            <p
              className="font-medium leading-relaxed"
              style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}
            >
              {entry.summary}
            </p>
          </blockquote>
        )}

        {/* 正文 */}
        {entry.content && (
          <div className="prose prose-neutral prose-sm max-w-none" style={{ color: 'var(--text-primary)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
          </div>
        )}

        {/* 关联词条 */}
        {entry.relations.length > 0 && (
          <section>
            <SectionHeader title="关联词条" />
            <div className="space-y-2">
              {entry.relations.map((rel, i) => {
                const exists = neighbors.some(n => n.id === rel.conceptId);
                return (
                  <div
                    key={i}
                    className="flex items-baseline gap-3"
                  >
                    <span
                      className="shrink-0 px-1.5 py-0.5 rounded"
                      style={{
                        fontSize: '0.625rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-quaternary)',
                        background: 'var(--bg-subtle)',
                      }}
                    >
                      {RELATION_LABELS[rel.type] || rel.type}
                    </span>
                    {exists ? (
                      <button
                        onClick={() => onSelectWiki(rel.conceptId)}
                        className="prose-link"
                        style={{ fontSize: 'var(--text-sm)' }}
                      >
                        {rel.conceptName}
                      </button>
                    ) : (
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                        {rel.conceptName}
                      </span>
                    )}
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
                      {rel.description}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 来源条目 */}
        {entry.sources.length > 0 && (
          <section>
            <SectionHeader title="来源条目" />
            <div className="space-y-2">
              {entry.sources.map((src, i) => (
                <div key={i} className="flex items-baseline gap-3">
                  <span
                    className="shrink-0"
                    style={{
                      fontSize: 'var(--text-xs)',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-quaternary)',
                    }}
                  >
                    {src.date.slice(0, 10)}
                  </span>
                  <button
                    onClick={() => onSelectEntry(src.entryId)}
                    className="prose-link truncate"
                    style={{ fontSize: 'var(--text-sm)' }}
                  >
                    {src.entryTitle}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 标签 + 元信息 */}
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
          <div className="shrink-0 text-right" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-quaternary)' }}>
            <div>创建 {entry.createdAt.slice(0, 10)}</div>
            {entry.updatedAt !== entry.createdAt && (
              <div>更新 {entry.updatedAt.slice(0, 10)}</div>
            )}
          </div>
        </footer>
      </article>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3
      className="font-semibold tracking-tight mb-4"
      style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}
    >
      {title}
    </h3>
  );
}
