'use client';

import { useMemo } from 'react';
import { DigestPhase, PhaseSummary, StreamMessage } from '@/lib/types';

interface Props {
  currentPhase: DigestPhase | null;
  phaseSummary: PhaseSummary;
  messages: StreamMessage[];
  isRunning: boolean;
}

const PHASES: { key: DigestPhase; label: string }[] = [
  { key: 'capture', label: 'Capture' },
  { key: 'trace', label: 'Trace' },
  { key: 'decompose', label: 'Decompose' },
  { key: 'compose', label: 'Compose' },
  { key: 'archive', label: 'Archive' },
];

// Agent 意图表述模式（跳过这些无信息量的句子）
const FILLER_PATTERNS = [
  /^(让我|我来|我将|我需要|首先|接下来|现在|好的|下面)/,
  /^(I'll|Let me|I need|I will|First|Now|OK)/i,
  /^(searching|fetching|reading|looking|checking|analyzing)/i,
  /^(搜索|获取|抓取|读取|查看|分析|处理|开始|进行)/,
  /^===\w+/,
  /^\{/,  // JSON 开头
];

// 从该阶段的流式文本中提取首行有意义内容作为 snippet
function extractSnippet(messages: StreamMessage[], phase: DigestPhase): string {
  const phaseTexts = messages
    .filter(m => m.phase === phase)
    .map(m => m.content)
    .join('');

  if (!phaseTexts) return '';

  const lines = phaseTexts.split('\n');
  for (const line of lines) {
    const trimmed = line.trim()
      .replace(/^[#*\->\s]+/, '')
      .replace(/===\w+===/g, '')
      .trim();

    // 跳过太短、纯符号、Agent 废话
    if (trimmed.length < 10) continue;
    if (/^[{[\]}"',.:;!?·•\-─]+$/.test(trimmed)) continue;
    if (FILLER_PATTERNS.some(p => p.test(trimmed))) continue;

    return trimmed.length > 80 ? trimmed.slice(0, 77) + '...' : trimmed;
  }
  return '';
}

export function PhaseSummaryView({ currentPhase, phaseSummary, messages, isRunning }: Props) {
  if (!currentPhase) return null;

  const currentIndex = PHASES.findIndex(p => p.key === currentPhase);

  // 缓存每个阶段的 snippet
  const snippets = useMemo(() => {
    const map: Partial<Record<DigestPhase, string>> = {};
    for (const phase of PHASES) {
      // 优先用结构化数据，fallback 到流式文本
      const pi = PHASES.findIndex(p => p.key === phase.key);
      if (pi > currentIndex && currentPhase !== 'complete') continue;

      if (phase.key === 'capture' && phaseSummary.capture?.title) {
        map[phase.key] = phaseSummary.capture.title;
      } else if (phase.key === 'trace' && phaseSummary.trace?.sources?.length) {
        map[phase.key] = `${phaseSummary.trace.sources.length} 个来源`;
      } else if (phase.key === 'decompose' && phaseSummary.decompose?.concepts?.length) {
        map[phase.key] = phaseSummary.decompose.concepts.map(c => c.name).join(' · ');
      } else if (phase.key === 'compose' && phaseSummary.compose?.done) {
        map[phase.key] = '叙事报告构建完成';
      } else if (phase.key === 'archive' && phaseSummary.archive?.done) {
        map[phase.key] = '归档完成';
      } else {
        map[phase.key] = extractSnippet(messages, phase.key);
      }
    }
    return map;
  }, [currentPhase, currentIndex, phaseSummary, messages]);

  return (
    <div
      className="py-2"
      style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
    >
      {PHASES.map((phase, i) => {
        const isActive = phase.key === currentPhase && currentPhase !== 'complete';
        const isDone = i < currentIndex || currentPhase === 'complete';
        const isFuture = i > currentIndex && currentPhase !== 'complete';
        const snippet = snippets[phase.key] || '';

        return (
          <div
            key={phase.key}
            className="flex items-start gap-3 py-1.5"
            style={{
              opacity: isFuture ? 0.3 : 1,
              transition: 'opacity 0.3s var(--ease-out)',
            }}
          >
            {/* 状态指示 */}
            <span
              className="shrink-0 w-5 text-center"
              style={{ color: isDone ? 'var(--accent)' : isActive ? 'var(--accent)' : 'var(--text-quaternary)' }}
            >
              {isDone ? '✓' : isActive ? (
                <span className="inline-flex items-center gap-0.5">
                  {[0, 1, 2].map(j => (
                    <span
                      key={j}
                      className="inline-block w-1 h-1 rounded-full animate-pulse"
                      style={{ background: 'var(--accent)', animationDelay: `${j * 200}ms` }}
                    />
                  ))}
                </span>
              ) : '·'}
            </span>

            {/* 阶段名 */}
            <span
              className="shrink-0"
              style={{
                width: '5.5rem',
                color: isDone || isActive ? 'var(--text-primary)' : 'var(--text-quaternary)',
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {phase.label}
            </span>

            {/* Snippet */}
            <span
              className="truncate min-w-0"
              style={{
                color: 'var(--text-tertiary)',
                fontWeight: 400,
              }}
            >
              {snippet}
            </span>
          </div>
        );
      })}
    </div>
  );
}
