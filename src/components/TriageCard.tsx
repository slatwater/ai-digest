'use client';

import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { TriageEntry, TriageConcept } from '@/lib/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  entry: TriageEntry;
}


// ── 叙述文本渲染（解析 [[name]] 标记） ──
function NarrativeText({ text, concepts, onConceptClick }: {
  text: string;
  concepts: TriageConcept[];
  onConceptClick: (concept: TriageConcept) => void;
}) {
  const parts: { type: 'text' | 'concept'; content: string; concept?: TriageConcept }[] = [];
  // 兼容 [[name]] 和旧格式 [[name|tag]]
  const regex = /\[\[([^|\]]+)(?:\|[^\]]+)?\]\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    const name = match[1];
    const norm = (s: string) => s.trim().toLowerCase();
    const concept = concepts.find(c => norm(c.name) === norm(name)) || {
      name, root: '', whatItEnables: '',
    };
    parts.push({ type: 'concept', content: name, concept });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  // 按句号分段，让长文本有呼吸感
  const rendered = parts.map((part, i) => {
    if (part.type === 'text') return <Fragment key={i}>{part.content}</Fragment>;
    const c = part.concept!;
    return (
      <button
        key={i}
        onClick={() => onConceptClick(c)}
        className="cursor-pointer"
        style={{
          fontSize: 'inherit',
          fontWeight: 600,
          color: 'var(--text-primary)',
          background: 'none',
          border: 'none',
          padding: 0,
          borderBottom: '1.5px dashed oklch(50% 0.08 160)',
          paddingBottom: '1px',
          transition: 'border-color var(--duration-fast) var(--ease-out)',
          lineHeight: 'inherit',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderBottomStyle = 'solid';
          e.currentTarget.style.borderBottomColor = 'var(--accent)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderBottomStyle = 'dashed';
          e.currentTarget.style.borderBottomColor = 'oklch(50% 0.08 160)';
        }}
      >
        {part.content}
      </button>
    );
  });

  // 去重：同一概念只在首次出现时渲染为可交互标记
  const seen = new Set<string>();
  const deduped = rendered.map((node, idx) => {
    const part = parts[idx];
    if (part.type === 'concept') {
      if (seen.has(part.content)) {
        // 重复出现：渲染为普通加粗文字，不可点击
        return <span key={idx} style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{part.content}</span>;
      }
      seen.add(part.content);
    }
    return node;
  });

  // 按 \n\n 标记分段（LLM 输出时已分好段）
  const paragraphs: React.ReactNode[][] = [[]];
  for (let idx = 0; idx < parts.length; idx++) {
    const part = parts[idx];
    const node = deduped[idx];
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

  const nonEmpty = paragraphs.filter(p => p.length > 0);

  return (
    <div className="space-y-4" style={{ fontSize: '0.9375rem', color: 'var(--text-primary)', lineHeight: '1.9' }}>
      {nonEmpty.map((para, i) => (
        <p key={i} style={i === 0 ? { fontWeight: 500 } : undefined}>{para}</p>
      ))}
    </div>
  );
}

