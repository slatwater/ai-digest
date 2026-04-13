'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '@/lib/types';

interface WikiChatProps {
  chat: {
    messages: ChatMessage[];
    isStreaming: boolean;
    currentReply: string;
    error: string | null;
    ask: (question: string) => void;
    lint: () => void;
    clear: () => void;
  };
}

export function WikiChatView({ chat }: WikiChatProps) {
  const { messages, isStreaming, currentReply, error, ask, lint, clear } = chat;
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
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 200px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-semibold tracking-tight" style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>
            Wiki 对话
          </h1>
          <p className="mt-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
            基于整个知识库，支持跨概念推理
          </p>
        </div>
        {messages.length > 0 && (
          <button onClick={clear} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-quaternary)')}>
            清空
          </button>
        )}
      </div>

      {/* 对话区 */}
      <div className="flex-1 space-y-8">
        {messages.length === 0 && !isStreaming && (
          <div className="space-y-3 pt-4">
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: '1.7' }}>
              向知识库提问，获得基于所有研究积累的回答。
            </p>
            {/* 健康检查 */}
            <button
              onClick={lint}
              className="block w-full text-left py-2.5"
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                color: 'var(--accent)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              知识库健康检查 — 矛盾检测 · 孤立概念 · 关系补全 · 空白分析
            </button>
            {/* 预设 */}
            {[
              '目前知识库中有哪些关键概念？它们之间是什么关系？',
              '有哪些概念之间存在矛盾或不同观点？',
              '知识库中还有哪些明显的空白领域？',
            ].map((q, i) => (
              <button
                key={i}
                onClick={() => setInput(q)}
                className="block w-full text-left py-2.5"
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                  borderBottom: '1px solid var(--border-subtle)',
                  transition: 'color var(--duration-fast) var(--ease-out)',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === 'user' ? (
              <p className="font-medium" style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>
                {msg.content}
              </p>
            ) : (
              <div className="prose prose-neutral prose-sm max-w-none pl-4" style={{ borderLeft: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}

        {isStreaming && currentReply && (
          <div className="prose prose-neutral prose-sm max-w-none pl-4" style={{ borderLeft: '1px solid var(--accent)', color: 'var(--text-primary)' }}>
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

      {/* Error */}
      {error && (
        <div className="mb-3 py-2" style={{ fontSize: 'var(--text-sm)', color: 'var(--error)' }}>{error}</div>
      )}

      {/* 输入 */}
      <form onSubmit={handleSubmit} className="flex items-center gap-3 pt-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="向知识库提问..."
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
          {isStreaming ? '...' : '提问'}
        </button>
      </form>
    </div>
  );
}
