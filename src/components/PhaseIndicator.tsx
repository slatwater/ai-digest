'use client';

import { DigestPhase } from '@/lib/types';

const PHASES: { key: DigestPhase; label: string }[] = [
  { key: 'capture', label: '采集' },
  { key: 'trace', label: '溯源' },
  { key: 'analyze', label: '分析' },
  { key: 'practice', label: '实践' },
  { key: 'archive', label: '归档' },
];

export function PhaseIndicator({ currentPhase }: { currentPhase: DigestPhase | null }) {
  if (!currentPhase) return null;

  const currentIndex = PHASES.findIndex(p => p.key === currentPhase);
  const isComplete = currentPhase === 'complete';

  return (
    <div className="flex items-center gap-3 pt-5 pb-1">
      {PHASES.map((phase, i) => {
        const isActive = phase.key === currentPhase;
        const isDone = isComplete || i < currentIndex;

        return (
          <div key={phase.key} className="flex items-center gap-3">
            {i > 0 && (
              <div
                className="w-12 h-px transition-colors"
                style={{
                  transitionDuration: 'var(--duration-slow)',
                  transitionTimingFunction: 'var(--ease-out)',
                  background: isDone ? 'var(--accent)' : 'var(--border)',
                }}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full transition-all"
                style={{
                  transitionDuration: 'var(--duration-normal)',
                  transitionTimingFunction: 'var(--ease-out)',
                  background: isActive && !isComplete
                    ? 'var(--accent)'
                    : isDone
                      ? 'var(--accent)'
                      : 'var(--border)',
                  boxShadow: isActive && !isComplete
                    ? '0 0 0 4px oklch(42% 0.1 160 / 0.15)'
                    : 'none',
                }}
              />
              <span
                className="text-xs font-medium tracking-wide transition-colors"
                style={{
                  transitionDuration: 'var(--duration-normal)',
                  color: isActive || isDone
                    ? 'var(--text-primary)'
                    : 'var(--text-quaternary)',
                  letterSpacing: '0.04em',
                }}
              >
                {phase.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