// ── 内置聊天 ──
function InlineChat({ entry }: { entry: TriageEntry }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSend = useCallback(async () => {
    const q = question.trim();
    if (!q || loading) return;
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    setToolStatus(null);

    try {
      const res = await fetch('/api/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry, question: q }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      let answer = '';
      let buffer = '';
      const decoder = new TextDecoder();

      const handleEvent = (event: { type: string; data: { content?: string; label?: string } }) => {
        if (event.type === 'tool_status') {
          setToolStatus(event.data.label ?? null);
        } else if (event.type === 'replace' || event.type === 'text') {
          setToolStatus(null);
          if (event.type === 'replace') {
            answer = event.data.content ?? '';
          } else {
            answer += event.data.content ?? '';
          }
          setMessages(prev => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: answer };
            } else {
              copy.push({ role: 'assistant', content: answer });
            }
            return copy;
          });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            const line = buffer.trim();
            if (line.startsWith('data: ')) {
              try { handleEvent(JSON.parse(line.slice(6))); } catch { /* skip */ }
            }
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          try { handleEvent(JSON.parse(line.slice(6))); } catch { /* skip */ }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '回答失败，请重试' }]);
    } finally {
      setLoading(false);
      setToolStatus(null);
    }
  }, [question, loading, entry]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div
      className="rounded-lg"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: '14px 16px' }}
    >
      {/* 输入框 */}
      <form
        onSubmit={e => { e.preventDefault(); handleSend(); }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="不懂的术语？直接问..."
          disabled={loading}
          className="input-field flex-1 px-3 py-2 rounded-lg"
          style={{
            fontSize: 'var(--text-xs)',
            background: 'var(--bg)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          type="submit"
          disabled={!question.trim() || loading}
          className="px-4 py-2 rounded-lg font-medium shrink-0 transition-colors"
          style={{
            fontSize: 'var(--text-xs)',
            color: loading ? 'var(--text-quaternary)' : '#fff',
            background: loading ? 'var(--bg-subtle)' : 'var(--accent)',
          }}
        >
          {loading ? (toolStatus || '思考中...') : '提问'}
        </button>
      </form>
      {/* 对话记录 */}
      {messages.length > 0 && (
        <div className="mt-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === 'user' ? (
                <div className="flex items-start gap-2">
                  <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--bg-subtle)', fontSize: '0.5rem', color: 'var(--text-quaternary)' }}>Q</span>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {msg.content}
                  </p>
                </div>
              ) : (
                <div
                  className="pl-5 py-2 prose prose-sm max-w-none"
                  style={{ borderLeft: '2px solid var(--accent-subtle)', color: 'var(--text-primary)', lineHeight: '1.85', fontSize: '0.9375rem' }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
}

// ── 处理中状态 ──
function ProcessingState({ url, status }: { url: string; status: 'pending' | 'processing' }) {
  // 从 URL 提取显示名
  const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <div
      className="py-4 px-5 rounded-lg flex items-center gap-3"
      style={{ border: '1px solid var(--border-subtle)' }}
    >
      <span className="shrink-0 flex items-center gap-1">
        {status === 'processing' ? (
          [0, 1, 2].map(i => (
            <span
              key={i}
              className="w-1 h-1 rounded-full animate-pulse"
              style={{ background: 'var(--accent)', animationDelay: `${i * 200}ms` }}
            />
          ))
        ) : (
          <span style={{ color: 'var(--text-quaternary)', fontSize: 'var(--text-xs)' }}>·</span>
        )}
      </span>
      <span
        className="truncate min-w-0"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: status === 'processing' ? 'var(--text-secondary)' : 'var(--text-quaternary)',
        }}
      >
        {displayUrl}
      </span>
      {status === 'processing' && (
        <span
          className="shrink-0 ml-auto"
          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}
        >
          解析中
        </span>
      )}
    </div>
  );
}

