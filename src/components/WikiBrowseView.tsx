'use client';

import { useState, useEffect, useCallback } from 'react';
import { WikiCategory, WikiItem, WikiItemSummary, WikiSection, WikiSourceLink } from '@/lib/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Level = 'categories' | 'items' | 'detail';

export function WikiBrowseView() {
  const [level, setLevel] = useState<Level>('categories');
  const [categories, setCategories] = useState<WikiCategory[]>([]);
  const [items, setItems] = useState<WikiItemSummary[]>([]);
  const [allItems, setAllItems] = useState<WikiItemSummary[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<WikiCategory | null>(null);
  const [selectedItem, setSelectedItem] = useState<WikiItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

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

  // 进入分类
  const enterCategory = useCallback((cat: WikiCategory) => {
    setSelectedCategory(cat);
    setItems(allItems.filter(i => i.categoryId === cat.id));
    setLevel('items');
  }, [allItems]);

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

  // 返回
  const goBack = useCallback(() => {
    if (level === 'detail') {
      setLevel('items');
      setSelectedItem(null);
      setEditing(false);
    } else if (level === 'items') {
      setLevel('categories');
      setSelectedCategory(null);
    }
  }, [level]);

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
    setLevel('items');
    setSelectedItem(null);
    loadAll();
  }, [selectedItem, loadAll]);

  // 导入 GitHub skill 源文件
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const importSkill = useCallback(async (repoUrl: string) => {
    if (!selectedItem || importing) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/skill-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, itemId: selectedItem.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImportResult(`已导入 ${data.total} 个 Skill 源文件`);
      // 重新加载条目详情以显示 skillFiles
      const freshRes = await fetch(`/api/wiki?itemId=${selectedItem.id}`);
      const freshItem = await freshRes.json();
      if (freshItem && !freshItem.error) setSelectedItem(freshItem);
      loadAll();
    } catch (e) {
      setImportResult(`导入失败: ${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  }, [selectedItem, importing, loadAll]);

  if (loading) {
    return (
      <div className="max-w-[860px] mx-auto px-8 py-10">
        <p style={{ color: 'var(--text-quaternary)', fontSize: 'var(--text-sm)' }}>加载中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[860px] mx-auto px-8 py-10">
      {/* 面包屑 */}
      <nav className="flex items-center gap-2 mb-8" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
        <button onClick={() => { setLevel('categories'); setSelectedCategory(null); setSelectedItem(null); }}
          style={{ color: level === 'categories' ? 'var(--text-secondary)' : 'var(--text-quaternary)' }}>
          Wiki
        </button>
        {selectedCategory && (
          <>
            <span>/</span>
            <button onClick={goBack}
              style={{ color: level === 'items' ? 'var(--text-secondary)' : 'var(--text-quaternary)' }}>
              {selectedCategory.name}
            </button>
          </>
        )}
        {selectedItem && (
          <>
            <span>/</span>
            <span style={{ color: 'var(--text-secondary)' }}>{selectedItem.name}</span>
          </>
        )}
      </nav>

      {/* Level 1: 分类 */}
      {level === 'categories' && (
        <div>
          <h2 className="font-semibold tracking-tight mb-6" style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>
            Wiki
          </h2>

          {categories.length === 0 && allItems.length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: '1.8' }}>
              还没有内容。在解析卡片深入对话后，可以将知识存入 Wiki。
            </p>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {categories.map(cat => {
                const count = allItems.filter(i => i.categoryId === cat.id).length;
                return (
                  <div key={cat.id} className="group relative">
                    {renamingId === cat.id ? (
                      <form onSubmit={e => { e.preventDefault(); renameCategory(cat.id); }}
                        className="p-4 rounded-lg" style={{ border: '1px solid var(--accent)' }}>
                        <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                          autoFocus className="w-full bg-transparent outline-none"
                          style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }} />
                        <div className="flex gap-2 mt-2">
                          <button type="submit" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>保存</button>
                          <button type="button" onClick={() => setRenamingId(null)} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>取消</button>
                        </div>
                      </form>
                    ) : (
                      <button onClick={() => enterCategory(cat)}
                        className="w-full text-left p-4 rounded-lg transition-colors"
                        style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg)' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}>
                        <span className="font-medium block" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                          {cat.name}
                        </span>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
                          {count} 个条目
                        </span>
                      </button>
                    )}
                    {/* 分类操作 */}
                    {renamingId !== cat.id && (
                      <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                        <button onClick={e => { e.stopPropagation(); setRenamingId(cat.id); setRenameValue(cat.name); }}
                          style={{ fontSize: '0.625rem', color: 'var(--text-quaternary)' }}>改名</button>
                        {count === 0 && (
                          <button onClick={e => { e.stopPropagation(); deleteCategory(cat.id); }}
                            style={{ fontSize: '0.625rem', color: 'var(--error)' }}>删除</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 新建分类 */}
          <form onSubmit={e => { e.preventDefault(); createCategory(); }}
            className="flex items-center gap-2 mt-6">
            <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
              placeholder="新建分类..."
              className="py-1.5 px-3 rounded-lg"
              style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', background: 'var(--bg)', border: '1px solid var(--border-subtle)', outline: 'none' }} />
            {newCatName.trim() && (
              <button type="submit" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 500 }}>创建</button>
            )}
          </form>
        </div>
      )}

      {/* Level 2: 条目列表 */}
      {level === 'items' && selectedCategory && (
        <div>
          <h2 className="font-semibold tracking-tight mb-6" style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>
            {selectedCategory.name}
          </h2>

          {items.length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>该分类下还没有条目</p>
          ) : (
            <div className="space-y-2">
              {items.map(item => (
                <button key={item.id} onClick={() => enterDetail(item.id)}
                  className="w-full text-left py-3 px-4 rounded-lg transition-colors flex items-center justify-between"
                  style={{ border: '1px solid var(--border-subtle)' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}>
                  <div className="min-w-0">
                    <span className="font-medium block truncate" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                      {item.name}
                    </span>
                    <span className="truncate block mt-0.5" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
                      {item.sectionHeadings.join(' · ')}
                    </span>
                  </div>
                  <span className="shrink-0 ml-4" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}>
                    {item.sourceCount} 来源
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Level 3: 条目详情 / 编辑 */}
      {level === 'detail' && selectedItem && (
        editing && editForm ? (
          <WikiItemEdit
            item={editForm}
            categories={categories}
            onChange={setEditForm}
            onSave={saveEdit}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <WikiItemView
              item={selectedItem}
              categoryName={categories.find(c => c.id === selectedItem.categoryId)?.name || ''}
              onEdit={startEdit}
              onDelete={deleteItem}
              onImportSkill={importSkill}
            />
            {(importing || importResult) && (
              <div className="mt-4 py-2" style={{ fontSize: 'var(--text-xs)', color: importing ? 'var(--text-tertiary)' : 'var(--accent-text)' }}>
                {importing ? '正在从 GitHub 导入 Skill 源文件...' : importResult}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

// ── 条目详情 ──
function WikiItemView({ item, categoryName, onEdit, onDelete, onImportSkill }: {
  item: WikiItem;
  categoryName: string;
  onEdit: () => void;
  onDelete: () => void;
  onImportSkill?: (repoUrl: string) => void;
}) {
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  // 检测是否有 GitHub skill 仓库链接
  const githubLink = item.sourceLinks.find(l => /github\.com\/[^/]+\/[^/]+/.test(l.url));
  const hasSkillFiles = (item.skillFiles?.length || 0) > 0;
  // 只在没有 skillFiles 且有 GitHub 链接时显示导入按钮
  const showImportBtn = !hasSkillFiles && !!githubLink && !!onImportSkill;

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
          {showImportBtn && (
            <button
              onClick={() => onImportSkill!(githubLink!.url)}
              style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-text)', fontWeight: 500 }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              导入 Skill 源文件
            </button>
          )}
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

      {/* 附属 Skill 源文件 */}
      {hasSkillFiles && (
        <section>
          <h3 className="font-semibold tracking-tight mb-3" style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>
            Skill 源文件
            <span className="ml-2 font-normal" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
              {item.skillFiles!.length} 个
            </span>
          </h3>
          <div className="space-y-1">
            {item.skillFiles!.map(sf => {
              const isOpen = expandedSkill === sf.command;
              return (
                <div key={sf.command}>
                  <button
                    onClick={() => setExpandedSkill(isOpen ? null : sf.command)}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 rounded"
                    style={{
                      background: isOpen ? 'var(--bg-subtle)' : 'transparent',
                      transition: 'background var(--duration-fast) var(--ease-out)',
                    }}
                    onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'var(--bg-subtle)'; }}
                    onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                      style={{ color: 'var(--text-quaternary)', transform: isOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--accent-text)' }}>
                      /{sf.command}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
                      {sf.name !== sf.command ? sf.name : ''}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="mt-1 ml-5 mb-3 p-4 rounded overflow-x-auto"
                      style={{ background: 'oklch(14% 0.005 260)', border: '1px solid oklch(20% 0.005 260)' }}>
                      <pre style={{ fontSize: '0.8rem', lineHeight: '1.6', color: 'oklch(80% 0.003 260)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', margin: 0 }}>
                        {sf.content}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

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
