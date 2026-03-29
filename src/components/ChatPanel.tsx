'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@/hooks/useChat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ChatPanel({ entryId }: { entryId: string }) {
  const { messages, isStreaming, currentReply, error, ask, clear } = useChat(entryId);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentReply]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    ask(input);
    setInput('');
  };

  return (
    <section className="mt-10 pt-8" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3
          className="font-semibold tracking-tight"
          style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}
        >
          追问
        </h3>
        {messages.length > 0 && (
          <button
            onClick={clear}
            className="link-subtle"
            style={{ fontSize: 'var(--text-xs)' }}
          >
            清空对话
          </button>
        )}
      </div>

      {/* 对话列表 */}
      {messages.length > 0 && (
        <div className="space-y-5 mb-6">
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

          {/* 流式回复 */}
          {isStreaming && currentReply && (
            <div
              className="prose prose-neutral prose-sm max-w-none"
              style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentReply}</ReactMarkdown>
            </div>
          )}

          {/* 等待指示器 */}
          {isStreaming && !currentReply && (
            <div className="flex items-center gap-1.5 py-2">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: 'var(--text-quaternary)',
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="mb-4 px-4 py-3 rounded-md"
          style={{
            background: 'var(--error-bg)',
            fontSize: 'var(--text-sm)',
            color: 'var(--error)',
          }}
        >
          {error}
        </div>
      )}

      {/* 输入区 */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="对研究内容有疑问？在此追问..."
          className="input-field flex-1 px-4 py-2.5 rounded-md"
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
          className="btn btn-primary px-4 py-2.5 rounded-md font-medium"
          style={{ fontSize: 'var(--text-sm)' }}
        >
          {isStreaming ? '回答中...' : '提问'}
        </button>
      </form>

      <div ref={bottomRef} />

      {/* 脉冲动画 */}
      <style jsx>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </section>
  );
}
