'use client';

import { useEffect, useState, useMemo } from 'react';
import { DigestEntry, WikiIndexEntry } from '@/lib/types';
import { format } from 'date-fns';

type Tab = 'entries' | 'wiki';

interface SidebarProps {
  onSelectEntry: (entry: DigestEntry) => void;
  onSelectWiki: (id: string) => void;
  onDeleteEntry?: (id: string) => void;
  onShowTriage: () => void;
  onShowBlueprint: () => void;
  onShowWikiChat: () => void;
  selectedEntryId?: string;
  selectedWikiId?: string;
  refreshTrigger?: number;
}

export function Sidebar({
  onSelectEntry, onSelectWiki, onDeleteEntry,
  onShowTriage, onShowBlueprint, onShowWikiChat,
  selectedEntryId, selectedWikiId, refreshTrigger,
}: SidebarProps) {
  const [tab, setTab] = useState<Tab>('entries');
  const [query, setQuery] = useState('');

  // 条目状态
  const [entries, setEntries] = useState<DigestEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Wiki 状态
  const [wikiEntries, setWikiEntries] = useState<WikiIndexEntry[]>([]);
  const [wikiLoading, setWikiLoading] = useState(false);

  // 选中 wiki 时自动切 tab
  useEffect(() => {
    if (selectedWikiId) setTab('wiki');
  }, [selectedWikiId]);

  useEffect(() => {
    if (selectedEntryId) setTab('entries');
  }, [selectedEntryId]);

  // 获取条目
  useEffect(() => {
    setEntriesLoading(true);
    fetch('/api/entries')
      .then(r => r.json())
      .then(data => { setEntries(Array.isArray(data) ? data : []); setEntriesLoading(false); })
      .catch(() => setEntriesLoading(false));
  }, [refreshTrigger]);

  // 获取 Wiki（tab 切换或刷新时）
  useEffect(() => {
    if (tab !== 'wiki') return;
    setWikiLoading(true);
    fetch('/api/wiki')
      .then(r => r.json())
      .then(data => { setWikiEntries(Array.isArray(data) ? data : []); setWikiLoading(false); })
      .catch(() => setWikiLoading(false));
  }, [tab, refreshTrigger]);

  // 条目搜索过滤 + 分组
  const filteredEntries = useMemo(() => {
    if (!query.trim()) return entries;
    const q = query.toLowerCase();
    return entries.filter(e =>
      e.title.toLowerCase().includes(q) || e.tldr?.toLowerCase().includes(q)
    );
  }, [entries, query]);

  const groupedEntries: [string, DigestEntry[]][] = useMemo(() => {
    const map: Record<string, DigestEntry[]> = {};
    for (const entry of filteredEntries) {
      const date = entry.date.slice(0, 10);
      if (!map[date]) map[date] = [];
      map[date].push(entry);
    }
    return Object.entries(map);
  }, [filteredEntries]);

  // Wiki 搜索过滤 + 分组
  const filteredWiki = useMemo(() => {
    if (!query.trim()) return wikiEntries;
    const q = query.toLowerCase();
    return wikiEntries.filter(w =>
      w.name.toLowerCase().includes(q) || w.domain.toLowerCase().includes(q) || w.summary.toLowerCase().includes(q)
    );
  }, [wikiEntries, query]);


  const hasContent = tab === 'entries' ? entries.length > 0 : wikiEntries.length > 0;

  return (
    <aside
      className="w-[280px] shrink-0 flex flex-col h-full"
      style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-elevated)' }}
    >
      {/* Header */}
      <div className="px-5 pt-6 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between">
          <h1
            className="font-semibold tracking-tight"
            style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}
          >
            AI Digest
          </h1>
          <button
            onClick={onShowTriage}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md"
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
              color: 'var(--accent)',
              background: 'var(--accent-subtle)',
              transition: 'opacity var(--duration-fast) var(--ease-out)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            解析
          </button>
        </div>
        <p
          className="mt-0.5"
          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', letterSpacing: '0.02em' }}
        >
          {tab === 'entries'
            ? (entries.length > 0 ? `${entries.length} 条研究记录` : '前沿技术研究助手')
            : (wikiEntries.length > 0 ? `${wikiEntries.length} 个词条` : '前沿技术研究助手')
          }
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex px-5 pt-3 gap-1" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        {(['entries', 'wiki'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setQuery(''); }}
            className="px-3 pb-2.5 relative"
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
              color: tab === t ? 'var(--text-primary)' : 'var(--text-quaternary)',
              transition: 'color var(--duration-fast) var(--ease-out)',
            }}
          >
            {t === 'entries' ? '条目' : 'Wiki'}
            {tab === t && (
              <div
                className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
                style={{ background: 'var(--accent)' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* 搜索框 */}
      {hasContent && (
        <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={tab === 'entries' ? '搜索条目…' : '搜索词条…'}
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

      {/* 列表内容 */}
      <nav className="flex-1 overflow-y-auto" aria-label={tab === 'entries' ? '研究记录' : 'Wiki 词条'}>
        {tab === 'entries' ? (
          // ── 条目 tab ──
          entriesLoading ? (
            <div className="px-5 py-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>
              加载中...
            </div>
          ) : entries.length === 0 ? (
            <div className="px-5 py-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>
              输入链接开始研究
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="px-5 py-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>
              无匹配结果
            </div>
          ) : (
            groupedEntries.map(([date, items]) => {
              const isCollapsed = collapsed[date];
              return (
                <div key={date}>
                  <button
                    onClick={() => setCollapsed(prev => ({ ...prev, [date]: !prev[date] }))}
                    className="w-full text-left px-5 py-1.5 sticky top-0 flex items-center gap-1.5"
                    style={{
                      fontSize: '0.6875rem', fontWeight: 500,
                      color: 'var(--text-quaternary)', letterSpacing: '0.06em',
                      background: 'var(--bg-elevated)',
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{
                        transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        transition: 'transform var(--duration-fast) var(--ease-out)',
                        flexShrink: 0,
                      }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    {format(new Date(date), 'M 月 d 日')}
                    <span style={{ color: 'var(--text-quaternary)', opacity: 0.6, marginLeft: 'auto' }}>
                      {items.length}
                    </span>
                  </button>
                  {!isCollapsed && items.map(entry => {
                    const isSelected = selectedEntryId === entry.id;
                    const isDeleting = deletingId === entry.id;
                    const isSaved = entry.entryType === 'saved';
                    return (
                      <div key={entry.id} className="sidebar-item relative group" data-selected={isSelected}>
                        <button
                          onClick={() => onSelectEntry(entry)}
                          className="w-full text-left px-5 py-2"
                          aria-current={isSelected ? 'page' : undefined}
                        >
                          {isSelected && (
                            <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full"
                              style={{ background: 'var(--accent)' }} />
                          )}
                          {/* 分类标签 */}
                          <div className="flex items-center gap-1.5 mb-1 pr-6">
                            {isSaved && (
                              <span className="shrink-0 inline-block w-1.5 h-1.5 rounded-full"
                                style={{ background: 'var(--border)', opacity: 0.6 }} />
                            )}
                            {entry.tags?.[0] && (
                              <span className="truncate"
                                style={{
                                  fontSize: '0.625rem', fontWeight: 500, letterSpacing: '0.02em',
                                  color: isSelected ? 'var(--accent)' : 'var(--text-quaternary)',
                                }}>
                                {entry.tags[0]}
                              </span>
                            )}
                          </div>
                          {/* 标题 2 行 */}
                          <div className="font-medium leading-snug pr-6"
                            style={{
                              fontSize: 'var(--text-sm)',
                              color: isSaved
                                ? (isSelected ? 'var(--text-secondary)' : 'var(--text-tertiary)')
                                : (isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'),
                              display: '-webkit-box', WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical', overflow: 'hidden',
                            }}>
                            {entry.title}
                          </div>
                        </button>
                        {/* 删除按钮 */}
                        {confirmId === entry.id ? (
                          <div className="absolute top-1.5 right-2 flex items-center gap-1"
                            onMouseLeave={() => setConfirmId(null)}>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                setDeletingId(entry.id);
                                try {
                                  const res = await fetch(`/api/entries?id=${entry.id}`, { method: 'DELETE' });
                                  if (res.ok) {
                                    setEntries(prev => prev.filter(e => e.id !== entry.id));
                                    onDeleteEntry?.(entry.id);
                                  }
                                } finally { setDeletingId(null); setConfirmId(null); }
                              }}
                              disabled={isDeleting}
                              className="btn-danger px-2 py-0.5 rounded"
                              style={{ fontSize: 'var(--text-xs)' }}>
                              {isDeleting ? '删除中...' : '确认'}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmId(null); }}
                              className="px-1.5 py-0.5 rounded"
                              style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
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
                            title="删除">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          )
        ) : (
          // ── Wiki tab ──
          wikiLoading ? (
            <div className="px-5 py-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>
              加载中...
            </div>
          ) : wikiEntries.length === 0 ? (
            <div className="px-5 py-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>
              深度研究后自动生成
            </div>
          ) : filteredWiki.length === 0 ? (
            <div className="px-5 py-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>
              无匹配结果
            </div>
          ) : (
            filteredWiki.map(w => {
              const isSelected = selectedWikiId === w.id;
              return (
                <div key={w.id} className="sidebar-item relative" data-selected={isSelected}>
                  <button
                    onClick={() => onSelectWiki(w.id)}
                    className="w-full text-left px-5 py-1.5"
                    aria-current={isSelected ? 'page' : undefined}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full"
                        style={{ background: 'var(--accent)' }} />
                    )}
                    <div className="font-medium leading-snug"
                      style={{
                        fontSize: 'var(--text-sm)',
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}>
                      {w.name}
                    </div>
                    <div className="mt-0.5 leading-normal"
                      style={{
                        fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                      {w.summary}
                    </div>
                  </button>
                </div>
              );
            })
          )
        )}
      </nav>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={onShowWikiChat}
          className="flex items-center gap-1.5"
          style={{
            fontSize: 'var(--text-xs)', color: 'var(--accent)',
            fontWeight: 500,
            transition: 'opacity var(--duration-fast) var(--ease-out)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Wiki 对话
        </button>
        <button
          onClick={onShowBlueprint}
          className="flex items-center gap-1.5"
          style={{
            fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)',
            transition: 'color var(--duration-fast) var(--ease-out)',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-quaternary)')}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
          </svg>
          原理
        </button>
      </div>
    </aside>
  );
}
