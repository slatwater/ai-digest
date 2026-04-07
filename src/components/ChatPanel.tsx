'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@/hooks/useChat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ChatPanel({ entryId }: { entryId: string }) {
  const { messages, isStreaming, currentReply, error, ask, clear } = useChat(entryId);
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 有新消息时自动展开并滚动
  useEffect(() => {
    if (messages.length > 0 || currentReply) {
      setExpanded(true);
    }
  }, [messages, currentReply]);

  useEffect(() => {
    if (expanded) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, currentReply, expanded]);

  // 展开时聚焦输入框
  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
    }
  }, [expanded]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    ask(input);
    setInput('');
    setExpanded(true);
  };

  const hasHistory = messages.length > 0 || isStreaming;

  return (
    <div
      className="fixed bottom-0 right-0 flex flex-col"
      style={{
        left: '280px', // 与侧边栏宽度对齐
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      <div
        className="mx-auto w-full flex flex-col"
        style={{
          maxWidth: '720px',
          padding: '0 2rem',
          pointerEvents: 'auto',
        }}
      >
        {/* 对话历史（展开时） */}
        {expanded && hasHistory && (
          <div
            className="rounded-t-lg overflow-hidden"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderBottom: 'none',
              maxHeight: '50vh',
              overflowY: 'auto',
            }}
          >
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                追问 · {messages.filter(m => m.role === 'user').length} 条对话
              </span>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    onClick={clear}
                    className="link-subtle"
                    style={{ fontSize: 'var(--text-xs)' }}
                  >
                    清空
                  </button>
                )}
                <button
                  onClick={() => setExpanded(false)}
                  className="link-subtle"
                  style={{ fontSize: 'var(--text-xs)' }}
                >
                  收起
                </button>
              </div>
            </div>

            <div className="px-4 py-3 space-y-4">
              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div
                        className="px-4 py-2.5 rounded-xl max-w-[85%]"
                        style={{
                          background: 'var(--accent)',
                          color: '#fff',
                          fontSize: 'var(--text-sm)',
                          lineHeight: '1.6',
                          borderBottomRightRadius: '4px',
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="prose prose-neutral prose-sm max-w-none"
                      style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}

              {isStreaming && currentReply && (
                <div
                  className="prose prose-neutral prose-sm max-w-none"
                  style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentReply}</ReactMarkdown>
                </div>
              )}

              {isStreaming && !currentReply && (
                <div className="flex items-center gap-1.5 py-2">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: 'var(--text-quaternary)',
                        animation: `chatPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="px-4 py-2 rounded-t-md"
            style={{
              background: 'var(--error-bg)',
              fontSize: 'var(--text-xs)',
              color: 'var(--error)',
            }}
          >
            {error}
          </div>
        )}

        {/* 输入栏：始终固定在底部 */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 px-4 py-3"
          style={{
            background: 'var(--bg-elevated)',
            borderTop: '1px solid var(--border)',
            boxShadow: '0 -4px 16px oklch(0% 0 0 / 0.06)',
            borderRadius: expanded && hasHistory ? 0 : '0.5rem 0.5rem 0 0',
          }}
        >
          {hasHistory && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md"
              style={{
                background: 'var(--accent-subtle)',
                color: 'var(--accent)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
              }}
              title="展开对话"
            >
              {messages.filter(m => m.role === 'user').length}
            </button>
          )}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onFocus={() => { if (hasHistory) setExpanded(true); }}
            placeholder="对研究内容有疑问？随时提问..."
            className="input-field flex-1 px-3 py-2 rounded-md"
            style={{
              fontSize: 'var(--text-sm)',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            disabled={isStreaming}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="btn btn-primary shrink-0 px-4 py-2 rounded-md font-medium"
            style={{ fontSize: 'var(--text-sm)' }}
          >
            {isStreaming ? '...' : '提问'}
          </button>
        </form>
      </div>

      <style jsx>{`
        @keyframes chatPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
