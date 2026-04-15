'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { WikiItemSummary, WikiCategory } from '@/lib/types';

interface SandboxProps {
  sandbox: {
    sessionId: string | null;
    loadedSkills: { name: string; command: string; description: string }[];
    activeSkill: string | null;
    messages: { role: string; content: string; timestamp: number }[];
    isStreaming: boolean;
    currentReply: string;
    toolStatus: string | null;
    error: string | null;
    selectedItemIds: string[];
    started: boolean;
    send: (message: string) => void;
    toggleItem: (id: string) => void;
    reset: () => void;
  };
}

export function SandboxView({ sandbox }: SandboxProps) {
  const {
    loadedSkills, activeSkill, messages, isStreaming,
    currentReply, toolStatus, error, selectedItemIds,
    started, send, toggleItem, reset,
  } = sandbox;

  const [input, setInput] = useState('');
  const [categories, setCategories] = useState<WikiCategory[]>([]);
  const [items, setItems] = useState<WikiItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 加载 wiki 条目列表
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
    // 按分类分组
    const grouped = categories.map(cat => ({
      ...cat,
      items: items.filter(i => i.categoryId === cat.id),
    })).filter(g => g.items.length > 0);

    const uncategorized = items.filter(i => !categories.some(c => c.id === i.categoryId));

    return (
      <div>
        <div className="mb-8">
          <h1 className="font-semibold tracking-tight" style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>
            Skill 沙盒
          </h1>
          <p className="mt-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
            选择 Wiki 中的 skill 条目，在隔离环境中试用
          </p>
        </div>

        {loading ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>加载中...</p>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
            Wiki 中暂无条目。请先在 Wiki 中添加 skill 内容。
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

            {/* 启动按钮 */}
            <div className="pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
                  已选择 {selectedItemIds.length} 个条目
                </span>
                <button
                  onClick={() => { if (selectedItemIds.length > 0) send('你好，请介绍已加载的 skill 和可用指令。'); }}
                  disabled={selectedItemIds.length === 0}
                  className="px-5 py-2 rounded font-medium"
                  style={{
                    fontSize: 'var(--text-sm)',
                    background: selectedItemIds.length > 0 ? 'var(--accent)' : 'var(--bg-subtle)',
                    color: selectedItemIds.length > 0 ? 'white' : 'var(--text-quaternary)',
                    cursor: selectedItemIds.length > 0 ? 'pointer' : 'not-allowed',
                    transition: 'opacity var(--duration-fast) var(--ease-out)',
                  }}
                >
                  启动沙盒
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 对话阶段
  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 200px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-semibold tracking-tight" style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>
            Skill 沙盒
          </h1>
          {/* 已加载 skill 标签 */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {loadedSkills.map(s => (
              <span key={s.command}
                className="px-2 py-0.5 rounded"
                style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono)',
                  background: s.command === activeSkill ? 'var(--accent)' : 'var(--bg-subtle)',
                  color: s.command === activeSkill ? 'white' : 'var(--text-tertiary)',
                  border: `1px solid ${s.command === activeSkill ? 'var(--accent)' : 'var(--border-subtle)'}`,
                }}>
                /{s.command}
              </span>
            ))}
          </div>
        </div>
        <button onClick={reset} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-quaternary)')}>
          退出沙盒
        </button>
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

        {/* 流式输出 */}
        {isStreaming && currentReply && (
          <div className="prose prose-neutral prose-sm max-w-none pl-4"
            style={{ borderLeft: '1px solid var(--accent)', color: 'var(--text-primary)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentReply}</ReactMarkdown>
          </div>
        )}

        {/* 工具状态 / 加载指示 */}
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

      {/* Error */}
      {error && (
        <div className="mb-3 py-2" style={{ fontSize: 'var(--text-sm)', color: 'var(--error)' }}>{error}</div>
      )}

      {/* 输入 */}
      <form onSubmit={handleSubmit} className="flex items-center gap-3 pt-6"
        style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={loadedSkills.length > 1 ? '输入消息或 /command 切换 skill...' : '输入消息...'}
          className="input-field flex-1 px-0 py-2"
          style={{
            fontSize: 'var(--text-sm)',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--border)',
            color: 'var(--text-primary)',
            borderRadius: 0,
          }}
          disabled={isStreaming}
        />
        <button
          type="submit"
          disabled={!input.trim() || isStreaming}
          className="btn btn-primary px-4 py-2 rounded font-medium"
          style={{ fontSize: 'var(--text-sm)' }}
        >
          {isStreaming ? '...' : '发送'}
        </button>
      </form>
    </div>
  );
}

// 条目选择行
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
      {/* Checkbox */}
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
        {item.sectionHeadings.length > 0 && (
          <span className="ml-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
            {item.sectionHeadings.slice(0, 3).join(' · ')}
          </span>
        )}
      </div>
    </button>
  );
}
