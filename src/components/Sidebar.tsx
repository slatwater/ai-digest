'use client';

import { useEffect, useState, useMemo } from 'react';
import { DigestEntry } from '@/lib/types';
import { format } from 'date-fns';

interface SidebarProps {
  onSelect: (entry: DigestEntry) => void;
  onDelete?: (id: string) => void;
  onShowBlueprint?: () => void;
  onShowTriage?: () => void;
  showingBlueprint?: boolean;
  showingTriage?: boolean;
  selectedId?: string;
  refreshTrigger?: number;
}

export function Sidebar({ onSelect, onDelete, onShowBlueprint, onShowTriage, showingBlueprint, showingTriage, selectedId, refreshTrigger }: SidebarProps) {
  const [entries, setEntries] = useState<DigestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    fetch('/api/entries')
      .then(r => r.json())
      .then(data => {
        setEntries(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [refreshTrigger]);

  // 搜索过滤
  const filtered = useMemo(() => {
    if (!query.trim()) return entries;
    const q = query.toLowerCase();
    return entries.filter(e =>
      e.title.toLowerCase().includes(q) || e.tldr?.toLowerCase().includes(q)
    );
  }, [entries, query]);

  // 按日期分组
  const grouped: [string, DigestEntry[]][] = useMemo(() => {
    const map: Record<string, DigestEntry[]> = {};
    for (const entry of filtered) {
      const date = entry.date.slice(0, 10);
      if (!map[date]) map[date] = [];
      map[date].push(entry);
    }
    return Object.entries(map);
  }, [filtered]);

  const toggleGroup = (date: string) => {
    setCollapsed(prev => ({ ...prev, [date]: !prev[date] }));
  };

  return (
    <aside
      className="w-[280px] shrink-0 flex flex-col h-full"
      style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-elevated)' }}
    >
      {/* Header */}
      <div
        className="px-5 pt-6 pb-4"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between">
          <h1
            className="font-semibold tracking-tight"
            style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}
          >
            AI Digest
          </h1>
          <div className="flex gap-1.5">
            <button
              onClick={onShowTriage}
              className="px-2 py-0.5 rounded"
              style={{
                fontSize: 'var(--text-xs)',
                color: showingTriage ? 'var(--accent)' : 'var(--text-quaternary)',
                background: showingTriage ? 'var(--accent-subtle)' : 'transparent',
                fontWeight: 500,
                transition: 'color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out)',
              }}
              title="每日研判"
            >
              研判
            </button>
            <button
              onClick={onShowBlueprint}
              className="px-2 py-0.5 rounded"
              style={{
                fontSize: 'var(--text-xs)',
                color: showingBlueprint ? 'var(--accent)' : 'var(--text-quaternary)',
                background: showingBlueprint ? 'var(--bg-subtle)' : 'transparent',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.02em',
                transition: 'color var(--duration-fast) var(--ease-out), background var(--duration-fast) var(--ease-out)',
              }}
              title="查看运行原理"
            >
              原理
            </button>
          </div>
        </div>
        <p
          className="mt-0.5"
          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', letterSpacing: '0.02em' }}
        >
          {entries.length > 0 ? `${entries.length} 条研究记录` : '前沿技术研究助手'}
        </p>
      </div>

      {/* 搜索框 */}
      {entries.length > 0 && (
        <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索记录…"
            className="input-field w-full px-3 py-1.5 rounded-md"
            style={{
              fontSize: 'var(--text-xs)',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      )}

      {/* Entry list */}
      <nav className="flex-1 overflow-y-auto" aria-label="研究记录">
        {loading ? (
          <div className="px-5 py-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>
            加载中...
          </div>
        ) : entries.length === 0 ? (
          <div className="px-5 py-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>
            输入链接开始研究
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>
            无匹配结果
          </div>
        ) : (
          grouped.map(([date, items]) => {
            const isCollapsed = collapsed[date];
            return (
              <div key={date}>
                {/* 日期分组头 — 可点击折叠 */}
                <button
                  onClick={() => toggleGroup(date)}
                  className="w-full text-left px-5 py-1.5 sticky top-0 flex items-center gap-1.5"
                  style={{
                    fontSize: '0.6875rem',
                    fontWeight: 500,
                    color: 'var(--text-quaternary)',
                    letterSpacing: '0.06em',
                    background: 'var(--bg-elevated)',
                  }}
                >
                  <svg
                    width="10" height="10" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"
                    style={{
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      transition: 'transform var(--duration-fast) var(--ease-out)',
                      flexShrink: 0,
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  {format(new Date(date), 'M 月 d 日')}
                  <span style={{ color: 'var(--text-quaternary)', opacity: 0.6, marginLeft: 'auto' }}>
                    {items.length}
                  </span>
                </button>
                {/* 条目列表 */}
                {!isCollapsed && items.map(entry => {
                  const isSelected = selectedId === entry.id;
                  const isDeleting = deletingId === entry.id;
                  return (
                    <div
                      key={entry.id}
                      className="sidebar-item relative group"
                      data-selected={isSelected}
                    >
                      <button
                        onClick={() => onSelect(entry)}
                        className="w-full text-left px-5 py-1.5"
                        aria-current={isSelected ? 'page' : undefined}
                      >
                        {/* Active indicator */}
                        {isSelected && (
                          <div
                            className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full"
                            style={{ background: 'var(--accent)' }}
                          />
                        )}
                        <div
                          className="font-medium leading-snug pr-6"
                          style={{
                            fontSize: 'var(--text-sm)',
                            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                            display: '-webkit-box',
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {entry.title}
                        </div>
                        <div
                          className="mt-0.5 leading-normal"
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-quaternary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {entry.tldr}
                        </div>
                      </button>
                      {/* 删除按钮 — hover 时显示，点击后变为确认态 */}
                      {confirmId === entry.id ? (
                        <div
                          className="absolute top-1.5 right-2 flex items-center gap-1"
                          onMouseLeave={() => setConfirmId(null)}
                        >
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setDeletingId(entry.id);
                              try {
                                const res = await fetch(`/api/entries?id=${entry.id}`, { method: 'DELETE' });
                                if (res.ok) {
                                  setEntries(prev => prev.filter(e => e.id !== entry.id));
                                  onDelete?.(entry.id);
                                }
                              } finally {
                                setDeletingId(null);
                                setConfirmId(null);
                              }
                            }}
                            disabled={isDeleting}
                            className="btn-danger px-2 py-0.5 rounded"
                            style={{ fontSize: 'var(--text-xs)' }}
                          >
                            {isDeleting ? '删除中...' : '确认'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmId(null); }}
                            className="px-1.5 py-0.5 rounded"
                            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmId(entry.id); }}
                          className="absolute top-1.5 right-3 opacity-0 group-hover:opacity-100 rounded p-1"
                          style={{
                            color: 'var(--text-quaternary)',
                            transition: 'opacity var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-quaternary)')}
                          title="删除"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </nav>
    </aside>
  );
}
