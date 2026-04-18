'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { WikiItemSummary, WikiCategory, CozeRun } from '@/lib/types';

interface ExperimentProps {
  experiment: {
    sessionId: string | null;
    materials: { itemId: string; name: string; linkCount: number }[];
    messages: { role: string; content: string; timestamp: number }[];
    isStreaming: boolean;
    currentReply: string;
    toolStatus: string | null;
    toolTraces: { tool: string; detail: string; timestamp: number }[];
    cozeRuns: CozeRun[];
    error: string | null;
    selectedItemIds: string[];
    model: 'sonnet' | 'opus' | 'opus-4-6';
    resolvedModel: string | null;
    started: boolean;
    send: (message: string) => void;
    start: () => void;
    toggleItem: (id: string) => void;
    setModel: (m: 'sonnet' | 'opus' | 'opus-4-6') => void;
    reset: () => void;
    abort: () => void;
    saveAsExperience: (payload: { title: string; summary: string; content: string }) => Promise<{ ok: boolean; id?: string; error?: string }>;
  };
  onNavigateToExperience?: (id: string) => void;
}

export function ExperimentView({ experiment, onNavigateToExperience }: ExperimentProps) {
  const {
    materials, messages, isStreaming, currentReply, toolStatus, toolTraces, cozeRuns,
    error, selectedItemIds, model, resolvedModel, started, send, start, toggleItem, setModel, reset, abort, saveAsExperience,
  } = experiment;

  const [input, setInput] = useState('');
  const [categories, setCategories] = useState<WikiCategory[]>([]);
  const [items, setItems] = useState<WikiItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [traceOpen, setTraceOpen] = useState(false);
  const [cozeOpen, setCozeOpen] = useState(true);
  const [saveOpen, setSaveOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/wiki');
        const data = await res.json();
        setCategories(data.categories || []);
        setItems(data.items || []);
      } catch { /* ignore */ }
      setLoading(false);
    }
    if (!started) load();
  }, [started]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, currentReply]);
  useEffect(() => { if (started) inputRef.current?.focus(); }, [started]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    send(input);
    setInput('');
  }, [input, isStreaming, send]);

  // 选择阶段
  if (!started) {
    const grouped = categories.map(cat => ({
      ...cat,
      items: items.filter(i => i.categoryId === cat.id),
    })).filter(g => g.items.length > 0);

    const uncategorized = items.filter(i => !categories.some(c => c.id === i.categoryId));

    return (
      <div>
        <div className="mb-8">
          <h1 className="font-semibold tracking-tight" style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>
            实验
          </h1>
          <p className="mt-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
            选中 Wiki 条目，研究员仅读原链接 → 对话出方案 → 调 coze CLI 验证 → 产出经验
          </p>
        </div>

        {loading ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>加载中...</p>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
            Wiki 中暂无条目。先在 Wiki 里添加条目（带原链接）后再来。
          </p>
        ) : (
          <div className="space-y-6">
            {grouped.map(cat => (
              <div key={cat.id}>
                <h2 className="font-medium mb-3"
                  style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {cat.name}
                </h2>
                <div className="space-y-1">
                  {cat.items.map(item => (
                    <ItemRow key={item.id} item={item} selected={selectedItemIds.includes(item.id)} onToggle={toggleItem} />
                  ))}
                </div>
              </div>
            ))}

            {uncategorized.length > 0 && (
              <div>
                <h2 className="font-medium mb-3"
                  style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  未分类
                </h2>
                <div className="space-y-1">
                  {uncategorized.map(item => (
                    <ItemRow key={item.id} item={item} selected={selectedItemIds.includes(item.id)} onToggle={toggleItem} />
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
                    已选择 {selectedItemIds.length} 个条目
                  </span>
                  <div className="flex items-center gap-1 rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    {([
                      { value: 'sonnet', label: 'sonnet' },
                      { value: 'opus-4-6', label: 'opus 4.6' },
                      { value: 'opus', label: 'opus 4.7' },
                    ] as const).map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setModel(value)}
                        className="px-2.5 py-1"
                        style={{
                          fontSize: '0.65rem',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: model === value ? 600 : 400,
                          color: model === value ? 'white' : 'var(--text-tertiary)',
                          background: model === value ? 'var(--accent)' : 'transparent',
                          transition: 'all var(--duration-fast) var(--ease-out)',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={start}
                  disabled={selectedItemIds.length === 0}
                  className="px-5 py-2 rounded font-medium"
                  style={{
                    fontSize: 'var(--text-sm)',
                    background: selectedItemIds.length > 0 ? 'var(--accent)' : 'var(--bg-subtle)',
                    color: selectedItemIds.length > 0 ? 'white' : 'var(--text-quaternary)',
                    cursor: selectedItemIds.length > 0 ? 'pointer' : 'not-allowed',
                  }}
                >
                  进入实验
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');

  // 对话阶段
  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 200px)' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-semibold tracking-tight" style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>
              实验
            </h1>
            <span
              className="px-1.5 py-0.5 rounded"
              style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', background: 'var(--bg-subtle)', color: 'var(--text-quaternary)' }}
              title={resolvedModel ? `SDK 解析：${resolvedModel}` : '等待 SDK 返回真实 model ID'}
            >
              {resolvedModel || (model === 'opus-4-6' ? 'opus 4.6' : model === 'opus' ? 'opus (别名)' : 'sonnet (别名)')}
            </span>
          </div>
          {materials.length > 0 && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {materials.map(m => (
                <span key={m.itemId}
                  className="px-2 py-0.5 rounded"
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-tertiary)',
                    border: '1px solid var(--border-subtle)',
                  }}>
                  {m.name} · {m.linkCount}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {lastAssistantMessage && (
            <button
              onClick={() => setSaveOpen(true)}
              style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-text)' }}
            >
              保存为经验
            </button>
          )}
          <button onClick={reset} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-quaternary)')}>
            退出实验
          </button>
        </div>
      </div>

      {/* 对话区 */}
      <div className="flex-1 space-y-8">
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === 'user' ? (
              <p className="font-medium" style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>
                {msg.content}
              </p>
            ) : (
              <div className="prose prose-neutral prose-sm max-w-none pl-4"
                style={{ borderLeft: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}

        {isStreaming && currentReply && (
          <div className="prose prose-neutral prose-sm max-w-none pl-4"
            style={{ borderLeft: '1px solid var(--accent)', color: 'var(--text-primary)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentReply}</ReactMarkdown>
          </div>
        )}

        {isStreaming && !currentReply && (
          <div className="flex items-center gap-2 py-2">
            {toolStatus ? (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {toolStatus}
              </span>
            ) : (
              [0, 1, 2].map(j => (
                <span key={j} className="w-1 h-1 rounded-full"
                  style={{ background: 'var(--accent)', animation: `pulseDot 1.5s ease-in-out ${j * 200}ms infinite` }} />
              ))
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mb-3 py-2" style={{ fontSize: 'var(--text-sm)', color: 'var(--error)' }}>{error}</div>
      )}

      {/* Coze 进程可视化面板（可折叠） */}
      {cozeRuns.length > 0 && (
        <div className="mb-3" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem' }}>
          <button
            onClick={() => setCozeOpen(v => !v)}
            className="flex items-baseline gap-2 w-full"
          >
            <svg className="w-3 h-3 self-center" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              style={{ color: 'var(--text-quaternary)', transform: cozeOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s', flexShrink: 0 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
              Coze 运行 ({cozeRuns.length})
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-quaternary)' }}>
              {cozeRuns.filter(r => r.status === 'success').length} 成功 · {cozeRuns.filter(r => r.status === 'failed').length} 失败 · {cozeRuns.filter(r => r.status === 'running').length} 运行中
            </span>
          </button>
          {cozeOpen && (
            <div className="space-y-1.5 mt-2">
              {cozeRuns.map(run => <CozeRunCard key={run.id} run={run} />)}
            </div>
          )}
        </div>
      )}

      {/* 执行轨迹面板 */}
      {toolTraces.length > 0 && (
        <div className="mb-3" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }}>
          <button
            onClick={() => setTraceOpen(v => !v)}
            className="flex items-center gap-1.5"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              style={{ transform: traceOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            工具轨迹 ({toolTraces.length})
          </button>
          {traceOpen && (
            <div className="mt-2 space-y-0.5 max-h-48 overflow-y-auto">
              {toolTraces.map((t, i) => {
                const detail = t.detail.replace(/^\/.*?\/aidigest-experiment-[^/]+\//, '');
                return (
                  <div key={i} className="flex items-baseline gap-2 px-2 py-1 rounded"
                    style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
                    <span style={{ color: 'var(--accent-text)', fontWeight: 500, flexShrink: 0 }}>{t.tool}</span>
                    <span style={{ color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>{detail}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 输入区 */}
      <div className="pt-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="讨论实验方向、要求 coze 验证..."
            className="flex-1 px-0 py-2"
            style={{
              fontSize: 'var(--text-sm)',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              color: 'var(--text-primary)',
              borderRadius: 0,
              outline: 'none',
            }}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={abort}
              className="px-4 py-2 rounded font-medium"
              style={{
                fontSize: 'var(--text-sm)',
                background: 'var(--error)',
                color: 'white',
              }}
            >
              中止
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="btn btn-primary px-4 py-2 rounded font-medium"
              style={{ fontSize: 'var(--text-sm)' }}
            >
              发送
            </button>
          )}
        </form>
      </div>

      {/* 保存经验弹窗 */}
      {saveOpen && lastAssistantMessage && (
        <SaveExperienceDialog
          defaultContent={lastAssistantMessage.content}
          onClose={() => setSaveOpen(false)}
          onSave={async (payload) => {
            const res = await saveAsExperience(payload);
            if (res.ok) {
              setSaveOpen(false);
              if (res.id && onNavigateToExperience) onNavigateToExperience(res.id);
            }
            return res;
          }}
        />
      )}
    </div>
  );
}

function CozeRunCard({ run }: { run: CozeRun }) {
  const [open, setOpen] = useState(false);
  const duration = run.endedAt ? ((run.endedAt - run.startedAt) / 1000).toFixed(1) : null;

  const statusColor = run.status === 'running'
    ? 'var(--accent)'
    : run.status === 'success'
      ? 'var(--text-secondary)'
      : 'var(--error)';

  const statusLabel = run.status === 'running' ? '运行中' : run.status === 'success' ? '完成' : '失败';

  return (
    <div className="rounded" style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-subtle)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full text-left px-2.5 py-1.5"
        disabled={run.status === 'running'}
      >
        {run.status === 'running' ? (
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor, animation: 'pulseDot 1s ease-in-out infinite' }} />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
        )}
        <span style={{ fontSize: '0.65rem', color: statusColor, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
          {statusLabel}
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
          {run.command.length > 120 ? run.command.slice(0, 120) + '…' : run.command}
        </span>
        {duration && (
          <span style={{ fontSize: '0.65rem', color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}>
            {duration}s
          </span>
        )}
      </button>
      {open && run.stdout && (
        <pre className="px-3 pb-2 pt-1 overflow-x-auto"
          style={{
            fontSize: '0.65rem',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            maxHeight: '240px',
            overflowY: 'auto',
          }}>
          {run.stdout}
        </pre>
      )}
    </div>
  );
}

function SaveExperienceDialog({ defaultContent, onClose, onSave }: {
  defaultContent: string;
  onClose: () => void;
  onSave: (payload: { title: string; summary: string; content: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  // 从内容首行尝试提取标题
  const firstLine = defaultContent.split('\n').find(l => l.trim())?.replace(/^#+\s*/, '').slice(0, 60) || '';
  const [title, setTitle] = useState(firstLine);
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState(defaultContent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) { setError('请填写标题'); return; }
    setSaving(true);
    setError(null);
    const res = await onSave({ title: title.trim(), summary: summary.trim(), content });
    setSaving(false);
    if (!res.ok) setError(res.error || '保存失败');
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'oklch(0% 0 0 / 0.4)' }} onClick={onClose}>
      <div className="rounded p-6 max-w-[560px] w-full mx-4"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <h2 className="font-semibold mb-4" style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>
          保存为经验
        </h2>
        <div className="space-y-3">
          <div>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>标题</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 rounded"
              style={{ fontSize: 'var(--text-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>一句话概要</label>
            <input
              type="text"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="这个方案解决什么问题"
              className="w-full mt-1 px-2 py-1.5 rounded"
              style={{ fontSize: 'var(--text-sm)', background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>内容（Markdown）</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={10}
              className="w-full mt-1 px-2 py-1.5 rounded"
              style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical' }}
            />
          </div>
        </div>
        {error && (
          <div className="mt-3" style={{ fontSize: 'var(--text-xs)', color: 'var(--error)' }}>{error}</div>
        )}
        <div className="flex items-center justify-end gap-3 mt-5">
          <button onClick={onClose}
            style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="px-4 py-1.5 rounded font-medium"
            style={{
              fontSize: 'var(--text-sm)',
              background: saving || !title.trim() ? 'var(--bg-subtle)' : 'var(--accent)',
              color: saving || !title.trim() ? 'var(--text-quaternary)' : 'white',
              cursor: saving || !title.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemRow({ item, selected, onToggle }: {
  item: WikiItemSummary;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onToggle(item.id)}
      className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded"
      style={{
        background: selected ? 'var(--bg-subtle)' : 'transparent',
        border: `1px solid ${selected ? 'var(--accent)' : 'transparent'}`,
        transition: 'all var(--duration-fast) var(--ease-out)',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg-subtle)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
    >
      <span className="flex items-center justify-center w-4 h-4 rounded border"
        style={{
          borderColor: selected ? 'var(--accent)' : 'var(--border)',
          background: selected ? 'var(--accent)' : 'transparent',
        }}>
        {selected && (
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>

      <div className="flex-1 min-w-0">
        <span className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
          {item.name}
        </span>
        <span className="ml-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
          {item.sourceCount} 来源
        </span>
      </div>
    </button>
  );
}
