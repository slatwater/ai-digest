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
    clear: () => void;
  };
}

export function WikiChatView({ chat }: WikiChatProps) {
  const { messages, isStreaming, currentReply, error, ask, clear } = chat;
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentReply]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    ask(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2
            className="font-semibold tracking-tight"
            style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}
          >
            Wiki 对话
          </h2>
          <p className="mt-1" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
            基于整个知识库回答，支持跨概念推理
          </p>
        </div>
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

      {/* 对话区域 */}
      <div className="flex-1 space-y-6">
        {messages.length === 0 && !isStreaming && (
          <div className="space-y-4 pt-8">
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: '1.7' }}>
              向知识库提问，获得基于所有研究积累的回答。
            </p>
            <div className="space-y-2">
              {[
                '目前知识库中有哪些关键概念？它们之间是什么关系？',
                '有哪些概念之间存在矛盾或不同观点？',
                '知识库中还有哪些明显的空白领域？',
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(q); }}
                  className="block w-full text-left px-4 py-2.5 rounded-md"
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    transition: 'border-color var(--duration-fast) var(--ease-out)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

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
                  animation: `wikiChatPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-3 px-4 py-3 rounded-md"
          style={{ background: 'var(--error-bg)', fontSize: 'var(--text-sm)', color: 'var(--error)' }}
        >
          {error}
        </div>
      )}

      {/* 输入区 */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-3 pt-4"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="向知识库提问..."
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
          {isStreaming ? '思考中...' : '提问'}
        </button>
      </form>

      <style jsx>{`
        @keyframes wikiChatPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
