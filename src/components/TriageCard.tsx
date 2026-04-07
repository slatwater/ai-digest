'use client';

import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { TriageEntry, TriageVerdict, TriageDelta, TriageConcept, WikiEntry } from '@/lib/types';
import ReactMarkdown from 'react-markdown';

interface Props {
  entry: TriageEntry;
  verdict: TriageVerdict | undefined;
  onVerdictChange: (verdict: TriageVerdict) => void;
}

// ── 三档选择器 ──
function VerdictSelector({ value, onChange }: { value: TriageVerdict | undefined; onChange: (v: TriageVerdict) => void }) {
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
          <button key={key} onClick={() => onChange(key)}
            className="px-3 py-1.5 font-medium transition-colors"
            style={{ fontSize: 'var(--text-xs)', background: bg, color, borderRight: key !== 'deep-dive' ? '1px solid var(--border)' : 'none' }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── 增量统计 ──
function DeltaBar({ delta }: { delta: TriageDelta }) {
  return (
    <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 'var(--text-xs)' }}>
      {delta.newCount > 0 && (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full"
          style={{ background: 'var(--accent-subtle)', color: 'var(--accent)', fontWeight: 600 }}>
          <span className="w-1 h-1 rounded-full" style={{ background: 'var(--accent)' }} />
          新技术 {delta.newCount}
        </span>
      )}
      {delta.knownCount > 0 && (
        <span className="px-2 py-0.5 rounded-full"
          style={{ background: 'var(--bg-subtle)', color: 'var(--text-tertiary)' }}>
          已知 {delta.knownCount}
        </span>
      )}
      {delta.compositionNew && (
        <span className="px-2 py-0.5 rounded-full"
          style={{ background: 'var(--accent-subtle)', color: 'var(--accent)', fontWeight: 500 }}>
          组合新
        </span>
      )}
      {delta.gap && (
        <span style={{ color: 'var(--text-quaternary)', marginLeft: '2px' }}>{delta.gap}</span>
      )}
    </div>
  );
}

