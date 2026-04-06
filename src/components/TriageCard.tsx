'use client';

import { useState } from 'react';
import { TriageEntry, TriageVerdict, TriageConcept } from '@/lib/types';

interface Props {
  entry: TriageEntry;
  verdict: TriageVerdict | undefined;
  onVerdictChange: (verdict: TriageVerdict) => void;
}

// 三档选择器
function VerdictSelector({
  value,
  onChange,
}: {
  value: TriageVerdict | undefined;
  onChange: (v: TriageVerdict) => void;
}) {
  const options: { key: TriageVerdict; label: string }[] = [
    { key: 'skip', label: '跳过' },
    { key: 'save', label: '留底' },
    { key: 'deep-dive', label: '深入' },
  ];

  return (
    <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      {options.map(({ key, label }) => {
        const isActive = value === key;
        let bg = 'transparent';
        let color = 'var(--text-tertiary)';

        if (isActive) {
          if (key === 'skip') { bg = 'var(--bg-subtle)'; color = 'var(--text-secondary)'; }
          else if (key === 'save') { bg = 'var(--accent-subtle)'; color = 'var(--accent-text)'; }
          else { bg = 'var(--accent)'; color = '#fff'; }
        }

        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className="px-3 py-1.5 font-medium transition-colors"
            style={{
              fontSize: 'var(--text-xs)',
              background: bg,
              color,
              borderRight: key !== 'deep-dive' ? '1px solid var(--border)' : 'none',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// 四维度评分条
const SCORE_LABELS: { key: 'novelty' | 'usability' | 'leverage' | 'timing'; label: string }[] = [
  { key: 'novelty', label: '新颖' },
  { key: 'usability', label: '就绪' },
  { key: 'leverage', label: '杠杆' },
  { key: 'timing', label: '时机' },
];

function ScoreBar({ scores }: { scores: { novelty: number; usability: number; leverage: number; timing: number } }) {
  return (
    <div className="flex gap-4">
      {SCORE_LABELS.map(({ key, label }) => {
        const value = scores[key];
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-quaternary)', fontWeight: 500, width: '24px' }}>
              {label}
            </span>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className="rounded-full"
                  style={{
                    width: '6px',
                    height: '6px',
                    background: i <= value
                      ? value >= 4 ? 'var(--accent)' : value >= 3 ? 'var(--text-secondary)' : 'var(--text-quaternary)'
                      : 'var(--bg-subtle)',
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 知识点列表
function ConceptList({ concepts }: { concepts: TriageConcept[] }) {
  return (
    <div className="space-y-3">
      {concepts.map((c, i) => (
        <div key={i} className="space-y-1">
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 600 }}>
            {c.name}
          </p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {c.root}
          </p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: '1.6' }}>
            {c.whatItEnables}
          </p>
          {c.sourceUrl && (
            <a
              href={c.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="prose-link truncate block"
              style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}
            >
              {c.sourceUrl}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// 骨架屏
function Skeleton() {
  return (
    <div className="py-5 px-5 rounded-lg" style={{ border: '1px solid var(--border-subtle)' }}>
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-2/3 rounded" style={{ background: 'var(--bg-subtle)' }} />
        <div className="h-3 w-full rounded" style={{ background: 'var(--bg-subtle)' }} />
        <div className="h-3 w-full rounded" style={{ background: 'var(--bg-subtle)' }} />
        <div className="h-3 w-1/2 rounded" style={{ background: 'var(--bg-subtle)' }} />
      </div>
    </div>
  );
}

export function TriageCard({ entry, verdict, onVerdictChange }: Props) {
  const [expanded, setExpanded] = useState<boolean>(verdict !== 'skip');

  if (entry.status === 'pending' || entry.status === 'processing') {
    return <Skeleton />;
  }

  if (entry.status === 'error') {
    return (
      <div
        className="py-4 px-5 rounded-lg"
        style={{ border: '1px solid var(--error)', background: 'var(--error-bg)' }}
      >
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--error)' }}>
          {entry.title} — {entry.error || '评估失败'}
        </p>
      </div>
    );
  }

  // 折叠状态
  if (!expanded) {
    return (
      <div
        className="py-3 px-5 rounded-lg flex items-center justify-between cursor-pointer transition-colors"
        style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg)' }}
        onClick={() => setExpanded(true)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="truncate"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}
          >
            {entry.title}
          </span>
          {entry.concepts && entry.concepts.length > 0 && (
            <span
              className="shrink-0 px-2 py-0.5 rounded-sm truncate"
              style={{ fontSize: 'var(--text-xs)', background: 'var(--bg-subtle)', color: 'var(--text-tertiary)', maxWidth: '200px' }}
            >
              {entry.concepts.map(c => c.name).join(' · ')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <VerdictSelector value={verdict} onChange={(v) => {
            onVerdictChange(v);
            if (v !== 'skip') setExpanded(true);
          }} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>▸</span>
        </div>
      </div>
    );
  }

  // 展开状态
  return (
    <div
      className="rounded-lg overflow-hidden transition-all"
      style={{ border: '1px solid var(--border)' }}
    >
      <div className="px-5 py-5 space-y-5">
        {/* 标题 */}
        <div>
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold tracking-tight leading-snug hover:underline"
            style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}
          >
            {entry.title}
          </a>
        </div>

        {/* 核心知识点 */}
        {entry.concepts && entry.concepts.length > 0 && (
          <ConceptList concepts={entry.concepts} />
        )}

        {/* 整体理解 */}
        {entry.explanation && (
          <p style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-primary)',
            lineHeight: '1.7',
            borderTop: entry.concepts && entry.concepts.length > 0 ? '1px solid var(--border-subtle)' : 'none',
            paddingTop: entry.concepts && entry.concepts.length > 0 ? '12px' : '0',
          }}>
            {entry.explanation}
          </p>
        )}

        {/* 四维度评分 */}
        {entry.scores && <ScoreBar scores={entry.scores} />}

        {/* 知识库关联 */}
        {entry.relatedEntries && entry.relatedEntries.length > 0 && (
          <div
            className="px-4 py-3 rounded-md space-y-1.5"
            style={{ background: 'var(--accent-subtle)' }}
          >
            {entry.relatedEntries.map((r, i) => (
              <p key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--accent-text)', lineHeight: '1.5' }}>
                <span style={{ fontWeight: 500 }}>{r.title}</span>
                <span style={{ color: 'var(--text-tertiary)' }}> — {r.overlap}</span>
              </p>
            ))}
          </div>
        )}

        {/* verdict 理由 */}
        {entry.verdictReason && (
          <p
            className="pt-1"
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-tertiary)',
              lineHeight: '1.6',
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: '12px',
            }}
          >
            {entry.verdictReason}
          </p>
        )}

        {/* 底部：选择器 */}
        <div className="flex items-center justify-between pt-1">
          <VerdictSelector value={verdict} onChange={onVerdictChange} />
          {verdict === 'skip' && (
            <button
              onClick={() => setExpanded(false)}
              style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}
            >
              收起
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
