'use client';

import { useState, useRef, useEffect } from 'react';
import { TriageEntry } from '@/lib/types';
import type { ExpandStage } from '@/hooks/useExpand';
import type { useWikiSave, WikiSaveProposal } from '@/hooks/useWikiSave';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  entry: TriageEntry;
  stages: ExpandStage[];
  wikiSave: ReturnType<typeof useWikiSave>;
}

export function WikiSaveInline({ entry, stages, wikiSave }: Props) {
  const [inputValue, setInputValue] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [wikiSave.messages, wikiSave.proposal, wikiSave.saved]);

  // 未激活：显示触发按钮
  if (!wikiSave.active) {
    return (
      <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={() => wikiSave.startSession(entry, stages)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--accent)',
            border: '1px solid var(--accent-subtle)',
            background: 'var(--accent-subtle)',
            fontWeight: 500,
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--accent-subtle)')}
        >
          存入 Wiki
        </button>
      </div>
    );
  }

  // 已保存
  if (wikiSave.saved) {
    return (
      <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="p-4 rounded-lg" style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent)' }}>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--accent)', fontWeight: 500 }}>
            已存入 Wiki
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || wikiSave.isStreaming) return;
    wikiSave.sendMessage(inputValue.trim());
    setInputValue('');
  };

  return (
    <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <p className="mb-4" style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-quaternary)' }}>
        存入 Wiki
      </p>

      {/* 对话消息 */}
      <div className="space-y-4">
        {wikiSave.messages.map((msg, i) => (
          <div key={i}>
            {msg.role === 'user' ? (
              <div className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--bg-subtle)', fontSize: '0.5rem', color: 'var(--text-quaternary)' }}>U</span>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 500 }}>{msg.content}</p>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-primary)', lineHeight: '1.85', fontSize: 'var(--text-sm)' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripJsonBlock(msg.content)}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}

        {/* 工具状态 */}
        {wikiSave.toolStatus && (
          <p className="flex items-center gap-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
            <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
            {wikiSave.toolStatus}
          </p>
        )}

        {/* 流式加载中 */}
        {wikiSave.isStreaming && !wikiSave.toolStatus && wikiSave.messages.length === 0 && (
          <p className="flex items-center gap-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
            <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
            正在整理方案...
          </p>
        )}
      </div>

      {/* 方案确认卡片：只要有过 proposal 就始终显示，不受 streaming 影响 */}
      {wikiSave.proposal && (
        <ProposalCard
          proposal={wikiSave.proposal}
          isSaving={wikiSave.isSaving}
          onConfirm={() => wikiSave.confirmSave(wikiSave.proposal!)}
        />
      )}

      {/* 输入框：始终可用，和确认按钮并列——用户可以随时调整也可以直接确认 */}
      {!wikiSave.saved && !wikiSave.isSaving && (
        <form onSubmit={handleSubmit} className="flex items-center gap-3 mt-4">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder={wikiSave.isStreaming ? '等待回复...' : '调整意见...'}
            disabled={wikiSave.isStreaming}
            className="flex-1 py-1.5"
            style={{
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
            }}
          />
          {inputValue.trim() && !wikiSave.isStreaming && (
            <button type="submit" style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 500 }}>
              →
            </button>
          )}
        </form>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

// 从显示文本中去掉 JSON 代码块（已通过 proposal 事件单独渲染）
function stripJsonBlock(text: string): string {
  return text.replace(/```json\s*\n[\s\S]*?\n\s*```/g, '').trim();
}

// 方案确认卡片
function ProposalCard({ proposal, isSaving, onConfirm }: {
  proposal: WikiSaveProposal;
  isSaving: boolean;
  onConfirm: () => void;
}) {
  const categoryLabel = proposal.newCategory?.name
    ? `${proposal.newCategory.name}（新建）`
    : proposal.categoryId;

  return (
    <div className="mt-4 p-4 rounded-lg space-y-3" style={{ border: '1px solid var(--border)', background: 'var(--bg)' }}>
      {/* 标题 + 分类 */}
      <div className="flex items-center gap-3">
        <span className="px-2 py-0.5 rounded" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', background: 'var(--accent-subtle)', fontWeight: 500 }}>
          {categoryLabel}
        </span>
        <span className="font-semibold" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
          {proposal.name}
        </span>
      </div>

      {/* 段落预览 */}
      <div className="space-y-1">
        {proposal.sections.map((s, i) => (
          <div key={i} className="flex items-baseline gap-2" style={{ fontSize: 'var(--text-xs)' }}>
            <span style={{ color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)' }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{s.heading}</span>
          </div>
        ))}
      </div>

      {/* 来源数 */}
      {proposal.sourceLinks.length > 0 && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
          {proposal.sourceLinks.length} 个来源链接
        </p>
      )}

      {/* 操作 */}
      <div className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={onConfirm}
          disabled={isSaving}
          className="px-4 py-1.5 rounded-lg transition-colors"
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 500,
            color: '#fff',
            background: isSaving ? 'var(--text-quaternary)' : 'var(--accent)',
          }}
        >
          {isSaving ? '保存中...' : '确认存入'}
        </button>
      </div>
    </div>
  );
}
