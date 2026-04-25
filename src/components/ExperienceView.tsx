'use client';

import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExperienceEntry, ExperienceSummary } from '@/lib/types';

interface ExperienceViewProps {
  focusId?: string | null;
  /** 嵌入到其它视图（如 Wiki 内 tab）时省略外层标题 */
  embedded?: boolean;
}

// 单条经验：默认折叠，点开才加载详情并就地展开
function ExperienceRow({
  item,
  defaultOpen,
  onDeleted,
  onUpdated,
}: {
  item: ExperienceSummary;
  defaultOpen: boolean;
  onDeleted: () => void;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [detail, setDetail] = useState<ExperienceEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExperienceEntry | null>(null);
  const [cozeOpen, setCozeOpen] = useState(false);

  // defaultOpen 变化（从列表外部 focusId 进入时）同步打开
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  // 展开时懒加载详情
  useEffect(() => {
    if (!open || detail) return;
    setLoading(true);
    fetch(`/api/experiences?id=${item.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDetail(d); })
      .finally(() => setLoading(false));
  }, [open, detail, item.id]);

  const handleDelete = useCallback(async () => {
    if (!confirm('确定删除这条经验？')) return;
    const res = await fetch(`/api/experiences?id=${item.id}`, { method: 'DELETE' });
    if (res.ok) onDeleted();
  }, [item.id, onDeleted]);

  const beginEdit = useCallback(() => {
    if (!detail) return;
    setDraft({ ...detail });
    setEditing(true);
  }, [detail]);

  const saveEdit = useCallback(async () => {
    if (!draft) return;
    const res = await fetch('/api/experiences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (res.ok) {
      setDetail(draft);
      setEditing(false);
      onUpdated();
    }
  }, [draft, onUpdated]);

  return (
    <div className="rounded overflow-hidden" style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg)' }}>
      {/* 折叠头 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        style={{
          background: open ? 'var(--bg-subtle)' : 'transparent',
          transition: 'background var(--duration-fast) var(--ease-out)',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--bg-subtle)'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        <span
          className="shrink-0 mt-1"
          style={{
            fontSize: '0.65rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-quaternary)',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform var(--duration-fast) var(--ease-out)',
            display: 'inline-block',
          }}
        >
          ▸
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
              {item.title}
            </span>
            {item.cozeRunCount > 0 && (
              <span className="px-1.5 py-0.5 rounded" style={{ fontSize: '0.6rem', background: 'var(--accent-subtle)', color: 'var(--accent-text)', fontFamily: 'var(--font-mono)' }}>
                {item.cozeRunCount} coze
              </span>
            )}
          </div>
          {item.summary && (
            <p className="mt-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', lineHeight: 1.55 }}>
              {item.summary}
            </p>
          )}
          {item.wikiItemNames.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.wikiItemNames.map(n => (
                <span key={n} style={{ fontSize: '0.6rem', color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}>
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="shrink-0" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
          {new Date(item.updatedAt).toLocaleDateString()}
        </span>
      </button>

      {/* 展开区 */}
      {open && (
        <div className="px-5 pb-5 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {loading && !detail && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>加载中…</p>
          )}

          {detail && !editing && (
            <>
              <div className="flex justify-end gap-3 mb-3">
                <button onClick={beginEdit} style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-text)' }}>编辑</button>
                <button onClick={handleDelete} style={{ fontSize: 'var(--text-xs)', color: 'var(--error)' }}>删除</button>
              </div>

              <div className="prose prose-neutral prose-sm max-w-none" style={{ color: 'var(--text-primary)' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.content}</ReactMarkdown>
              </div>

              {detail.cozeRuns.length > 0 && (
                <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <button
                    onClick={() => setCozeOpen(v => !v)}
                    className="flex items-center gap-1.5 mb-2"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                      style={{ color: 'var(--text-quaternary)', transform: cozeOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <h3 className="font-medium" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Coze 调用记录 ({detail.cozeRuns.length})
                    </h3>
                  </button>
                  {cozeOpen && (
                  <div className="space-y-1.5">
                    {detail.cozeRuns.map(r => (
                      <div key={r.id} className="rounded p-2.5" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
                        <div className="flex items-baseline gap-2">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: r.status === 'success' ? 'var(--text-secondary)' : 'var(--error)' }} />
                          <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                            {r.command}
                          </span>
                        </div>
                        {r.stdout && (
                          <pre className="mt-2 overflow-x-auto"
                            style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto' }}>
                            {r.stdout}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              )}
            </>
          )}

          {detail && editing && draft && (
            <div className="space-y-3">
              <input
                type="text"
                value={draft.title}
                onChange={e => setDraft({ ...draft, title: e.target.value })}
                className="w-full px-2 py-1.5 rounded"
                style={{ fontSize: 'var(--text-base)', fontWeight: 600, background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
              />
              <input
                type="text"
                value={draft.summary}
                onChange={e => setDraft({ ...draft, summary: e.target.value })}
                placeholder="一句话概要"
                className="w-full px-2 py-1.5 rounded"
                style={{ fontSize: 'var(--text-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
              />
              <textarea
                value={draft.content}
                onChange={e => setDraft({ ...draft, content: e.target.value })}
                rows={20}
                className="w-full px-2 py-1.5 rounded"
                style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical' }}
              />
              <div className="flex justify-end gap-3">
                <button onClick={() => setEditing(false)} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>取消</button>
                <button onClick={saveEdit} className="px-3 py-1 rounded"
                  style={{ fontSize: 'var(--text-xs)', background: 'var(--accent)', color: 'white' }}>
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ExperienceView({ focusId, embedded = false }: ExperienceViewProps) {
  const [list, setList] = useState<ExperienceSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/experiences');
      const data = await res.json();
      setList(data.items || []);
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  return (
    <div>
      {!embedded && (
        <div className="mb-8">
          <h1 className="font-semibold tracking-tight" style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>
            经验
          </h1>
          <p className="mt-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
            沉淀自画布实验节点的可复用方案
          </p>
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>加载中...</p>
      ) : list.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
          还没有经验条目。在画布的 answer 卡上点「❦ 实验」跑一次，把好的产物保存过来。
        </p>
      ) : (
        <div className="space-y-2">
          {list.map(item => (
            <ExperienceRow
              key={item.id}
              item={item}
              defaultOpen={item.id === focusId}
              onDeleted={loadList}
              onUpdated={loadList}
            />
          ))}
        </div>
      )}
    </div>
  );
}
