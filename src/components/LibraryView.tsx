'use client';

import { useEffect, useState, useMemo } from 'react';
import { DigestEntry } from '@/lib/types';
import { format } from 'date-fns';

interface Props {
  onSelectEntry: (entry: DigestEntry) => void;
  onDeleteEntry?: (id: string) => void;
  refreshTrigger?: number;
}

export function LibraryView({ onSelectEntry, onDeleteEntry, refreshTrigger }: Props) {
  const [entries, setEntries] = useState<DigestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/entries')
      .then(r => r.json())
      .then(data => { setEntries(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [refreshTrigger]);

  const filtered = useMemo(() => {
    if (!query.trim()) return entries;
    const q = query.toLowerCase();
    return entries.filter(e =>
      e.title.toLowerCase().includes(q) || e.tldr?.toLowerCase().includes(q) || e.tags?.some(t => t.toLowerCase().includes(q))
    );
  }, [entries, query]);

  const grouped: [string, DigestEntry[]][] = useMemo(() => {
    const map: Record<string, DigestEntry[]> = {};
    for (const entry of filtered) {
      const date = entry.date.slice(0, 10);
      if (!map[date]) map[date] = [];
      map[date].push(entry);
    }
    return Object.entries(map);
  }, [filtered]);

  const handleDelete = async (entry: DigestEntry) => {
    setDeletingId(entry.id);
    try {
      const res = await fetch(`/api/entries?id=${entry.id}`, { method: 'DELETE' });
      if (res.ok) {
        setEntries(prev => prev.filter(e => e.id !== entry.id));
        onDeleteEntry?.(entry.id);
      }
    } finally { setDeletingId(null); setConfirmId(null); }
  };

  if (loading) {
    return (
      <div className="max-w-[960px] mx-auto px-8 py-10">
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>加载中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[960px] mx-auto px-8 py-10">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="font-semibold tracking-tight"
            style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}
          >
            知识库
          </h1>
          {entries.length > 0 && (
            <p className="mt-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
              {entries.length} 条记录
            </p>
          )}
        </div>
        {entries.length > 0 && (
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索..."
            className="input-field px-3 py-1.5"
            style={{
              fontSize: 'var(--text-sm)',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              width: 200,
              borderRadius: 4,
            }}
          />
        )}
      </div>

      {entries.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>
          还没有记录。去解析页面添加链接开始。
        </p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>无匹配结果</p>
      ) : (
        <div>
          {grouped.map(([date, items]) => (
            <div key={date}>
              {/* 日期标题 */}
              <div className="flex items-center gap-3 mb-1 mt-6 first:mt-0">
                <span
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', fontWeight: 500, whiteSpace: 'nowrap' }}
                >
                  {format(new Date(date), 'M 月 d 日')}
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
              </div>

              {/* 条目行 */}
              {items.map(entry => (
                <div
                  key={entry.id}
                  className="group flex items-center gap-4 py-2.5 cursor-pointer"
                  style={{ transition: 'background var(--duration-fast) var(--ease-out)' }}
                  onClick={() => onSelectEntry(entry)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-subtle)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* 标题 */}
                  <span
                    className="flex-1 min-w-0 truncate"
                    style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 500 }}
                  >
                    {entry.title}
                  </span>

                  {/* 标签 */}
                  <div className="shrink-0 flex items-center gap-1.5">
                    {entry.tags?.slice(0, 2).map((tag, i) => (
                      <span key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>{tag}</span>
                    ))}
                  </div>

                  {/* 删除 */}
                  {confirmId === entry.id ? (
                    <div className="shrink-0 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleDelete(entry)}
                        disabled={deletingId === entry.id}
                        style={{ fontSize: 'var(--text-xs)', color: 'var(--error)', fontWeight: 500 }}
                      >
                        {deletingId === entry.id ? '...' : '确认删除'}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', marginLeft: 4 }}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmId(entry.id); }}
                      className="shrink-0 opacity-0 group-hover:opacity-100"
                      style={{
                        color: 'var(--text-quaternary)',
                        transition: 'opacity var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
                        padding: 2,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-quaternary)')}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
