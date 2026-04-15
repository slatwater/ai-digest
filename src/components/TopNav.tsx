'use client';

type View = 'triage' | 'library' | 'wiki' | 'wiki-chat' | 'sandbox' | 'blueprint';

interface TopNavProps {
  active: string;
  onNavigate: (view: View) => void;
  triageProcessing?: boolean;
  triageCounts?: { done: number; total: number };
}

const NAV: { key: View; label: string }[] = [
  { key: 'triage', label: '解析' },
  { key: 'library', label: '知识库' },
  { key: 'wiki', label: 'Wiki' },
  { key: 'wiki-chat', label: 'Wiki 对话' },
  { key: 'sandbox', label: '沙盒' },
];

export function TopNav({ active, onNavigate, triageProcessing, triageCounts }: TopNavProps) {
  // 高亮逻辑：entry 详情归属 library
  const activeGroup = active === 'entry' ? 'library' : active;

  return (
    <nav
      className="shrink-0 flex items-center justify-between px-6 h-12"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      {/* 左侧：品牌 + 导航 */}
      <div className="flex items-center gap-8">
        <span
          className="font-semibold tracking-tight select-none cursor-default"
          style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
        >
          AIDigest
        </span>

        <div className="flex items-center gap-1">
          {NAV.map(({ key, label }) => {
            const isActive = activeGroup === key;
            return (
              <button
                key={key}
                onClick={() => onNavigate(key)}
                className="relative px-3 py-1.5 rounded"
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  transition: 'color var(--duration-fast) var(--ease-out)',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--text-tertiary)'; }}
              >
                {label}
                {/* triage 进行中指示 */}
                {key === 'triage' && triageProcessing && activeGroup !== 'triage' && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
                    style={{ background: 'var(--accent)', animation: 'pulseDot 2s ease-in-out infinite' }}
                  />
                )}
                {/* 活跃下划线 */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-3 right-3 h-px"
                    style={{ background: 'var(--text-primary)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 右侧：调试入口 */}
      <button
        onClick={() => onNavigate('blueprint')}
        className="flex items-center justify-center w-7 h-7 rounded"
        style={{
          color: active === 'blueprint' ? 'var(--text-secondary)' : 'var(--text-quaternary)',
          transition: 'color var(--duration-fast) var(--ease-out)',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
        onMouseLeave={e => { if (active !== 'blueprint') e.currentTarget.style.color = 'var(--text-quaternary)'; }}
        title="运行原理"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      </button>
    </nav>
  );
}
