'use client';

import { useEffect, useState } from 'react';
import { DigestEntry } from '@/lib/types';
import { format } from 'date-fns';

interface SidebarProps {
  onSelect: (entry: DigestEntry) => void;
  selectedId?: string;
  refreshTrigger?: number;
}

export function Sidebar({ onSelect, selectedId, refreshTrigger }: SidebarProps) {
  const [entries, setEntries] = useState<DigestEntry[]>([]);
  const [loading, setLoading] = useState(true);

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

  // 按日期分组
  const grouped: Record<string, DigestEntry[]> = {};
  for (const entry of entries) {
    const date = entry.date.slice(0, 10);
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(entry);
  }

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
        <h1
          className="font-semibold tracking-tight"
          style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}
        >
          AI Digest
        </h1>
        <p
          className="mt-0.5"
          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', letterSpacing: '0.02em' }}
        >
          {entries.length > 0 ? `${entries.length} 条研究记录` : '前沿技术研究助手'}
        </p>
      </div>

      {/* Entry list */}
      <nav className="flex-1 overflow-y-auto pt-1" aria-label="研究记录">
        {loading ? (
          <div className="px-5 py-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>
            加载中...
          </div>
        ) : entries.length === 0 ? (
          <div className="px-5 py-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>
            输入链接开始研究
          </div>
        ) : (
          Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div
                className="px-5 py-2 sticky top-0"
                style={{
                  fontSize: '0.6875rem', /* 11px in rem */
                  fontWeight: 500,
                  color: 'var(--text-quaternary)',
                  letterSpacing: '0.06em',
                  background: 'var(--bg-elevated)',
                }}
              >
                {format(new Date(date), 'M 月 d 日')}
              </div>
              {items.map(entry => {
                const isSelected = selectedId === entry.id;
                return (
                  <button
                    key={entry.id}
                    onClick={() => onSelect(entry)}
                    className="sidebar-item w-full text-left px-5 py-3 relative"
                    data-selected={isSelected}
                    aria-current={isSelected ? 'page' : undefined}
                  >
                    {/* Active indicator */}
                    {isSelected && (
                      <div
                        className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full"
                        style={{ background: 'var(--accent)' }}
                      />
                    )}
                    <div
                      className="font-medium leading-snug"
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
                      className="mt-1 leading-relaxed"
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-quaternary)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {entry.tldr}
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}
