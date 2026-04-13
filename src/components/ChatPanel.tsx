'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@/hooks/useChat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ChatPanel({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const { messages, isStreaming, currentReply, error, ask, clear } = useChat(entryId);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, currentReply]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    ask(input);
    setInput('');
  };

  return (
    <aside
      className="shrink-0 flex flex-col h-full"
      style={{ width: 380, borderLeft: '1px solid var(--border)', background: 'var(--bg)' }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>追问</span>
        <div className="flex items-center gap-3">
          {messages.length > 0 && (
            <button onClick={clear} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-quaternary)')}>
              清空
            </button>
          )}
          <button onClick={onClose} className="link-subtle" style={{ fontSize: 'var(--text-sm)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* 对话 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {messages.length === 0 && !isStreaming && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)', lineHeight: '1.6' }}>
            基于研究报告全文回答。
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === 'user' ? (
              <p className="font-medium" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                {msg.content}
              </p>
            ) : (
              <div className="prose prose-neutral prose-sm max-w-none pl-3"
                style={{ borderLeft: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        {isStreaming && currentReply && (
          <div className="prose prose-neutral prose-sm max-w-none pl-3"
            style={{ borderLeft: '1px solid var(--accent)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentReply}</ReactMarkdown>
          </div>
        )}
        {isStreaming && !currentReply && (
          <div className="flex items-center gap-1.5 py-2">
            {[0, 1, 2].map(j => (
              <span key={j} className="w-1 h-1 rounded-full"
                style={{ background: 'var(--accent)', animation: `pulseDot 1.5s ease-in-out ${j * 200}ms infinite` }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mx-5 mb-2 py-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--error)' }}>{error}</div>
      )}

      {/* 输入 */}
      <form onSubmit={handleSubmit} className="shrink-0 flex items-center gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="输入问题..."
          className="input-field flex-1 px-0 py-1.5"
          style={{
            fontSize: 'var(--text-sm)',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            borderRadius: 0,
          }}
          disabled={isStreaming}
        />
        <button
          type="submit"
          disabled={!input.trim() || isStreaming}
          style={{
            fontSize: 'var(--text-sm)',
            color: !input.trim() || isStreaming ? 'var(--text-quaternary)' : 'var(--accent)',
            fontWeight: 500,
          }}
        >
          {isStreaming ? '...' : '发送'}
        </button>
      </form>
    </aside>
  );
}
