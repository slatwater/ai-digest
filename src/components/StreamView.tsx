'use client';

import { useEffect, useRef } from 'react';
import { StreamMessage } from '@/lib/types';

export function StreamView({ messages, isRunning }: { messages: StreamMessage[]; isRunning: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0 && !isRunning) return null;

  // 合并同 phase 的连续文本
  const merged: { phase: string; content: string }[] = [];
  for (const msg of messages) {
    const phase = msg.phase || 'unknown';
    if (merged.length > 0 && merged[merged.length - 1].phase === phase) {
      merged[merged.length - 1].content += msg.content;
    } else {
      merged.push({ phase, content: msg.content });
    }
  }

  return (
    <div className="space-y-4">
      {merged.map((block, i) => (
        <div
          key={i}
          className="whitespace-pre-wrap break-words leading-relaxed"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          {block.content}
        </div>
      ))}
      {isRunning && (
        <div className="flex items-center gap-1.5 py-2">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="block w-1 h-1 rounded-full animate-pulse"
              style={{
                background: 'var(--accent)',
                animationDelay: `${i * 200}ms`,
                animationDuration: '1s',
              }}
            />
          ))}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
