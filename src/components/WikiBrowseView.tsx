'use client';

import { useState, useEffect, useCallback } from 'react';
import { WikiCategory, WikiItem, WikiItemSummary, WikiSection, WikiSourceLink } from '@/lib/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ExperienceView } from './ExperienceView';

type Level = 'list' | 'detail';
type Tab = 'wiki' | 'experience';

export function WikiBrowseView() {
  const [tab, setTab] = useState<Tab>('wiki');
  const [level, setLevel] = useState<Level>('list');
  const [categories, setCategories] = useState<WikiCategory[]>([]);
  const [allItems, setAllItems] = useState<WikiItemSummary[]>([]);
  // 过滤器：null 表示「全部」，否则是某个 categoryId
  const [filterCatId, setFilterCatId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<WikiItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showManageCats, setShowManageCats] = useState(false);

  // 加载全量数据
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wiki');
      const data = await res.json();
      setCategories(data.categories || []);
      setAllItems(data.items || []);
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // 过滤后的条目列表（按 updatedAt 倒序）
  const visibleItems = (filterCatId
    ? allItems.filter(i => i.categoryId === filterCatId)
    : allItems
  ).slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  // 进入条目详情
  const enterDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/wiki?itemId=${id}`);
      const item = await res.json();
      if (item && !item.error) {
        setSelectedItem(item);
        setLevel('detail');
        setEditing(false);
      }
    } catch { /* */ }
  }, []);

  // 返回列表
  const backToList = useCallback(() => {
    setLevel('list');
    setSelectedItem(null);
    setEditing(false);
  }, []);

  // 分类管理
  const [newCatName, setNewCatName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const createCategory = useCallback(async () => {
    if (!newCatName.trim()) return;
    const res = await fetch('/api/wiki/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatName.trim() }),
    });
    if (res.ok) {
      setNewCatName('');
      loadAll();
    }
  }, [newCatName, loadAll]);

  const renameCategory = useCallback(async (id: string) => {
    if (!renameValue.trim()) return;
    await fetch('/api/wiki/categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: renameValue.trim() }),
    });
    setRenamingId(null);
    loadAll();
  }, [renameValue, loadAll]);

  const deleteCategory = useCallback(async (id: string) => {
    const res = await fetch(`/api/wiki/categories?id=${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || '删除失败');
      return;
    }
    loadAll();
  }, [loadAll]);

  // 条目编辑
  const [editForm, setEditForm] = useState<WikiItem | null>(null);

  const startEdit = useCallback(() => {
    if (!selectedItem) return;
    setEditForm(JSON.parse(JSON.stringify(selectedItem)));
    setEditing(true);
  }, [selectedItem]);

  const saveEdit = useCallback(async () => {
    if (!editForm) return;
    await fetch('/api/wiki', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    setSelectedItem(editForm);
    setEditing(false);
    loadAll();
  }, [editForm, loadAll]);

  const deleteItem = useCallback(async () => {
    if (!selectedItem) return;
    await fetch(`/api/wiki?itemId=${selectedItem.id}`, { method: 'DELETE' });
    setLevel('list');
    setSelectedItem(null);
    loadAll();
  }, [selectedItem, loadAll]);

  if (loading) {
    return (
      <div className="wiki-deep">
        <div className="max-w-[860px] mx-auto px-8 py-10">
          <p className="mono" style={{ color: 'var(--text-quaternary)', fontSize: 'var(--text-sm)' }}>加载中…</p>
        </div>
      </div>
    );
  }

  const catNameById = (id: string) => categories.find(c => c.id === id)?.name || id;

  return (
    <div className="wiki-deep">
    <div className="max-w-[1100px] mx-auto px-8 py-10">
      {/* 列表层：扁平卡片墙 */}
      {level === 'list' && (
        <div>
          {/* 顶部：Wiki / 经验 tab + 管理分类按钮（仅 Wiki tab） */}
          <div className="flex items-baseline justify-between mb-6 pb-3" style={{ borderBottom: '1px solid var(--rule)' }}>
            <div className="flex items-baseline gap-6">
              <button
                onClick={() => setTab('wiki')}
                className="serif tracking-tight"
                style={{
                  fontFamily: 'var(--font-fraunces), Georgia, serif',
                  fontSize: '1.6rem',
                  fontWeight: 550,
                  letterSpacing: '-0.01em',
                  color: tab === 'wiki' ? 'var(--text-primary)' : 'var(--text-quaternary)',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  position: 'relative',
                  paddingBottom: 6,
                  borderBottom: tab === 'wiki' ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -3,
                }}
              >
                Wiki
                <span className="ml-2 mono" style={{ fontSize: 11, color: 'var(--text-quaternary)', fontWeight: 400, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', letterSpacing: 0.5 }}>
                  {String(allItems.length).padStart(2, '0')}
                </span>
              </button>
              <button
                onClick={() => setTab('experience')}
                className="serif tracking-tight"
                style={{
                  fontFamily: 'var(--font-fraunces), Georgia, serif',
                  fontSize: '1.6rem',
                  fontWeight: 550,
                  letterSpacing: '-0.01em',
                  color: tab === 'experience' ? 'var(--text-primary)' : 'var(--text-quaternary)',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  paddingBottom: 6,
                  borderBottom: tab === 'experience' ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: -3,
                }}
              >
                经验
              </button>
            </div>
            {tab === 'wiki' && (
              <button
                onClick={() => setShowManageCats(v => !v)}
                className="mono"
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: showManageCats ? 'var(--amber)' : 'var(--text-tertiary)',
                  padding: '4px 10px',
                  border: `1px solid ${showManageCats ? 'var(--amber)' : 'var(--rule)'}`,
                  background: showManageCats ? 'var(--amber-soft)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 120ms ease',
                }}
                onMouseEnter={e => { if (!showManageCats) { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--text-tertiary)'; } }}
                onMouseLeave={e => { if (!showManageCats) { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--rule)'; } }}
              >
                {showManageCats ? '收起 ×' : '管理分类'}
              </button>
            )}
          </div>

          {tab === 'experience' && <ExperienceView embedded />}

          {/* 分类管理面板（折叠） */}
          {tab === 'wiki' && showManageCats && (
            <div className="mb-5 p-4" style={{ border: '1px solid var(--rule)', background: 'var(--bg-subtle)' }}>
              <div className="flex flex-wrap gap-2 mb-3">
                {categories.map(cat => {
                  const count = allItems.filter(i => i.categoryId === cat.id).length;
                  if (renamingId === cat.id) {
                    return (
                      <form key={cat.id} onSubmit={e => { e.preventDefault(); renameCategory(cat.id); }}
                        className="flex items-center gap-1 px-2 py-1" style={{ border: '1px solid var(--amber)', background: 'var(--amber-soft)' }}>
                        <input value={renameValue} onChange={e => setRenameValue(e.target.value)} autoFocus
                          className="bg-transparent outline-none mono"
                          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', width: 120, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }} />
                        <button type="submit" className="mono" style={{ fontSize: 11, color: 'var(--amber)', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }}>保存</button>
                        <button type="button" onClick={() => setRenamingId(null)} style={{ fontSize: 11, color: 'var(--text-quaternary)' }}>×</button>
                      </form>
                    );
                  }
                  return (
                    <div key={cat.id} className="group inline-flex items-center gap-1 px-2 py-1"
                      style={{ border: '1px solid var(--rule)', background: 'var(--bg-elevated)' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{cat.name}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }}>· {count}</span>
                      <button onClick={() => { setRenamingId(cat.id); setRenameValue(cat.name); }}
                        className="opacity-0 group-hover:opacity-100 ml-1"
                        style={{ fontSize: 10, color: 'var(--amber)', transition: 'opacity 0.15s' }}>改</button>
                      {count === 0 && (
                        <button onClick={() => deleteCategory(cat.id)}
                          className="opacity-0 group-hover:opacity-100"
                          style={{ fontSize: 10, color: 'var(--error)', transition: 'opacity 0.15s' }}>删</button>
                      )}
                    </div>
                  );
                })}
              </div>
              <form onSubmit={e => { e.preventDefault(); createCategory(); }} className="flex items-center gap-2">
                <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  placeholder="新建分类…"
                  className="py-1 px-2"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', background: 'var(--bg)', border: '1px solid var(--rule)', outline: 'none' }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--amber)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--rule)')} />
                {newCatName.trim() && (
                  <button type="submit" className="mono" style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 500, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', letterSpacing: 0.5, textTransform: 'uppercase' }}>+ 创建</button>
                )}
              </form>
            </div>
          )}

          {/* 分类过滤 chip 栏 */}
          {tab === 'wiki' && categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-6">
              <button onClick={() => setFilterCatId(null)}
                className="mono transition-colors"
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                  letterSpacing: 0.5,
                  color: filterCatId === null ? '#fff5e8' : 'var(--text-tertiary)',
                  background: filterCatId === null ? 'var(--accent)' : 'transparent',
                  border: `1px solid ${filterCatId === null ? 'var(--accent)' : 'var(--rule)'}`,
                  fontWeight: filterCatId === null ? 500 : 400,
                  cursor: 'pointer',
                }}>
                全部 <span style={{ opacity: 0.7, marginLeft: 4 }}>{String(allItems.length).padStart(2, '0')}</span>
              </button>
              {categories.map(cat => {
                const count = allItems.filter(i => i.categoryId === cat.id).length;
                if (count === 0) return null;
                const active = filterCatId === cat.id;
                return (
                  <button key={cat.id} onClick={() => setFilterCatId(active ? null : cat.id)}
                    className="mono transition-colors"
                    style={{
                      padding: '4px 10px',
                      fontSize: 11,
                      fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                      letterSpacing: 0.5,
                      color: active ? '#fff5e8' : 'var(--text-tertiary)',
                      background: active ? 'var(--accent)' : 'transparent',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--rule)'}`,
                      fontWeight: active ? 500 : 400,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--text-tertiary)'; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--rule)'; } }}>
                    {cat.name} <span style={{ opacity: 0.7, marginLeft: 4 }}>{String(count).padStart(2, '0')}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 卡片墙 */}
          {tab === 'wiki' && (visibleItems.length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: '1.8', fontFamily: 'var(--font-fraunces), Georgia, serif', fontStyle: 'italic' }}>
              {allItems.length === 0
                ? '还没有内容。在解析详情或对话弹窗里左键拖选 → 右键 § 存入 Wiki。'
                : '该分类下还没有条目'}
            </p>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {visibleItems.map(item => (
                <button key={item.id} onClick={() => enterDetail(item.id)}
                  className="text-left transition-colors flex flex-col gap-2 group"
                  style={{
                    position: 'relative',
                    padding: '14px 16px 12px',
                    border: '1px solid var(--rule)',
                    background: 'var(--bg-elevated)',
                    minHeight: 124,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--rule)'; e.currentTarget.style.background = 'var(--bg-elevated)'; }}>
                  {/* 朱砂左色条 */}
                  <span aria-hidden style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                    background: 'var(--accent)',
                  }} />
                  <span className="self-start mono"
                    style={{
                      fontSize: 10,
                      letterSpacing: 0.6,
                      textTransform: 'uppercase',
                      color: 'var(--amber)',
                      fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                      fontWeight: 500,
                    }}>
                    § {catNameById(item.categoryId)}
                  </span>
                  <span className="block serif"
                    style={{
                      fontFamily: 'var(--font-fraunces), Georgia, serif',
                      fontSize: '1.05rem',
                      fontWeight: 550,
                      letterSpacing: '-0.005em',
                      color: 'var(--text-primary)',
                      lineHeight: 1.35,
                    }}>
                    {item.name}
                  </span>
                  {item.sectionHeadings.length > 0 && (
                    <span className="block" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', lineHeight: 1.55,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.sectionHeadings.join(' · ')}
                    </span>
                  )}
                  <span className="mt-auto flex items-center gap-2 pt-2 mono"
                    style={{
                      fontSize: 10,
                      color: 'var(--text-quaternary)',
                      fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                      letterSpacing: 0.4,
                      borderTop: '1px solid var(--border-subtle)',
                    }}>
                    <span>{String(item.sourceCount).padStart(2, '0')} 来源</span>
                    <span className="ml-auto">{(item.updatedAt || '').slice(0, 10)}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 详情层：保留 */}
      {level === 'detail' && selectedItem && (
        <div>
          <button onClick={backToList} className="mb-6 mono"
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              padding: '4px 10px',
              border: '1px solid var(--rule)',
              cursor: 'pointer',
              background: 'transparent',
              transition: 'all 120ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--amber)'; e.currentTarget.style.borderColor = 'var(--amber)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--rule)'; }}>
            ← 返回列表
          </button>
          {editing && editForm ? (
            <WikiItemEdit
              item={editForm}
              categories={categories}
              onChange={setEditForm}
              onSave={saveEdit}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <WikiItemView
              item={selectedItem}
              categoryName={categories.find(c => c.id === selectedItem.categoryId)?.name || ''}
              onEdit={startEdit}
              onDelete={deleteItem}
            />
          )}
        </div>
      )}
    </div>
    </div>
  );
}

// ── 条目详情 ──
function WikiItemView({ item, categoryName, onEdit, onDelete }: {
  item: WikiItem;
  categoryName: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="space-y-10">
      <header style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 18 }}>
        <span className="inline-block mb-3 mono"
          style={{
            fontSize: 11,
            letterSpacing: 0.7,
            textTransform: 'uppercase',
            color: 'var(--amber)',
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontWeight: 500,
          }}>
          § {categoryName}
        </span>
        <h1 className="serif tracking-tight"
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontSize: '2.1rem',
            fontWeight: 600,
            letterSpacing: '-0.015em',
            color: 'var(--text-primary)',
            lineHeight: 1.2,
          }}>
          {item.name}
        </h1>
        <div className="flex items-center gap-2 mt-4">
          <button onClick={onEdit} className="mono"
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              padding: '4px 10px',
              border: '1px solid var(--rule)',
              background: 'transparent',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--amber)'; e.currentTarget.style.borderColor = 'var(--amber)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--rule)'; }}>
            编辑
          </button>
          <button onClick={onDelete} className="mono"
            style={{
              fontSize: 11,
              fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              padding: '4px 10px',
              border: '1px solid var(--rule)',
              background: 'transparent',
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)'; e.currentTarget.style.borderColor = 'var(--error)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--rule)'; }}>
            删除
          </button>
        </div>
      </header>

      {item.sections.map((section, i) => (
        <section key={i}>
          <h3 className="serif tracking-tight mb-3"
            style={{
              fontFamily: 'var(--font-fraunces), Georgia, serif',
              fontSize: '1.25rem',
              fontWeight: 550,
              letterSpacing: '-0.005em',
              color: 'var(--text-primary)',
            }}>
            {section.heading}
          </h3>
          <div className="aidigest-md max-w-none" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-base)', lineHeight: 1.75 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
          </div>
        </section>
      ))}

      {item.sourceLinks.length > 0 && (
        <section>
          <h3 className="serif tracking-tight mb-4 mono"
            style={{
              fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
              fontSize: 11,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              fontWeight: 500,
            }}>
            ── 来源 ──
          </h3>
          <div className="space-y-1.5">
            {item.sourceLinks.map((link, i) => {
              let host: string;
              try { host = new URL(link.url).hostname.replace(/^www\./, ''); } catch { host = link.url; }
              return (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-baseline gap-3 transition-colors"
                  style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--amber)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}>
                  {link.type && (
                    <span className="shrink-0 uppercase tracking-widest mono" style={{ fontSize: 10, color: 'var(--text-quaternary)', minWidth: '3rem', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }}>
                      {link.type}
                    </span>
                  )}
                  <span className="truncate">{link.title || host}</span>
                  <span className="shrink-0 mono" style={{ fontSize: 10, fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', color: 'var(--text-quaternary)' }}>{host}</span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      <footer style={{ borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
        <time className="mono" style={{ fontSize: 11, color: 'var(--text-quaternary)', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', letterSpacing: 0.5 }}>
          UPDATED · {item.updatedAt.slice(0, 10)}
        </time>
      </footer>
    </article>
  );
}

// ── 条目编辑 ──
function WikiItemEdit({ item, categories, onChange, onSave, onCancel }: {
  item: WikiItem;
  categories: WikiCategory[];
  onChange: (item: WikiItem) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const updateSection = (idx: number, field: keyof WikiSection, value: string) => {
    const sections = [...item.sections];
    sections[idx] = { ...sections[idx], [field]: value };
    onChange({ ...item, sections });
  };

  const addSection = () => {
    onChange({ ...item, sections: [...item.sections, { heading: '', content: '' }] });
  };

  const removeSection = (idx: number) => {
    onChange({ ...item, sections: item.sections.filter((_, i) => i !== idx) });
  };

  const updateLink = (idx: number, field: keyof WikiSourceLink, value: string) => {
    const links = [...item.sourceLinks];
    links[idx] = { ...links[idx], [field]: value };
    onChange({ ...item, sourceLinks: links });
  };

  const addLink = () => {
    onChange({ ...item, sourceLinks: [...item.sourceLinks, { url: '', title: '' }] });
  };

  const removeLink = (idx: number) => {
    onChange({ ...item, sourceLinks: item.sourceLinks.filter((_, i) => i !== idx) });
  };

  const inputStyle = {
    fontSize: 'var(--text-sm)' as const,
    color: 'var(--text-primary)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--rule)',
    outline: 'none',
    borderRadius: 0,
    padding: '7px 10px',
    width: '100%',
    transition: 'border-color 120ms ease',
  };
  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = 'var(--amber)';
  };
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = 'var(--rule)';
  };

  const labelStyle = {
    fontSize: 11,
    fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
    letterSpacing: 0.7,
    textTransform: 'uppercase' as const,
    color: 'var(--text-tertiary)',
    display: 'block',
    marginBottom: 6,
  };
  const actionBtnStyle = (color: string) => ({
    fontSize: 11,
    fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    color,
    padding: '4px 10px',
    border: `1px solid ${color}`,
    background: 'transparent',
    cursor: 'pointer',
    transition: 'all 120ms ease',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-3" style={{ borderBottom: '1px solid var(--rule)' }}>
        <h2 className="serif" style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: '1.4rem', fontWeight: 550, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>编辑条目</h2>
        <div className="flex gap-2">
          <button onClick={onCancel} style={actionBtnStyle('var(--text-tertiary)')}>取消</button>
          <button onClick={onSave} style={{ ...actionBtnStyle('var(--amber)'), background: 'var(--amber-soft)', fontWeight: 500 }}>保存</button>
        </div>
      </div>

      {/* 名称 */}
      <div>
        <label style={labelStyle}>名称</label>
        <input value={item.name} onChange={e => onChange({ ...item, name: e.target.value })} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
      </div>

      {/* 分类 */}
      <div>
        <label style={labelStyle}>分类</label>
        <select value={item.categoryId} onChange={e => onChange({ ...item, categoryId: e.target.value })}
          style={{ ...inputStyle, cursor: 'pointer' }} onFocus={onFocus} onBlur={onBlur}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* 段落 */}
      <div>
        <label style={labelStyle}>内容段落</label>
        {item.sections.map((section, i) => (
          <div key={i} className="mb-4 p-4" style={{ border: '1px solid var(--rule)', background: 'var(--bg-subtle)', position: 'relative' }}>
            <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--accent)' }} />
            <div className="flex items-center gap-2 mb-2">
              <input value={section.heading} onChange={e => updateSection(i, 'heading', e.target.value)}
                placeholder="段落标题"
                style={{ ...inputStyle, fontFamily: 'var(--font-fraunces), Georgia, serif', fontWeight: 550, fontSize: '1rem' }}
                onFocus={onFocus} onBlur={onBlur} />
              <button onClick={() => removeSection(i)} className="shrink-0"
                style={actionBtnStyle('var(--text-tertiary)')}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)'; e.currentTarget.style.borderColor = 'var(--error)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--text-tertiary)'; }}>删除</button>
            </div>
            <textarea value={section.content} onChange={e => updateSection(i, 'content', e.target.value)}
              rows={6} placeholder="Markdown 内容…"
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: 'var(--text-xs)', lineHeight: 1.7 }}
              onFocus={onFocus} onBlur={onBlur} />
          </div>
        ))}
        <button onClick={addSection} style={actionBtnStyle('var(--amber)')}>+ 添加段落</button>
      </div>

      {/* 来源链接 */}
      <div>
        <label style={labelStyle}>来源链接</label>
        {item.sourceLinks.map((link, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input value={link.title} onChange={e => updateLink(i, 'title', e.target.value)}
              placeholder="标题" style={{ ...inputStyle, flex: '1' }} onFocus={onFocus} onBlur={onBlur} />
            <input value={link.url} onChange={e => updateLink(i, 'url', e.target.value)}
              placeholder="URL" style={{ ...inputStyle, flex: '2', fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: 'var(--text-xs)' }}
              onFocus={onFocus} onBlur={onBlur} />
            <button onClick={() => removeLink(i)} className="shrink-0"
              style={actionBtnStyle('var(--text-tertiary)')}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)'; e.currentTarget.style.borderColor = 'var(--error)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.borderColor = 'var(--text-tertiary)'; }}>删除</button>
          </div>
        ))}
        <button onClick={addLink} style={actionBtnStyle('var(--amber)')}>+ 添加链接</button>
      </div>
    </div>
  );
}
