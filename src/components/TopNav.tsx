'use client';

import { useEffect, useState } from 'react';

type View = 'triage' | 'wiki' | 'blueprint';

interface TopNavProps {
  active: string;
  onNavigate: (view: View) => void;
  triageProcessing?: boolean;
  triageCounts?: { done: number; total: number };
}

const NAV: { key: View; zh: string; en: string }[] = [
  { key: 'triage', zh: '解析', en: 'triage' },
  { key: 'wiki', zh: 'Wiki', en: 'wiki' },
];

// 暗纸底版（与画布 / Wiki 同色系）
const PAPER = '#14110d';   // 暗纸底
const INK = '#f4ede0';     // 浅墨字
const INK_SOFT = '#c9bfae';
const MUTE = '#8a7f6d';
const RULE = '#3a3428';
const RED = '#e05d35';     // 暗底用更亮朱砂
const RED_DEEP = '#c94a1a';

// NavB · 报纸报头式
export function TopNav({ active, onNavigate, triageProcessing }: TopNavProps) {
  const [dateLabel, setDateLabel] = useState('');
  useEffect(() => {
    setDateLabel(new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase());
  }, []);

  return (
    <nav
      className="shrink-0 flex items-end justify-between"
      style={{
        borderBottom: `1px solid ${RULE}`,
        padding: '18px 40px 14px',
        background: PAPER,
        fontFamily: 'Inter, var(--font-geist-sans), sans-serif',
      }}
    >
      {/* 左：报头 + 期号 */}
      <div className="flex items-baseline gap-8">
        <button
          onClick={() => onNavigate('triage')}
          style={{
            fontFamily: 'var(--font-fraunces), Georgia, serif',
            fontSize: 28, fontWeight: 600,
            letterSpacing: '-0.8px', color: INK,
            background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          AIDigest<span style={{ color: RED }}>.</span>
        </button>
        <div
          className="hidden md:block"
          style={{
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 10, color: MUTE, letterSpacing: 1.2,
            textTransform: 'uppercase', paddingBottom: 3,
          }}
        >
          FIELD NOTES · VOL.IV · {dateLabel}
        </div>
      </div>

      {/* 中/右：导航 + 调试入口 */}
      <div className="flex items-center gap-4">
        <div className="flex" style={{ fontFamily: 'var(--font-geist-mono), ui-monospace, monospace', fontSize: 12 }}>
          {NAV.map(({ key, zh, en }, i) => {
            const isActive = active === key;
            return (
              <button
                key={key}
                onClick={() => onNavigate(key)}
                style={{
                  padding: '6px 14px',
                  background: isActive ? RED_DEEP : 'transparent',
                  color: isActive ? '#fff5e8' : INK_SOFT,
                  border: `1px solid ${isActive ? RED_DEEP : RULE}`,
                  marginLeft: i === 0 ? 0 : -1,
                  cursor: 'pointer',
                  position: 'relative',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  transition: 'color 120ms ease, border-color 120ms ease, background 120ms ease',
                }}
              >
                {zh}
                <span style={{ opacity: 0.55, marginLeft: 6, fontSize: 10 }}>/{en}</span>
                {key === 'triage' && triageProcessing && !isActive && (
                  <span
                    className="absolute"
                    style={{
                      top: -3, right: -3, width: 6, height: 6, borderRadius: '50%',
                      background: RED, animation: 'pulseDot 2s ease-in-out infinite',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => onNavigate('blueprint')}
          style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${active === 'blueprint' ? RED_DEEP : RULE}`, marginLeft: -1,
            background: active === 'blueprint' ? RED_DEEP : 'transparent',
            color: active === 'blueprint' ? '#fff5e8' : INK_SOFT,
            cursor: 'pointer',
            transition: 'color 120ms ease, border-color 120ms ease, background 120ms ease',
          }}
          title="运行原理"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
