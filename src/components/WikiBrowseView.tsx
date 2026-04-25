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
      <div className="max-w-[860px] mx-auto px-8 py-10">
        <p style={{ color: 'var(--text-quaternary)', fontSize: 'var(--text-sm)' }}>加载中...</p>
      </div>
    );
  }

  const catNameById = (id: string) => categories.find(c => c.id === id)?.name || id;

  return (
    <div className="max-w-[1100px] mx-auto px-8 py-10">
      {/* 列表层：扁平卡片墙 */}
      {level === 'list' && (
        <div>
          {/* 顶部：Wiki / 经验 tab + 管理分类按钮（仅 Wiki tab） */}
          <div className="flex items-baseline justify-between mb-5">
            <div className="flex items-baseline gap-5">
              <button
                onClick={() => setTab('wiki')}
                className="font-semibold tracking-tight"
                style={{
                  fontSize: 'var(--text-lg)',
                  color: tab === 'wiki' ? 'var(--text-primary)' : 'var(--text-quaternary)',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                Wiki
                <span className="ml-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', fontWeight: 400 }}>
                  {allItems.length}
                </span>
              </button>
              <button
                onClick={() => setTab('experience')}
                className="font-semibold tracking-tight"
                style={{
                  fontSize: 'var(--text-lg)',
                  color: tab === 'experience' ? 'var(--text-primary)' : 'var(--text-quaternary)',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                经验
              </button>
            </div>
            {tab === 'wiki' && (
              <button
                onClick={() => setShowManageCats(v => !v)}
                style={{ fontSize: 'var(--text-xs)', color: showManageCats ? 'var(--accent)' : 'var(--text-quaternary)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.color = showManageCats ? 'var(--accent)' : 'var(--text-quaternary)')}
              >
                {showManageCats ? '收起 ×' : '管理分类'}
              </button>
            )}
          </div>

          {tab === 'experience' && <ExperienceView embedded />}

          {/* 分类管理面板（折叠） */}
          {tab === 'wiki' && showManageCats && (
            <div className="mb-5 p-4 rounded-lg" style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-subtle, var(--bg))' }}>
              <div className="flex flex-wrap gap-2 mb-3">
                {categories.map(cat => {
                  const count = allItems.filter(i => i.categoryId === cat.id).length;
                  if (renamingId === cat.id) {
                    return (
                      <form key={cat.id} onSubmit={e => { e.preventDefault(); renameCategory(cat.id); }}
                        className="flex items-center gap-1 px-2 py-1 rounded" style={{ border: '1px solid var(--accent)' }}>
                        <input value={renameValue} onChange={e => setRenameValue(e.target.value)} autoFocus
                          className="bg-transparent outline-none"
                          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', width: 120 }} />
                        <button type="submit" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>保存</button>
                        <button type="button" onClick={() => setRenamingId(null)} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>×</button>
                      </form>
                    );
                  }
                  return (
                    <div key={cat.id} className="group inline-flex items-center gap-1 px-2 py-1 rounded"
                      style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg)' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{cat.name}</span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>· {count}</span>
                      <button onClick={() => { setRenamingId(cat.id); setRenameValue(cat.name); }}
                        className="opacity-0 group-hover:opacity-100 ml-1"
                        style={{ fontSize: '0.625rem', color: 'var(--text-quaternary)', transition: 'opacity 0.15s' }}>改</button>
                      {count === 0 && (
                        <button onClick={() => deleteCategory(cat.id)}
                          className="opacity-0 group-hover:opacity-100"
                          style={{ fontSize: '0.625rem', color: 'var(--error)', transition: 'opacity 0.15s' }}>删</button>
                      )}
                    </div>
                  );
                })}
              </div>
              <form onSubmit={e => { e.preventDefault(); createCategory(); }} className="flex items-center gap-2">
                <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  placeholder="新建分类..."
                  className="py-1 px-2 rounded"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--text-primary)', background: 'var(--bg)', border: '1px solid var(--border-subtle)', outline: 'none' }} />
                {newCatName.trim() && (
                  <button type="submit" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 500 }}>创建</button>
                )}
              </form>
            </div>
          )}

          {/* 分类过滤 chip 栏 */}
          {tab === 'wiki' && categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              <button onClick={() => setFilterCatId(null)}
                className="px-3 py-1 rounded-full transition-colors"
                style={{
                  fontSize: 'var(--text-xs)',
                  color: filterCatId === null ? 'var(--bg)' : 'var(--text-secondary)',
                  background: filterCatId === null ? 'var(--accent)' : 'var(--bg)',
                  border: `1px solid ${filterCatId === null ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  fontWeight: filterCatId === null ? 500 : 400,
                }}>
                全部 · {allItems.length}
              </button>
              {categories.map(cat => {
                const count = allItems.filter(i => i.categoryId === cat.id).length;
                if (count === 0) return null;
                const active = filterCatId === cat.id;
                return (
                  <button key={cat.id} onClick={() => setFilterCatId(active ? null : cat.id)}
                    className="px-3 py-1 rounded-full transition-colors"
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: active ? 'var(--bg)' : 'var(--text-secondary)',
                      background: active ? 'var(--accent)' : 'var(--bg)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      fontWeight: active ? 500 : 400,
                    }}>
                    {cat.name} · {count}
                  </button>
                );
              })}
            </div>
          )}

          {/* 卡片墙 */}
          {tab === 'wiki' && (visibleItems.length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: '1.8' }}>
              {allItems.length === 0
                ? '还没有内容。在解析详情或对话弹窗里左键拖选 → 右键 § 存入 Wiki。'
                : '该分类下还没有条目'}
            </p>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {visibleItems.map(item => (
                <button key={item.id} onClick={() => enterDetail(item.id)}
                  className="text-left p-4 rounded-lg transition-colors flex flex-col gap-2"
                  style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg)', minHeight: 120 }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}>
                  <span className="inline-block self-start px-1.5 py-0.5 rounded"
                    style={{ fontSize: '0.6875rem', color: 'var(--accent)', background: 'var(--accent-subtle)', fontWeight: 500 }}>
                    {catNameById(item.categoryId)}
                  </span>
                  <span className="font-medium block" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {item.name}
                  </span>
                  {item.sectionHeadings.length > 0 && (
                    <span className="block" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', lineHeight: 1.5,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      § {item.sectionHeadings.join(' · ')}
                    </span>
                  )}
                  <span className="mt-auto flex items-center gap-2"
                    style={{ fontSize: '0.6875rem', color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}>
                    <span>{item.sourceCount} 来源</span>
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
          <button onClick={backToList} className="mb-5"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-quaternary)')}>
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
    <article className="space-y-8">
      <header>
        <span className="inline-block px-2 py-0.5 rounded mb-3"
          style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', background: 'var(--accent-subtle)', fontWeight: 500 }}>
          {categoryName}
        </span>
        <h1 className="font-semibold tracking-tight" style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>
          {item.name}
        </h1>
        <div className="flex items-center gap-3 mt-3">
          <button onClick={onEdit} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-quaternary)')}>
            编辑
          </button>
          <button onClick={onDelete} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-quaternary)')}>
            删除
          </button>
        </div>
      </header>

      {item.sections.map((section, i) => (
        <section key={i}>
          <h3 className="font-semibold tracking-tight mb-3" style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>
            {section.heading}
          </h3>
          <div className="prose prose-neutral prose-sm max-w-none" style={{ color: 'var(--text-primary)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
          </div>
        </section>
      ))}

      {item.sourceLinks.length > 0 && (
        <section>
          <h3 className="font-semibold tracking-tight mb-3" style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>
            来源
          </h3>
          <div className="space-y-1.5">
            {item.sourceLinks.map((link, i) => {
              let host: string;
              try { host = new URL(link.url).hostname.replace(/^www\./, ''); } catch { host = link.url; }
              return (
                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-baseline gap-3 transition-colors"
                  style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}>
                  {link.type && (
                    <span className="shrink-0 uppercase tracking-widest" style={{ fontSize: '0.625rem', color: 'var(--text-quaternary)', minWidth: '3rem' }}>
                      {link.type}
                    </span>
                  )}
                  <span className="truncate">{link.title || host}</span>
                  <span className="shrink-0" style={{ fontSize: '0.625rem', fontFamily: 'var(--font-mono)', color: 'var(--text-quaternary)' }}>{host}</span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      <footer style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
        <time style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}>
          更新于 {item.updatedAt.slice(0, 10)}
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
    background: 'var(--bg)',
    border: '1px solid var(--border-subtle)',
    outline: 'none',
    borderRadius: '6px',
    padding: '6px 10px',
    width: '100%',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold" style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>编辑条目</h2>
        <div className="flex gap-3">
          <button onClick={onCancel} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>取消</button>
          <button onClick={onSave} style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 500 }}>保存</button>
        </div>
      </div>

      {/* 名称 */}
      <div>
        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', display: 'block', marginBottom: 4 }}>名称</label>
        <input value={item.name} onChange={e => onChange({ ...item, name: e.target.value })} style={inputStyle} />
      </div>

      {/* 分类 */}
      <div>
        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', display: 'block', marginBottom: 4 }}>分类</label>
        <select value={item.categoryId} onChange={e => onChange({ ...item, categoryId: e.target.value })}
          style={{ ...inputStyle, cursor: 'pointer' }}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* 段落 */}
      <div>
        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', display: 'block', marginBottom: 8 }}>内容段落</label>
        {item.sections.map((section, i) => (
          <div key={i} className="mb-4 p-4 rounded-lg" style={{ border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-2">
              <input value={section.heading} onChange={e => updateSection(i, 'heading', e.target.value)}
                placeholder="段落标题" style={{ ...inputStyle, fontWeight: 600 }} />
              <button onClick={() => removeSection(i)} className="shrink-0 ml-2"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>删除</button>
            </div>
            <textarea value={section.content} onChange={e => updateSection(i, 'content', e.target.value)}
              rows={5} placeholder="Markdown 内容..."
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }} />
          </div>
        ))}
        <button onClick={addSection} style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>+ 添加段落</button>
      </div>

      {/* 来源链接 */}
      <div>
        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', display: 'block', marginBottom: 8 }}>来源链接</label>
        {item.sourceLinks.map((link, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input value={link.title} onChange={e => updateLink(i, 'title', e.target.value)}
              placeholder="标题" style={{ ...inputStyle, flex: '1' }} />
            <input value={link.url} onChange={e => updateLink(i, 'url', e.target.value)}
              placeholder="URL" style={{ ...inputStyle, flex: '2', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }} />
            <button onClick={() => removeLink(i)} className="shrink-0"
              style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>删除</button>
          </div>
        ))}
        <button onClick={addLink} style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>+ 添加链接</button>
      </div>
    </div>
  );
}