// ── 主卡片 ──
export function TriageCard({ entry }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [highlightedConcept, setHighlightedConcept] = useState<string | null>(null);
  const conceptRefs = useRef<Map<string, HTMLElement>>(new Map());

  if (entry.status === 'pending' || entry.status === 'processing') {
    return <ProcessingState url={entry.url} status={entry.status} />;
  }

  if (entry.status === 'error') {
    return (
      <div className="py-4 px-5 rounded-lg" style={{ border: '1px solid var(--error)', background: 'var(--error-bg)' }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--error)' }}>{entry.title} — {entry.error || '评估失败'}</p>
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
          <span className="truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            {entry.title}
          </span>
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>▸</span>
      </div>
    );
  }

  // 展开状态
  const concepts = entry.concepts || [];
  const subjectConcepts = concepts.filter(c => c.role === 'subject');
  const componentConcepts = concepts.filter(c => c.role === 'component' || (!c.role && subjectConcepts.length > 0));
  // 兼容旧数据：无 role 标记时全部作为概念展示
  const allConcepts = subjectConcepts.length > 0 ? concepts : concepts;

  return (
    <div className="rounded-xl overflow-hidden relative" style={{ border: '1px solid var(--border)', background: 'var(--bg)' }}>
      {/* ── 标题区 ── */}
      <div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <a href={entry.url} target="_blank" rel="noopener noreferrer"
          className="font-semibold tracking-tight leading-snug hover:underline block"
          style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {entry.title}
        </a>
      </div>

      {/* ── 一、概念拆解 ── */}
      {allConcepts.length > 0 && (
        <div className="px-6 pt-4 pb-3 relative" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <p style={{ fontSize: '0.625rem', color: 'var(--text-quaternary)', fontWeight: 500, letterSpacing: '0.06em', marginBottom: '8px' }}>
            涉及概念
          </p>
          <div className="flex flex-wrap gap-2">
            {allConcepts.map((c, i) => {
              const isSubject = c.role === 'subject';
              const isHighlighted = highlightedConcept === c.name;
              return (
                <span
                  key={i}
                  ref={el => { if (el) conceptRefs.current.set(c.name, el); }}
                  className={`px-2.5 py-1 rounded-md transition-colors${isHighlighted ? ' concept-highlight' : ''}`}
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: isSubject ? 600 : 500,
                    color: isHighlighted ? 'var(--accent)' : 'var(--text-primary)',
                    background: isHighlighted ? 'var(--accent-subtle)' : (isSubject ? 'var(--bg-subtle)' : 'transparent'),
                    border: `1px solid ${isHighlighted ? 'var(--accent)' : (isSubject ? 'var(--border)' : 'var(--border-subtle)')}`,
                  }}
                >
                  {c.name}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 二、本文内容 ── */}
      <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <p style={{ fontSize: '0.625rem', color: 'var(--text-quaternary)', fontWeight: 500, letterSpacing: '0.06em', marginBottom: '10px' }}>
          这篇文章在讲什么
        </p>
        {entry.narrative ? (
          <NarrativeText
            text={entry.narrative}
            concepts={allConcepts}
            onConceptClick={c => {
              // 滚动到上方标签并高亮
              const norm = (s: string) => s.trim().toLowerCase();
              const matched = allConcepts.find(ac => norm(ac.name) === norm(c.name));
              const key = matched?.name ?? c.name;
              const el = conceptRefs.current.get(key);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              setHighlightedConcept(key);
              setTimeout(() => setHighlightedConcept(null), 1500);
            }}
          />
        ) : (
          <>
            {entry.explanation && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', lineHeight: '1.85' }}>
                {entry.explanation}
              </p>
            )}
            {entry.composition && (
              <p className="mt-3" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: '1.75' }}>
                {entry.composition}
              </p>
            )}
          </>
        )}
      </div>

      {/* ── 三、知识关联 ── */}
      {(entry.delta || (entry.relatedEntries && entry.relatedEntries.length > 0) || entry.verdictReason) && (
        <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <p style={{ fontSize: '0.625rem', color: 'var(--text-quaternary)', fontWeight: 500, letterSpacing: '0.06em', marginBottom: '8px' }}>
            知识关联
          </p>
          {/* verdict 理由 */}
          {entry.verdictReason && (
            <p className="mt-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', lineHeight: '1.6' }}>
              {entry.verdictReason}
            </p>
          )}
          {/* 关联条目 */}
          {entry.relatedEntries && entry.relatedEntries.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {entry.relatedEntries.map((rel, i) => (
                <div key={i} className="flex items-baseline gap-2" style={{ fontSize: 'var(--text-xs)' }}>
                  <span className="shrink-0" style={{ color: 'var(--text-quaternary)' }}>·</span>
                  <span>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{rel.title}</span>
                    <span style={{ color: 'var(--text-quaternary)', marginLeft: '6px' }}>{rel.overlap}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 来源链接 ── */}
      {(() => {
        const sources = entry.sources?.length
          ? entry.sources
          : allConcepts.filter(c => c.sourceUrl).map(c => ({ url: c.sourceUrl!, title: c.name, type: 'related' as const }));
        if (sources.length === 0) return null;
        const typeLabels: Record<string, string> = { paper: '论文', github: 'GitHub', docs: '文档', original: '原文', related: '相关' };
        return (
          <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: '0.625rem', color: 'var(--text-quaternary)', fontWeight: 500, letterSpacing: '0.06em', marginBottom: '6px' }}>
              来源 · {sources.length}
            </p>
            <div className="flex flex-col gap-0.5">
              {sources.map((s, i) => {
                let host: string;
                try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch { host = s.url; }
                return (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="grid items-center py-0.5 transition-colors"
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', gridTemplateColumns: '3rem 1fr auto', gap: '0 8px' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}>
                    <span className="text-right" style={{ fontSize: '0.625rem', color: 'var(--text-quaternary)' }}>
                      {typeLabels[s.type] || '相关'}
                    </span>
                    <span className="truncate min-w-0">{s.title || host}</span>
                    <span style={{ fontSize: '0.625rem', color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}>{host}</span>
                  </a>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── 聊天区 ── */}
      <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <InlineChat entry={entry} />
      </div>

      {/* ── 底栏 ── */}
      <div
        className="px-6 py-3 flex items-center justify-end"
        style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-subtle)' }}
      >
        <button onClick={() => setExpanded(false)} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
          收起
        </button>
      </div>
    </div>
  );
}
