'use client';

import { useState, Fragment } from 'react';
import { TriageEntry, TriageConcept } from '@/lib/types';

interface Props {
  entry: TriageEntry;
  index: number;
  onExpand?: (entry: TriageEntry, question: string) => void;
}

// ── 工具函数 ──
function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}


// ── D. 概念登记簿 ──
function ConceptRegister({ concepts }: {
  concepts: TriageConcept[];
}) {
  if (concepts.length === 0) return null;

  return (
    <div className="space-y-1">
      {concepts.map((c, i) => (
        <div
          key={i}
          className="w-full text-left py-1.5 pl-3 block"
          style={{ borderLeft: '2px solid var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between gap-4">
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>
              {c.name}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-quaternary)', whiteSpace: 'nowrap' }}>
              {c.role === 'subject' ? 'subject' : 'component'}
            </span>
          </div>
          {c.root && (
            <div className="mt-0.5 pl-0" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', lineHeight: '1.5' }}>
              {c.root}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── F. 叙述文本 ──
function NarrativeText({ text, concepts }: {
  text: string;
  concepts: TriageConcept[];
}) {
  const parts: { type: 'text' | 'concept'; content: string; concept?: TriageConcept }[] = [];
  // 兼容 [[name]] 和旧格式 [[name|tag]]
  const regex = /\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    const name = match[1];
    const concept = concepts.find(c => c.name === name) || { name, root: '', whatItEnables: '' };
    parts.push({ type: 'concept', content: name, concept });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', content: text.slice(lastIndex) });

  const seen = new Set<string>();
  const rendered = parts.map((part, i) => {
    if (part.type === 'text') return <Fragment key={i}>{part.content}</Fragment>;
    if (seen.has(part.content)) return <span key={i} style={{ fontWeight: 600 }}>{part.content}</span>;
    seen.add(part.content);
    return (
      <span
        key={i}
        style={{
          fontWeight: 600,
          color: 'var(--text-primary)',
          lineHeight: 'inherit',
          fontSize: 'inherit',
        }}
      >
        {part.content}
      </span>
    );
  });

  const paragraphs: React.ReactNode[][] = [[]];
  for (let idx = 0; idx < parts.length; idx++) {
    const part = parts[idx];
    const node = rendered[idx];
    if (part.type === 'text' && part.content.includes('\n\n')) {
      const segments = part.content.split('\n\n');
      segments.forEach((seg, si) => {
        if (seg) paragraphs[paragraphs.length - 1].push(<Fragment key={`${idx}-${si}`}>{seg}</Fragment>);
        if (si < segments.length - 1) paragraphs.push([]);
      });
    } else {
      paragraphs[paragraphs.length - 1].push(node);
    }
  }

  return (
    <div className="space-y-3" style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', lineHeight: '1.85' }}>
      {paragraphs.filter(p => p.length > 0).map((para, i) => (
        <p key={i} style={i === 0 ? { fontWeight: 500 } : undefined}>{para}</p>
      ))}
    </div>
  );
}

// ── G. 溯源链路 ──
function SourceProvenance({ entry }: { entry: TriageEntry }) {
  const sources = entry.sources?.length
    ? entry.sources
    : (entry.concepts || []).filter(c => c.sourceUrl).map(c => ({ url: c.sourceUrl!, title: c.name, type: 'related' as const }));

  const primary = sources.filter(s => s.type === 'original' || s.type === 'paper');
  const inputDomain = getDomain(entry.url);
  const inputIsSource = sources.some(s => getDomain(s.url) === inputDomain && (s.type === 'original' || s.type === 'paper'));

  // 构建有序链路节点
  interface ChainNode { url: string; title: string; domain: string; tag: string; highlight?: boolean }
  const chain: ChainNode[] = [];

  // 1. 起点：用户提交的链接
  if (!inputIsSource) {
    chain.push({ url: entry.url, title: entry.title || inputDomain, domain: inputDomain, tag: '原链接' });
  }

  // 2. 源头
  for (const s of primary) {
    chain.push({ url: s.url, title: s.title || getDomain(s.url), domain: getDomain(s.url), tag: s.type === 'paper' ? '论文' : '源头', highlight: true });
  }

  // 3. 补充来源（GitHub、文档等）
  const typeLabels: Record<string, string> = { github: 'GitHub', docs: '文档', related: '相关' };
  for (const s of sources) {
    if (s.type === 'original' || s.type === 'paper') continue;
    if (getDomain(s.url) === inputDomain) continue;
    chain.push({ url: s.url, title: s.title || getDomain(s.url), domain: getDomain(s.url), tag: typeLabels[s.type] || '相关' });
  }

  // 源头自身
  if (chain.length === 0 && inputIsSource) {
    chain.push({ url: entry.url, title: entry.title || inputDomain, domain: inputDomain, tag: '源头', highlight: true });
  }

  if (chain.length === 0) return null;

  return (
    <div>
      <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-quaternary)', display: 'block', marginBottom: 8 }}>
        溯源链路
      </span>
      <div className="flex flex-col gap-1">
        {chain.map((node, i) => (
          <div key={i} className="flex items-start gap-2">
            {/* 连接线 */}
            <div className="flex flex-col items-center shrink-0" style={{ width: 12, paddingTop: 5 }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: node.highlight ? 'var(--text-new)' : 'var(--border)' }} />
              {i < chain.length - 1 && (
                <span className="w-px flex-1 mt-1" style={{ background: 'var(--border-subtle)', minHeight: 12 }} />
              )}
            </div>
            {/* 内容 */}
            <div className="min-w-0 pb-1.5">
              <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: node.highlight ? 'var(--text-new)' : 'var(--text-quaternary)', fontWeight: 500 }}>
                {node.tag}
              </span>
              <a
                href={node.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate mt-0.5"
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-tertiary)',
                  textDecoration: 'none',
                  transition: 'color var(--duration-fast) var(--ease-out)',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
              >
                {node.title}
                <span style={{ color: 'var(--text-quaternary)', opacity: 0.5, marginLeft: 6 }}>{node.domain}</span>
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── H. 深入入口（自由输入，触发 onExpand 切视图） ──
function ExpandTrigger({ onExpand }: { onExpand: (q: string) => void }) {
  const [question, setQuestion] = useState('');

  return (
    <form onSubmit={e => { e.preventDefault(); const q = question.trim(); if (q) { onExpand(q); setQuestion(''); } }}
      className="flex items-center gap-2">
      <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
        placeholder="想深入了解什么？"
        className="flex-1 px-0 py-1.5"
        style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
          border: 'none', borderBottom: '1px solid var(--border-subtle)', background: 'transparent', outline: 'none' }}
      />
      {question.trim() && (
        <button type="submit" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-new)', fontWeight: 500 }}>→</button>
      )}
    </form>
  );
}

// ══════════════════════════════════════
// ── 主组件：情报简报 ──
// ══════════════════════════════════════
export function TriageSection({ entry, index, onExpand }: Props) {
  const concepts = entry.concepts || [];

  return (
    <section className="relative mb-12">
      {/* ── A. 头部：编号 + 来源域名 + 分割线 ── */}
      <div className="flex items-center gap-3 mb-6">
        <span className="tabular-nums" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
          {String(index).padStart(2, '0')}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
          {getDomain(entry.url)}
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
      </div>

      {/* 标题 */}
      <div className="mb-3">
        <a href={entry.url} target="_blank" rel="noopener noreferrer"
          className="font-semibold tracking-tight leading-snug hover:underline"
          style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)', textUnderlineOffset: '3px', textDecorationColor: 'var(--border)' }}>
          {entry.title}
        </a>
      </div>

      {/* ── D. 判定理由 ── */}
      {entry.verdictReason && (
        <p className="mb-5" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', fontStyle: 'italic', lineHeight: '1.6' }}>
          {entry.verdictReason}
        </p>
      )}

      {/* ── E. 概念登记簿 ── */}
      {concepts.length > 0 && (
        <div className="mb-6 relative">
          <ConceptRegister
            concepts={concepts}
          />
        </div>
      )}

      {/* ── F. 叙事正文 ── */}
      {entry.narrative ? (
        <div className="mb-5">
          <NarrativeText
            text={entry.narrative}
            concepts={concepts}
          />
        </div>
      ) : entry.explanation ? (
        <p className="mb-5" style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', lineHeight: '1.85' }}>
          {entry.explanation}
        </p>
      ) : null}

      {/* ── G. 来源链路 ── */}
      <div className="mb-8">
        <SourceProvenance entry={entry} />
      </div>

      {/* ── H. 深入 ── */}
      {onExpand && (
        <div className="pt-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <ExpandTrigger onExpand={q => onExpand(entry, q)} />
        </div>
      )}
    </section>
  );
}
