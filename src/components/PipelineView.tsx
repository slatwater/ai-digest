'use client';

import { useState, useRef, useEffect } from 'react';
import { TriageEntry } from '@/lib/types';
import { ExpandStage } from '@/hooks/useExpand';
import type { useWikiSave } from '@/hooks/useWikiSave';
import { WikiSaveInline } from './WikiSaveInline';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  entry: TriageEntry;
  stages: ExpandStage[];
  canAsk: boolean;
  onAsk: (question: string) => void;
  onExit: () => void;
  wikiSave: ReturnType<typeof useWikiSave>;
}

// ── 解析摘要（折叠式顶部卡片） ──
function TriageSummary({ entry }: { entry: TriageEntry }) {
  const [collapsed, setCollapsed] = useState(true);
  const concepts = entry.concepts || [];
  const sources = entry.sources || [];

  return (
    <div
      className="rounded-lg mb-8"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-4"
      >
        <div className="min-w-0">
          <span className="block font-semibold truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
            {entry.title}
          </span>
          {concepts.length > 0 && (
            <span className="block mt-0.5" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-quaternary)' }}>
              {concepts.map(c => c.name).join(' · ')}
            </span>
          )}
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', transform: collapsed ? 'rotate(0)' : 'rotate(90deg)', transition: 'transform 0.15s' }}>
          ▸
        </span>
      </button>

      {!collapsed && (
        <div className="px-5 pb-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {entry.narrative && (
            <div className="pt-4 mb-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: '1.75' }}>
              {entry.narrative.split('\n\n').map((p, i) => (
                <p key={i} className="mb-2">{p}</p>
              ))}
            </div>
          )}
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {sources.map((s, i) => {
                let host: string;
                try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch { host = s.url; }
                return (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="link-subtle" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
                    {host}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 单次深入问答 ──
function ExpandBlock({ stage, index }: { stage: ExpandStage; index: number }) {
  return (
    <div className="mb-10">
      {/* 问题 */}
      <div className="flex items-baseline gap-3 mb-5">
        <span className="shrink-0 tabular-nums" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
          Q{index}
        </span>
        <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', lineHeight: '1.5' }}>
          {stage.question}
        </p>
      </div>

      {/* 加载中 */}
      {stage.loading && !stage.answer && (
        <div className="flex items-center gap-2 pl-7 py-2">
          {[0, 1, 2].map(j => (
            <span key={j} className="w-1 h-1 rounded-full"
              style={{ background: 'var(--text-new)', animation: `pulseDot 1.5s ease-in-out ${j * 200}ms infinite` }} />
          ))}
          {stage.toolStatus && (
            <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-quaternary)' }}>
              {stage.toolStatus}
            </span>
          )}
        </div>
      )}

      {/* 回答 */}
      {stage.answer && (
        <div className="pl-7">
          <div className="prose max-w-none" style={{ fontSize: 'var(--text-base)', lineHeight: '1.85' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{stage.answer}</ReactMarkdown>
          </div>
          {stage.loading && stage.toolStatus && (
            <p className="mt-3" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-quaternary)' }}>
              {stage.toolStatus}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── 主组件 ──
export function PipelineView({ entry, stages, canAsk, onAsk, onExit, wikiSave }: Props) {
  const [inputValue, setInputValue] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // 新内容到达时滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [stages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = inputValue.trim();
    if (!q) return;
    setInputValue('');
    onAsk(q);
  };

  return (
    <div className="h-full flex flex-col">
      {/* ── 顶栏 ── */}
      <div className="flex items-center justify-between pb-4 mb-6 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-quaternary)' }}>
          深入 · {stages.length} 问
        </span>
        <button onClick={onExit} className="link-subtle"
          style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
          退出深入
        </button>
      </div>

      {/* ── 内容区 ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <TriageSummary entry={entry} />

        {stages.map((stage, i) => (
          <ExpandBlock key={i} stage={stage} index={i + 1} />
        ))}

        {/* 存入 Wiki（至少完成一轮深入后显示） */}
        {stages.length > 0 && stages[stages.length - 1].finished && (
          <WikiSaveInline entry={entry} stages={stages} wikiSave={wikiSave} />
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── 底栏输入 ── */}
      <form onSubmit={handleSubmit}
        className="flex items-center gap-3 pt-4 mt-4 shrink-0"
        style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <input
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder={canAsk ? '继续提问...' : '研究中...'}
          disabled={!canAsk}
          className="flex-1 py-1.5"
          style={{
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)',
            background: 'transparent',
            border: 'none',
            outline: 'none',
          }}
        />
        {inputValue.trim() && canAsk && (
          <button type="submit"
            style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: 'var(--text-new)', fontWeight: 500 }}>
            →
          </button>
        )}
      </form>
    </div>
  );
}