// ── 概念弹窗 ──
function ConceptPopup({ concept, onClose }: { concept: TriageConcept; onClose: () => void }) {
  const [wikiData, setWikiData] = useState<WikiEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 已知概念：加载 Wiki 词条
  useEffect(() => {
    if (concept.isKnown && concept.wikiId) {
      setLoading(true);
      fetch(`/api/wiki?id=${concept.wikiId}`)
        .then(r => r.json())
        .then(data => { if (data && !data.error) setWikiData(data); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [concept.isKnown, concept.wikiId]);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-20 inset-x-0 top-0 mx-4 mt-12 px-5 py-4 rounded-lg shadow-lg space-y-3"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', maxHeight: '50vh', overflowY: 'auto', boxShadow: '0 8px 32px oklch(0% 0 0 / 0.15)' }}
    >
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
            {concept.name}
          </span>
          {concept.isKnown
            ? <span style={{ fontSize: '0.625rem', color: 'var(--text-quaternary)' }}>✓已知</span>
            : <span className="px-1 rounded" style={{ fontSize: '0.625rem', color: 'var(--accent)', background: 'var(--accent-subtle)', fontWeight: 500 }}>新</span>
          }
        </div>
        <button onClick={onClose} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>✕</button>
      </div>

      {/* 来源 */}
      {concept.root && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          {concept.root}
        </p>
      )}

      {/* 能做什么 */}
      {concept.whatItEnables && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: '1.6' }}>
          {concept.whatItEnables}
        </p>
      )}

      {/* 一手来源链接 */}
      {concept.sourceUrl && (
        <a href={concept.sourceUrl} target="_blank" rel="noopener noreferrer"
          className="prose-link truncate block" style={{ fontSize: 'var(--text-xs)' }}>
          {concept.sourceUrl}
        </a>
      )}

      {/* 已知概念：Wiki 积累信息 */}
      {concept.isKnown && loading && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>加载 Wiki...</p>
      )}
      {wikiData && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
          {wikiData.summary && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', lineHeight: '1.6', fontWeight: 500 }}>
              {wikiData.summary}
            </p>
          )}
          {wikiData.sources.length > 0 && (
            <div className="mt-2">
              <p style={{ fontSize: '0.625rem', color: 'var(--text-quaternary)', fontWeight: 500, letterSpacing: '0.06em', marginBottom: '4px' }}>
                你见过 {wikiData.sources.length} 次
              </p>
              {wikiData.sources.map((s, i) => (
                <p key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', lineHeight: '1.5' }}>
                  · {s.entryTitle}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 叙述文本渲染（解析 [[name|new/known:id]] 标记） ──
function NarrativeText({ text, concepts, onConceptClick }: {
  text: string;
  concepts: TriageConcept[];
  onConceptClick: (concept: TriageConcept) => void;
}) {
  // 解析 [[name|type]] 标记
  const parts: { type: 'text' | 'concept'; content: string; concept?: TriageConcept }[] = [];
  const regex = /\[\[([^|]+)\|([^\]]+)\]\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    const name = match[1];
    const tag = match[2]; // "new" or "known:id"
    const isKnown = tag.startsWith('known:');
    // 匹配 concepts 数组中的对应项
    const concept = concepts.find(c => c.name === name) || {
      name, isKnown, wikiId: isKnown ? tag.replace('known:', '') : undefined,
      root: '', whatItEnables: '',
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
    const isKnown = c.isKnown;
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
          borderBottom: `1.5px dashed ${isKnown ? 'var(--text-quaternary)' : 'oklch(50% 0.08 160)'}`,
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
          e.currentTarget.style.borderBottomColor = isKnown ? 'var(--text-quaternary)' : 'oklch(50% 0.08 160)';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSend = useCallback(async () => {
    const q = question.trim();
    if (!q || loading) return;
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);

    try {
      const res = await fetch('/api/triage-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          context: {
            title: entry.title,
            narrative: entry.narrative || entry.explanation || '',
            concepts: entry.concepts,
          },
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      let answer = '';
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'text') {
              answer += event.data.content;
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
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '回答失败，请重试' }]);
    } finally {
      setLoading(false);
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
          {loading ? '思考中...' : '提问'}
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
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
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
export function TriageCard({ entry, verdict, onVerdictChange }: Props) {
  const [expanded, setExpanded] = useState<boolean>(verdict !== 'skip');
  const [popupConcept, setPopupConcept] = useState<TriageConcept | null>(null);

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
          {entry.delta && entry.delta.newCount > 0 && (
            <span className="shrink-0 px-1.5 py-0.5 rounded"
              style={{ fontSize: '0.625rem', color: 'var(--accent)', background: 'var(--accent-subtle)', fontWeight: 500 }}>
              {entry.delta.newCount} 新
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <VerdictSelector value={verdict} onChange={(v) => { onVerdictChange(v); if (v !== 'skip') setExpanded(true); }} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>▸</span>
        </div>
      </div>
    );
  }

  // 展开状态
  return (
    <div className="rounded-xl overflow-hidden relative" style={{ border: '1px solid var(--border)', background: 'var(--bg)' }}>
      {/* ── 标题区 ── */}
      <div className="px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <a href={entry.url} target="_blank" rel="noopener noreferrer"
          className="font-semibold tracking-tight leading-snug hover:underline block"
          style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {entry.title}
        </a>
        {/* 增量统计 + verdict 理由 */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          {entry.delta && <DeltaBar delta={entry.delta} />}
          {entry.verdictReason && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              {entry.verdictReason}
            </span>
          )}
        </div>
      </div>

      {/* ── 叙述区 ── */}
      <div className="px-6 py-5 relative">
        {entry.narrative ? (
          <NarrativeText
            text={entry.narrative}
            concepts={entry.concepts || []}
            onConceptClick={c => setPopupConcept(popupConcept?.name === c.name ? null : c)}
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

        {/* 概念弹窗 */}
        {popupConcept && (
          <ConceptPopup concept={popupConcept} onClose={() => setPopupConcept(null)} />
        )}
      </div>

      {/* ── 聊天区 ── */}
      <div className="px-6 pb-5">
        <InlineChat entry={entry} />
      </div>

      {/* ── 底栏 ── */}
      <div
        className="px-6 py-3 flex items-center justify-between"
        style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-subtle)' }}
      >
        <VerdictSelector value={verdict} onChange={onVerdictChange} />
        {verdict === 'skip' && (
          <button onClick={() => setExpanded(false)} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
            收起
          </button>
        )}
      </div>
    </div>
  );
}
