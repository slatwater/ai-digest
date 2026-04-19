'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import type {
  PipelineSession,
  PipelineNode,
  SedimentPoint,
  SedimentMode,
  TriageModel,
} from '@/lib/types';
import type { usePipeline } from '@/hooks/usePipeline';

type PipelineCtx = ReturnType<typeof usePipeline>;

interface Props {
  pipeline: PipelineCtx;
  onExit?: () => void;            // 可选：外部导航（如返回 wiki 等其它视图）
}

// 卡片固定尺寸
const NODE_W = 280;
const NODE_H = 160;

function validUrl(u: string): boolean {
  const t = u.trim();
  return /^https?:\/\//i.test(t);
}

// 文本截断助手
function truncate(text: string, max: number): string {
  if (!text) return '';
  const plain = text.replace(/```[\s\S]*?```/g, '[code]').replace(/\s+/g, ' ').trim();
  return plain.length > max ? plain.slice(0, max) + '…' : plain;
}

/* ──────────────────────────────────────────────────────────
   Narrative — markdown-ish inline renderer
   ────────────────────────────────────────────────────────── */
type NarrativeSize = 'small' | 'normal' | 'large';

function Narrative({ text, small, size }: { text: string; small?: boolean; size?: NarrativeSize }) {
  if (!text) return null;
  const resolved: NarrativeSize = size ?? (small ? 'small' : 'normal');
  const fontSize = resolved === 'large' ? 16 : resolved === 'small' ? 12 : 13;
  const codeFontSize = resolved === 'large' ? 14 : resolved === 'small' ? 11 : 12;
  const lineHeight = resolved === 'large' ? 1.85 : 1.65;
  const color = resolved === 'large' ? 'var(--ink)' : 'var(--ink2)';
  const parts = text.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\]|`[^`]+`)/g);
  return (
    <span
      className={resolved === 'large' ? 'serif' : undefined}
      style={{
        fontSize,
        lineHeight,
        color,
        whiteSpace: 'pre-wrap',
        letterSpacing: resolved === 'large' ? 0.1 : 0,
      }}
    >
      {parts.map((p, i) => {
        if (/^\*\*.*\*\*$/.test(p))
          return (
            <strong key={i} style={{ color: 'var(--ink)', fontWeight: 600 }}>
              {p.slice(2, -2)}
            </strong>
          );
        if (/^\[\[.*\]\]$/.test(p))
          return (
            <a
              key={i}
              style={{
                color: 'var(--amber)',
                borderBottom: '1px dashed var(--amber)',
                textDecoration: 'none',
                fontWeight: resolved === 'large' ? 500 : 400,
              }}
            >
              {p.slice(2, -2)}
            </a>
          );
        if (/^`.*`$/.test(p))
          return (
            <code
              key={i}
              style={{
                fontFamily: 'JetBrains Mono,monospace',
                fontSize: codeFontSize,
                background: 'var(--bg2)',
                padding: '1px 5px',
                color: 'var(--amber)',
                border: '1px solid var(--rule)',
              }}
            >
              {p.slice(1, -1)}
            </code>
          );
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────
   TopBar
   ────────────────────────────────────────────────────────── */
function TopBar({
  session,
  onExit,
  onOpenReview,
  onNewFlow,
  model,
  onModelChange,
}: {
  session: PipelineSession;
  onExit?: () => void;
  onOpenReview: () => void;
  onNewFlow: () => void;
  model: TriageModel;
  onModelChange: (m: TriageModel) => void;
}) {
  const markedCount = session.nodes.filter(n => n.marked).length;
  const firstParseTitle =
    session.nodes.find(n => n.type === 'parse' && n.parseEntry?.title)?.parseEntry?.title ||
    session.entrySnapshot?.title ||
    '画布';
  const [elapsed, setElapsed] = useState('00:00:00');
  const t0 = useRef<number>(Date.parse(session.createdAt));
  useEffect(() => {
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - t0.current) / 1000));
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      setElapsed(`${hh}:${mm}:${ss}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.id]);

  return (
    <header
      style={{
        height: 52,
        borderBottom: '1px solid var(--rule)',
        background: 'var(--bg2)',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        padding: '0 20px',
        gap: 20,
        position: 'relative',
        zIndex: 5,
      }}
    >
      {/* Left: title + 新流程 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={onNewFlow}
          className="mono"
          style={{
            fontSize: 11,
            padding: '6px 12px',
            letterSpacing: 0.3,
            color: 'var(--amber)',
            border: '1px solid var(--amber)',
            background: 'var(--amber-soft)',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          title="在画布下方新增一条解析流"
        >
          + 新流程
        </button>
        {onExit && (
          <button
            onClick={onExit}
            className="mono"
            style={{ fontSize: 11, color: 'var(--ink3)', letterSpacing: 0.3 }}
          >
            ← 返回
          </button>
        )}
        <span style={{ color: 'var(--ink4)' }}>/</span>
        <span
          className="serif"
          style={{
            fontSize: 15,
            fontWeight: 500,
            color: 'var(--ink)',
            letterSpacing: -0.2,
            maxWidth: 320,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {firstParseTitle}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 9,
            color: 'var(--amber)',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            border: '1px solid var(--amber)',
            padding: '2px 6px',
          }}
        >
          统一画布
        </span>
      </div>

      {/* Center: status */}
      <div
        className="mono"
        style={{
          justifySelf: 'center',
          display: 'flex',
          gap: 20,
          fontSize: 10,
          color: 'var(--ink3)',
          letterSpacing: 0.5,
        }}
      >
        <span>session#{session.id.slice(0, 8)}</span>
        <span style={{ color: 'var(--ink4)' }}>│</span>
        <span>elapsed {elapsed}</span>
        <span style={{ color: 'var(--ink4)' }}>│</span>
        <span>{session.nodes.length} 节点</span>
        <span style={{ color: 'var(--ink4)' }}>│</span>
        <span style={{ color: 'var(--amber)' }}>● {markedCount} 已标记</span>
      </div>

      {/* Right: model picker + action */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span
          className="mono"
          style={{
            display: 'inline-flex',
            fontSize: 10,
            border: '1px solid var(--rule)',
            overflow: 'hidden',
          }}
        >
          {(['sonnet', 'opus-4-6', 'opus'] as TriageModel[]).map(m => (
            <button
              key={m}
              onClick={() => onModelChange(m)}
              style={{
                padding: '4px 10px',
                color: model === m ? 'var(--bg)' : 'var(--ink3)',
                background: model === m ? 'var(--amber)' : 'transparent',
                letterSpacing: 0.3,
                fontWeight: model === m ? 600 : 400,
                borderLeft: m === 'sonnet' ? 'none' : '1px solid var(--rule)',
              }}
            >
              {m === 'opus-4-6' ? 'opus 4.6' : m === 'opus' ? 'opus 4.7' : 'sonnet'}
            </button>
          ))}
        </span>
        <button
          onClick={onOpenReview}
          className="mono"
          style={{
            fontSize: 11,
            padding: '6px 14px',
            letterSpacing: 0.3,
            background: 'var(--amber)',
            color: 'var(--bg)',
            border: '1px solid var(--amber)',
            fontWeight: 600,
          }}
        >
          整理 → 存入 Wiki
        </button>
      </div>
    </header>
  );
}


/* ──────────────────────────────────────────────────────────
   Canvas — pan/zoom, nodes, bezier connectors
   ────────────────────────────────────────────────────────── */
function Canvas({
  nodes,
  streamingNodeId,
  toolStatus,
  selectedNode,
  setSelectedNode,
  onMark,
  onUnmark,
  onOpen,
  onSubmitInput,
}: {
  nodes: PipelineNode[];
  streamingNodeId: string | null;
  toolStatus: string | null;
  selectedNode: string | null;
  setSelectedNode: (id: string | null) => void;
  onMark: (id: string) => void;
  onUnmark: (id: string) => void;
  onOpen: (nodeId: string) => void;
  onSubmitInput: (nodeId: string, urls: string[]) => void;
}) {
  const [view, setView] = useState({ x: 40, y: 20, zoom: 0.9 });
  const [panning, setPanning] = useState<
    { startX: number; startY: number; viewX: number; viewY: number } | null
  >(null);
  const ref = useRef<HTMLDivElement>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-node]')) return;
    setPanning({
      startX: e.clientX,
      startY: e.clientY,
      viewX: view.x,
      viewY: view.y,
    });
    setSelectedNode(null);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!panning) return;
    setView(v => ({
      ...v,
      x: panning.viewX + (e.clientX - panning.startX),
      y: panning.viewY + (e.clientY - panning.startY),
    }));
  };
  const onMouseUp = () => setPanning(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const d = e.deltaY > 0 ? 0.95 : 1.05;
      setView(v => ({
        ...v,
        zoom: Math.max(0.4, Math.min(1.6, v.zoom * d)),
      }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const edges = nodes
    .filter(n => n.parent)
    .map(n => {
      const p = nodes.find(x => x.id === n.parent);
      return p ? { from: p, to: n } : null;
    })
    .filter((e): e is { from: PipelineNode; to: PipelineNode } => !!e);

  const bounds = useMemo(() => {
    if (!nodes.length)
      return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    nodes.forEach(n => {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      const w = n.w ?? NODE_W;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + NODE_H);
    });
    return { minX: minX - 40, minY: minY - 40, maxX: maxX + 40, maxY: maxY + 40 };
  }, [nodes]);

  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        cursor: panning ? 'grabbing' : 'grab',
        background: 'var(--bg)',
      }}
    >
      <div
        className="canvas-bg"
        style={{ backgroundPosition: `${view.x % 20}px ${view.y % 20}px` }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.35) 100%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: view.x,
          top: view.y,
          transform: `scale(${view.zoom})`,
          transformOrigin: '0 0',
        }}
      >
        <svg
          style={{
            position: 'absolute',
            left: bounds.minX,
            top: bounds.minY,
            pointerEvents: 'none',
            overflow: 'visible',
          }}
          width={bounds.maxX - bounds.minX}
          height={bounds.maxY - bounds.minY}
        >
          <defs>
            <marker
              id="pipe-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 Z" fill="var(--ink3)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            // 水平连线：从父节点右边中线 → 子节点左边中线
            const fromX = (e.from.x ?? 0) - bounds.minX + (e.from.w ?? NODE_W);
            const fromY = (e.from.y ?? 0) - bounds.minY + NODE_H / 2;
            const toX = (e.to.x ?? 0) - bounds.minX;
            const toY = (e.to.y ?? 0) - bounds.minY + NODE_H / 2;
            const isBranch = e.from.branchIdx !== e.to.branchIdx && e.from.type !== 'input';
            const isParseEdge = e.from.type === 'input' && e.to.type === 'parse';
            const stroke = isBranch
              ? 'var(--branch)'
              : isParseEdge
                ? 'var(--red)'
                : 'var(--ink3)';
            const cx = (fromX + toX) / 2;
            const d = `M ${fromX} ${fromY} C ${cx} ${fromY}, ${cx} ${toY}, ${toX} ${toY}`;
            // parse 解析过程：在连线中点标注当前阶段
            const parseLabel = isParseEdge
              ? (e.to.parseEntry?.liveStatus
                  || (e.to.state === 'done' ? '解析完成' : null))
              : null;
            return (
              <g key={i}>
                <path
                  d={d}
                  stroke={stroke}
                  strokeWidth={isBranch ? 1.5 : isParseEdge ? 1.5 : 1.2}
                  fill="none"
                  strokeDasharray={isBranch ? '4 4' : isParseEdge && e.to.state !== 'done' ? '6 3' : '0'}
                  opacity={0.75}
                  markerEnd="url(#pipe-arrow)"
                />
                {isBranch && e.to.branchLabel && (
                  <g transform={`translate(${toX - 40}, ${toY - 16})`}>
                    <rect
                      x="-4"
                      y="-10"
                      width="140"
                      height="14"
                      fill="var(--panel)"
                      stroke="var(--branch)"
                      strokeWidth="1"
                    />
                    <text
                      x="4"
                      y="1"
                      fontSize="9"
                      fill="var(--branch)"
                      fontFamily="JetBrains Mono"
                    >
                      ↳ {e.to.branchLabel}
                    </text>
                  </g>
                )}
                {parseLabel && (
                  <g transform={`translate(${cx}, ${(fromY + toY) / 2 - 14})`}>
                    <rect
                      x={-(Math.min(120, parseLabel.length * 8)) / 2 - 6}
                      y={-10}
                      width={Math.min(120, parseLabel.length * 8) + 12}
                      height={16}
                      fill="var(--bg2)"
                      stroke="var(--red)"
                      strokeWidth={1}
                    />
                    <text
                      x={0}
                      y={1}
                      fontSize="9"
                      fill="var(--red)"
                      fontFamily="JetBrains Mono"
                      textAnchor="middle"
                    >
                      {e.to.state === 'done' ? '✓ ' : '● '}
                      {parseLabel}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {nodes.map(n => (
          <CanvasNode
            key={n.id}
            node={n}
            selected={selectedNode === n.id}
            streaming={streamingNodeId === n.id}
            toolStatus={streamingNodeId === n.id ? toolStatus : null}
            onSelect={() => setSelectedNode(n.id)}
            onMark={() => onMark(n.id)}
            onUnmark={() => onUnmark(n.id)}
            onOpen={() => onOpen(n.id)}
            onSubmitInput={onSubmitInput}
          />
        ))}
      </div>

      {/* Zoom controls */}
      <div
        style={{
          position: 'absolute',
          right: 16,
          bottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: 'var(--panel)',
          border: '1px solid var(--rule)',
          padding: 4,
        }}
      >
        <button
          className="mono tool-btn"
          onClick={() =>
            setView(v => ({ ...v, zoom: Math.min(1.6, v.zoom * 1.1) }))
          }
          style={{ width: 28, height: 28, fontSize: 14 }}
        >
          ＋
        </button>
        <div
          className="mono"
          style={{
            fontSize: 9,
            color: 'var(--ink3)',
            textAlign: 'center',
            padding: '2px 0',
          }}
        >
          {Math.round(view.zoom * 100)}%
        </div>
        <button
          className="mono tool-btn"
          onClick={() =>
            setView(v => ({ ...v, zoom: Math.max(0.4, v.zoom * 0.9) }))
          }
          style={{ width: 28, height: 28, fontSize: 14 }}
        >
          −
        </button>
        <div style={{ height: 1, background: 'var(--rule)', margin: '2px 0' }} />
        <button
          className="mono tool-btn"
          onClick={() => setView({ x: 40, y: 20, zoom: 0.9 })}
          style={{ width: 28, height: 28, fontSize: 10 }}
        >
          ⊡
        </button>
      </div>

      {nodes.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            className="mono"
            style={{
              color: 'var(--ink3)',
              fontSize: 11,
              letterSpacing: 1,
              textTransform: 'uppercase',
              textAlign: 'center',
              lineHeight: 2,
            }}
          >
            空画布
            <br />
            <span style={{ color: 'var(--ink4)' }}>点击左上角「+ 新流程」开始</span>
          </div>
        </div>
      )}

      <div
        className="mono"
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 10,
          color: 'var(--ink3)',
          letterSpacing: 0.5,
          background: 'var(--bg2)',
          padding: '4px 10px',
          border: '1px solid var(--rule)',
          pointerEvents: 'none',
        }}
      >
        拖拽平移 · ⌘滚轮缩放 · 双击解析卡查看完整内容 · 回答卡可标记为要点
      </div>
    </div>
  );
}

// 按节点类型返回视觉规格：底色 / 左边条颜色 / 头部标签 / 头部色
function nodeVisuals(node: PipelineNode, selected: boolean): {
  bg: string;
  headerBg: string;
  leftBar: string;
  label: string;
  labelColor: string;
  clickTitle: string;
} {
  switch (node.type) {
    case 'input':
      return {
        bg: 'var(--panel)',
        headerBg: 'rgba(0,0,0,0.22)',
        leftBar: 'var(--ink)',
        label: '✎ 粘贴链接',
        labelColor: 'var(--ink2)',
        clickTitle: '双击展开输入框',
      };
    case 'parse':
      return {
        bg: 'var(--panel)',
        headerBg: 'rgba(201,74,26,0.08)',
        leftBar: 'var(--red)',
        label: '◎ 解析',
        labelColor: 'var(--red)',
        clickTitle: '双击查看完整解析',
      };
    case 'question':
      return {
        bg: 'var(--panel2)',
        headerBg: 'rgba(0,0,0,0.2)',
        leftBar: 'var(--amber)',
        label: '→ 你问',
        labelColor: 'var(--amber)',
        clickTitle: '双击展开对话详情',
      };
    default: // answer
      return {
        bg: 'var(--panel)',
        headerBg: 'transparent',
        leftBar: 'var(--ink3)',
        label: '← agent',
        labelColor: 'var(--ink3)',
        clickTitle: '双击展开对话详情',
      };
  }
  // note: 选中态与 marked 态的覆盖在外层边框 / 左条处理
  void selected;
}

function CanvasNode({
  node,
  selected,
  streaming,
  toolStatus,
  onSelect,
  onMark,
  onUnmark,
  onOpen,
  onSubmitInput,
}: {
  node: PipelineNode;
  selected: boolean;
  streaming: boolean;
  toolStatus: string | null;
  onSelect: () => void;
  onMark: () => void;
  onUnmark: () => void;
  onOpen: () => void;
  onSubmitInput: (nodeId: string, urls: string[]) => void;
}) {
  const [hovering, setHovering] = useState(false);
  const v = nodeVisuals(node, selected);
  const isQ = node.type === 'question';
  const isAnswer = node.type === 'answer';
  const isInput = node.type === 'input';
  const isParse = node.type === 'parse';
  const isStreaming = node.state === 'streaming' || streaming;

  const stateLabel = isStreaming
    ? (isParse ? '● 解析中' : '● 正在写')
    : node.state === 'error'
      ? '× 失败'
      : node.state === 'pending'
        ? '等待'
        : 'done';
  const stateColor = isStreaming
    ? 'var(--red)'
    : node.state === 'error'
      ? 'var(--red)'
      : 'var(--ink3)';

  // 摘要文本（parse 节点用 title + narrative 摘要；input 节点展示 URL 列表；Q/A 用 text）
  let summaryLines: string[] = [];
  if (isInput) {
    summaryLines = node.inputUrls?.length
      ? node.inputUrls.slice(0, 3)
      : ['（尚未粘贴链接，双击编辑）'];
  } else if (isParse) {
    const p = node.parseEntry;
    summaryLines = [
      p?.title || p?.url || '解析中…',
      p?.narrative ? truncate(p.narrative, 110) : (p?.liveStatus || '排队中'),
    ];
  }

  const summaryText = !isInput && !isParse
    ? (isQ
        ? truncate(node.text, 90)
        : node.text
          ? truncate(node.text, 140)
          : isStreaming
            ? '正在生成…'
            : '')
    : '';

  const borderColor = selected
    ? 'var(--amber)'
    : node.marked
      ? 'var(--amber)'
      : 'var(--rule)';

  return (
    <div
      data-node={node.id}
      onClick={e => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={e => {
        e.stopPropagation();
        onOpen();
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      title={v.clickTitle}
      style={{
        position: 'absolute',
        left: node.x ?? 0,
        top: node.y ?? 0,
        width: node.w ?? NODE_W,
        height: NODE_H,
        background: v.bg,
        borderTop: `1px solid ${borderColor}`,
        borderRight: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${node.marked ? 'var(--amber)' : v.leftBar}`,
        boxShadow: selected
          ? '0 0 0 3px rgba(232,162,76,0.15), 4px 4px 0 rgba(0,0,0,0.4)'
          : '3px 3px 0 rgba(0,0,0,0.4)',
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {isStreaming && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            overflow: 'hidden',
            zIndex: 1,
          }}
        >
          <div
            style={{
              height: '100%',
              width: '40%',
              background: 'var(--red)',
              boxShadow: '0 0 8px var(--red)',
              animation: 'pipelineScanBar 1.8s linear infinite',
            }}
          />
        </div>
      )}

      {/* Header strip */}
      <div
        style={{
          padding: '5px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderBottom: '1px solid var(--rule)',
          background: v.headerBg,
          flexShrink: 0,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: v.labelColor,
            fontWeight: 600,
          }}
        >
          {v.label}
        </span>
        <span className="mono" style={{ fontSize: 9, color: 'var(--ink4)' }}>
          {node.id}
        </span>
        {node.branchLabel && (
          <span
            className="mono"
            style={{
              fontSize: 9,
              color: 'var(--branch)',
              border: '1px solid var(--branch)',
              padding: '1px 4px',
              letterSpacing: 0.5,
              maxWidth: 90,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.branchLabel}
          </span>
        )}
        {node.marked && (
          <span
            className="mono"
            style={{
              fontSize: 8,
              color: 'var(--bg)',
              background: 'var(--amber)',
              padding: '1px 4px',
              letterSpacing: 0.5,
              fontWeight: 600,
            }}
          >
            ✓
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span
          className="mono"
          style={{ fontSize: 9, color: stateColor, letterSpacing: 0.5 }}
        >
          {stateLabel}
        </span>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          padding: '10px 12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {isInput && (
          <InputNodeBody
            node={node}
            onSubmit={urls => onSubmitInput(node.id, urls)}
          />
        )}

        {isParse && (
          <>
            <div
              className="serif"
              style={{
                fontSize: 13,
                lineHeight: 1.35,
                color: 'var(--ink)',
                fontWeight: 600,
                letterSpacing: -0.2,
                display: '-webkit-box',
                WebkitLineClamp: 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {summaryLines[0]}
            </div>
            <div
              style={{
                fontSize: 11,
                lineHeight: 1.5,
                color: 'var(--ink2)',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {summaryLines[1]}
            </div>
          </>
        )}

        {!isInput && !isParse && (
          <div
            className={isQ ? 'serif' : undefined}
            style={{
              fontSize: isQ ? 13 : 12,
              lineHeight: 1.5,
              color: isQ ? 'var(--ink)' : 'var(--ink2)',
              fontWeight: isQ ? 500 : 400,
              letterSpacing: isQ ? -0.1 : 0,
              display: '-webkit-box',
              WebkitLineClamp: isQ ? 3 : 4,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              flex: 1,
            }}
          >
            {summaryText}
          </div>
        )}

        {isStreaming && isAnswer && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 4,
            }}
          >
            {[0, 1, 2].map(i => (
              <span
                key={i}
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: 'var(--red)',
                  animation: `pipelineTypingDot 1s infinite ${i * 0.15}s`,
                }}
              />
            ))}
            {toolStatus && (
              <span
                className="mono"
                style={{
                  fontSize: 9,
                  color: 'var(--red)',
                  marginLeft: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {toolStatus}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '4px 10px',
          borderTop: '1px dashed var(--rule)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
          background: 'rgba(0,0,0,0.15)',
        }}
      >
        {isAnswer && (node.duration || node.tokens) && (
          <span
            className="mono"
            style={{ fontSize: 9, color: 'var(--ink3)' }}
          >
            {node.duration ?? ''}
            {node.duration && node.tokens ? ' · ' : ''}
            {node.tokens ? `${node.tokens}t` : ''}
          </span>
        )}
        {isParse && node.parseEntry?.concepts && (
          <span className="mono" style={{ fontSize: 9, color: 'var(--ink3)' }}>
            {node.parseEntry.concepts.length} 概念
          </span>
        )}
        {node.createdAt && (
          <span className="mono" style={{ fontSize: 9, color: 'var(--ink4)' }}>
            {node.createdAt.length > 8
              ? node.createdAt.slice(11, 19)
              : node.createdAt}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {isAnswer && node.state === 'done' && !node.marked && (
          <button
            onClick={e => {
              e.stopPropagation();
              onMark();
            }}
            className="mono"
            style={{
              fontSize: 9,
              color: 'var(--amber)',
              border: '1px solid var(--amber)',
              padding: '2px 6px',
              letterSpacing: 0.3,
              opacity: hovering || selected ? 1 : 0.55,
              transition: 'opacity 0.15s',
            }}
          >
            ◈ 标记
          </button>
        )}
        {isAnswer && node.marked && (
          <button
            onClick={e => {
              e.stopPropagation();
              onUnmark();
            }}
            className="mono"
            style={{
              fontSize: 9,
              color: 'var(--amber)',
              letterSpacing: 0.3,
            }}
          >
            取消
          </button>
        )}
        <span
          className="mono"
          style={{
            fontSize: 9,
            color: 'var(--ink4)',
            letterSpacing: 0.5,
            opacity: hovering ? 1 : 0.5,
            transition: 'opacity 0.15s',
          }}
        >
          双击 ⇱
        </span>
      </div>
    </div>
  );
}

// InputNodeBody — 输入卡主体（粘贴 URL，回车提交）
function InputNodeBody({
  node,
  onSubmit,
}: {
  node: PipelineNode;
  onSubmit: (urls: string[]) => void;
}) {
  const [value, setValue] = useState(node.inputUrls?.join('\n') || '');
  const urls = value
    .split(/\r?\n|\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  const valid = urls.filter(validUrl);
  const submitted = (node.inputUrls?.length ?? 0) > 0;

  if (submitted) {
    return (
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <div
          className="mono"
          style={{ fontSize: 9, color: 'var(--ink3)', letterSpacing: 0.5 }}
        >
          ✓ 已提交 {node.inputUrls?.length ?? 0} 条
        </div>
        {node.inputUrls?.slice(0, 3).map((u, i) => (
          <div
            key={i}
            className="mono"
            style={{
              fontSize: 10,
              color: 'var(--ink2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {u}
          </div>
        ))}
        {node.inputUrls && node.inputUrls.length > 3 && (
          <div className="mono" style={{ fontSize: 9, color: 'var(--ink4)' }}>
            +{node.inputUrls.length - 3} 更多
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onSubmit={e => {
        e.preventDefault();
        if (valid.length) onSubmit(valid);
      }}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            if (valid.length) onSubmit(valid);
          }
        }}
        placeholder="粘贴 http(s) 链接，每行一个"
        className="mono"
        style={{
          flex: 1,
          resize: 'none',
          background: 'var(--bg)',
          color: 'var(--ink)',
          border: '1px solid var(--rule)',
          padding: '6px 8px',
          fontSize: 10,
          lineHeight: 1.45,
          outline: 'none',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          className="mono"
          style={{ fontSize: 9, color: 'var(--ink3)', letterSpacing: 0.3 }}
        >
          {valid.length}/{urls.length} 有效
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="submit"
          disabled={!valid.length}
          className="mono"
          style={{
            fontSize: 10,
            padding: '2px 8px',
            letterSpacing: 0.3,
            color: valid.length ? 'var(--bg)' : 'var(--ink4)',
            background: valid.length ? 'var(--red)' : 'transparent',
            border: `1px solid ${valid.length ? 'var(--red)' : 'var(--rule)'}`,
            fontWeight: 600,
            cursor: valid.length ? 'pointer' : 'not-allowed',
          }}
        >
          ⌘↵ 开始解析
        </button>
      </div>
    </form>
  );
}

/* ──────────────────────────────────────────────────────────
   SedimentTray (right)
   ────────────────────────────────────────────────────────── */
function SedimentTray({
  points,
  onJumpTo,
  onRemove,
  setShowReview,
}: {
  points: SedimentPoint[];
  onJumpTo: (nodeId: string) => void;
  onRemove: (id: string) => void;
  setShowReview: (v: boolean) => void;
}) {
  return (
    <aside
      style={{
        width: 300,
        height: '100%',
        borderLeft: '1px solid var(--rule)',
        background: 'var(--panel)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 4,
      }}
    >
      <div
        style={{
          padding: '12px 16px 10px',
          borderBottom: '1px solid var(--rule)',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div
            className="mono"
            style={{
              fontSize: 9,
              color: 'var(--red)',
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            ◈ 沉淀区 · sediment
          </div>
          <div
            className="serif"
            style={{
              fontSize: 15,
              color: 'var(--ink)',
              fontWeight: 500,
              marginTop: 2,
              letterSpacing: -0.1,
            }}
          >
            {points.length} 个要点
          </div>
        </div>
      </div>

      <div
        className="scroll"
        style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 20px' }}
      >
        {points.length === 0 && (
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: 'var(--ink3)',
              textAlign: 'center',
              padding: '40px 10px',
              border: '1px dashed var(--rule)',
              lineHeight: 1.6,
            }}
          >
            还没有标记任何要点
            <br />
            <span style={{ color: 'var(--ink4)' }}>
              悬停回答 → 点 ◈ 标为要点
            </span>
          </div>
        )}

        {points.map((p, i) => (
          <div
            key={p.id}
            style={{
              marginBottom: 10,
              background: 'var(--bg2)',
              border: '1px solid var(--rule)',
              borderLeft: '2px solid var(--amber)',
              position: 'relative',
              animation: 'pipelineFadeIn 0.25s ease-out',
            }}
          >
            <div
              className="mono"
              style={{
                padding: '6px 10px 4px',
                fontSize: 9,
                color: 'var(--amber)',
                letterSpacing: 1.2,
                background: 'rgba(232,162,76,0.06)',
                borderBottom: '1px dashed var(--rule)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>
                ◈ № {String(i + 1).padStart(2, '0')} · {p.markedAt}
              </span>
              <button
                onClick={() => onRemove(p.id)}
                style={{ color: 'var(--ink3)', fontSize: 10 }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '10px 12px 8px' }}>
              <div
                className="serif"
                style={{
                  fontSize: 13,
                  color: 'var(--ink)',
                  fontWeight: 500,
                  lineHeight: 1.35,
                  letterSpacing: -0.1,
                }}
              >
                {p.text}
              </div>
              {p.excerpts.length > 0 && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--ink2)',
                    lineHeight: 1.5,
                    marginTop: 6,
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {p.excerpts.join('\n\n')}
                </div>
              )}
            </div>
            <div
              style={{
                padding: '6px 10px',
                borderTop: '1px dashed var(--rule)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(0,0,0,0.15)',
              }}
            >
              {p.suggestedSection && (
                <span
                  className="mono"
                  style={{
                    fontSize: 9,
                    color: 'var(--teal)',
                    letterSpacing: 0.3,
                    border: '1px solid var(--teal)',
                    opacity: 0.8,
                    padding: '1px 5px',
                  }}
                >
                  § {p.suggestedSection}
                </span>
              )}
              <button
                onClick={() => onJumpTo(p.fromNode)}
                className="mono"
                style={{ fontSize: 9, color: 'var(--ink3)', letterSpacing: 0.3 }}
              >
                ↳ 跳至 {p.fromNode}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: '12px 12px 14px',
          borderTop: '1px solid var(--rule)',
          background: 'var(--bg2)',
        }}
      >
        <button
          onClick={() => setShowReview(true)}
          disabled={points.length === 0}
          className="mono"
          style={{
            width: '100%',
            padding: '10px 12px',
            background: points.length ? 'var(--amber)' : 'var(--bg2)',
            color: points.length ? 'var(--bg)' : 'var(--ink4)',
            border:
              '1px solid ' + (points.length ? 'var(--amber)' : 'var(--rule)'),
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.5,
            cursor: points.length ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>整理 → 存入 Wiki</span>
          <span>→</span>
        </button>
        <div
          className="mono"
          style={{
            fontSize: 9,
            color: 'var(--ink3)',
            marginTop: 6,
            textAlign: 'center',
          }}
        >
          AI 会把要点预合成为词条草稿
        </div>
      </div>
    </aside>
  );
}

/* ──────────────────────────────────────────────────────────
   ReviewSheet — 手动分组 + 存入 Wiki（无 AI 参与）
   打开时按 suggestedSection groupBy 初始化分段；用户可编辑 heading、
   新增空段、删除段（内部要点回流未分组）、把要点在段间移动
   ────────────────────────────────────────────────────────── */

type ReviewMode = 'new' | 'append';

interface DraftSection {
  id: string;
  heading: string;
  sedimentIds: string[];
}

interface WikiCategoryMeta { id: string; name: string }
interface WikiItemMeta { id: string; name: string; categoryId: string }

const UNASSIGNED_ID = '__unassigned__';

// 按 suggestedSection 自动分组，无提示的进未分组
function initSections(sediment: SedimentPoint[]): { sections: DraftSection[]; unassigned: string[] } {
  const map = new Map<string, string[]>();
  const unassigned: string[] = [];
  for (const s of sediment) {
    const key = s.suggestedSection?.trim();
    if (!key || key === '新要点') {
      unassigned.push(s.id);
      continue;
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s.id);
  }
  let n = 0;
  const sections: DraftSection[] = [];
  for (const [heading, ids] of map) {
    sections.push({ id: `sec-${++n}`, heading, sedimentIds: ids });
  }
  return { sections, unassigned };
}

function ReviewSheet({
  session,
  onClose,
  onSaved,
}: {
  session: PipelineSession;
  onClose: () => void;
  onSaved: (itemId: string) => void;
}) {
  const [mode, setMode] = useState<ReviewMode>('new');
  const [appendToItemId, setAppendToItemId] = useState<string>('');
  // 取首个 parse 节点标题作为默认条目名；兼容老数据的 entrySnapshot
  const defaultName =
    session.nodes.find(n => n.type === 'parse' && n.parseEntry?.title)?.parseEntry?.title ||
    session.entrySnapshot?.title ||
    '未命名条目';
  const [name, setName] = useState(defaultName);
  const [categoryId, setCategoryId] = useState<string>('');
  const [catNewName, setCatNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [wikiCats, setWikiCats] = useState<WikiCategoryMeta[]>([]);
  const [wikiItems, setWikiItems] = useState<WikiItemMeta[]>([]);

  const initial = useMemo(() => initSections(session.sediment), [session.sediment]);
  const [sections, setSections] = useState<DraftSection[]>(initial.sections);
  const [unassigned, setUnassigned] = useState<string[]>(initial.unassigned);

  // 拉取 Wiki 索引（分类+条目）用于下拉
  useEffect(() => {
    let cancelled = false;
    fetch('/api/wiki')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setWikiCats(data.categories || []);
        setWikiItems(data.items || []);
      })
      .catch(() => { /* */ });
    return () => { cancelled = true; };
  }, []);

  const sedimentById = useMemo(
    () => new Map(session.sediment.map(s => [s.id, s])),
    [session.sediment],
  );

  // 段落操作
  const updateSectionHeading = (id: string, heading: string) => {
    setSections(prev => prev.map(s => (s.id === id ? { ...s, heading } : s)));
  };
  const addSection = () => {
    setSections(prev => [
      ...prev,
      { id: `sec-${Date.now()}`, heading: '新段落', sedimentIds: [] },
    ]);
  };
  const removeSection = (id: string) => {
    setSections(prev => {
      const target = prev.find(s => s.id === id);
      if (target && target.sedimentIds.length > 0) {
        setUnassigned(u => [...u, ...target.sedimentIds]);
      }
      return prev.filter(s => s.id !== id);
    });
  };
  // 把 sediment 从当前位置移到目标（UNASSIGNED_ID 表示移回未分组）
  const moveSediment = (sid: string, targetId: string) => {
    setSections(prev =>
      prev.map(s => ({ ...s, sedimentIds: s.sedimentIds.filter(x => x !== sid) })),
    );
    setUnassigned(prev => prev.filter(x => x !== sid));
    if (targetId === UNASSIGNED_ID) {
      setUnassigned(prev => [...prev, sid]);
    } else {
      setSections(prev =>
        prev.map(s =>
          s.id === targetId ? { ...s, sedimentIds: [...s.sedimentIds, sid] } : s,
        ),
      );
    }
  };

  // 保存：发送 PipelineDraft 到 save 路由（后端按 sedimentIds 无损拼原文）
  const save = async () => {
    if (!name.trim()) { setErrMsg('条目名称不能为空'); return; }
    const newCategoryName = catNewName.trim();
    if (!categoryId && !newCategoryName) { setErrMsg('请选择或新建分类'); return; }
    if (mode === 'append' && !appendToItemId) { setErrMsg('请选择追加目标条目'); return; }

    setSaving(true);
    setErrMsg(null);
    try {
      const nonEmpty = sections.filter(s => s.sedimentIds.length > 0);
      const payload = {
        name: name.trim(),
        categoryId: categoryId || '',
        newCategory: newCategoryName ? { name: newCategoryName } : null,
        appendToItemId: mode === 'append' ? appendToItemId : undefined,
        sections: nonEmpty.map(s => ({
          heading: s.heading.trim() || '未命名段落',
          sedimentIds: s.sedimentIds,
        })),
        sourceLinks: session.nodes
          .filter(n => n.type === 'parse' && n.parseEntry?.url)
          .map(n => ({
            url: n.parseEntry!.url,
            title: n.parseEntry!.title || n.parseEntry!.url,
            type: 'original' as const,
          }))
          .concat(
            session.entrySnapshot?.url
              ? [{
                  url: session.entrySnapshot.url,
                  title: session.entrySnapshot.title,
                  type: 'original' as const,
                }]
              : [],
          ),
      };
      const res = await fetch(`/api/pipeline/${session.id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '保存失败');
      onSaved(json.itemId);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // 构造「移到...」下拉的选项
  const moveOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = sections.map(s => ({
      value: s.id,
      label: `§ ${s.heading || '未命名段落'}`,
    }));
    opts.push({ value: UNASSIGNED_ID, label: '○ 未分组' });
    return opts;
  }, [sections]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        background: 'rgba(20,17,13,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'pipelineFadeIn 0.2s',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 880,
          maxWidth: '94vw',
          maxHeight: '90vh',
          background: 'var(--panel)',
          border: '1px solid var(--amber)',
          boxShadow: '0 0 0 1px var(--bg), 8px 8px 0 rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--rule)',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            background: 'rgba(232,162,76,0.06)',
          }}
        >
          <div>
            <div
              className="mono"
              style={{ fontSize: 10, color: 'var(--amber)', letterSpacing: 1.4, textTransform: 'uppercase' }}
            >
              § 整理 · 手动分组 & 存入
            </div>
            <div
              className="serif"
              style={{ fontSize: 20, color: 'var(--ink)', fontWeight: 500, marginTop: 4, letterSpacing: -0.3 }}
            >
              手动分组 · 原文无损存入 Wiki
            </div>
          </div>
          <button onClick={onClose} className="mono" style={{ fontSize: 14, color: 'var(--ink3)' }}>
            × 关闭
          </button>
        </div>

        {/* mode tabs */}
        <div
          style={{
            padding: '16px 20px 0',
            display: 'flex',
            gap: 0,
            borderBottom: '1px solid var(--rule)',
          }}
        >
          {(['new', 'append'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="mono"
              style={{
                padding: '10px 16px',
                fontSize: 11,
                letterSpacing: 0.5,
                color: mode === m ? 'var(--amber)' : 'var(--ink3)',
                borderBottom: mode === m ? '2px solid var(--amber)' : '2px solid transparent',
              }}
            >
              {m === 'new' ? '新建词条' : '追加到现有词条'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 22px' }}>
          {/* 空态 */}
          {session.sediment.length === 0 && (
            <div
              className="mono"
              style={{
                padding: 24,
                fontSize: 11,
                color: 'var(--ink3)',
                border: '1px dashed var(--rule)',
                textAlign: 'center',
              }}
            >
              沉淀区为空，请先在画布上标记要点
            </div>
          )}

          {session.sediment.length > 0 && (
            <>
              {/* 追加模式：目标条目选择 */}
              {mode === 'append' && (
                <div style={{ marginBottom: 16 }}>
                  <div
                    className="mono"
                    style={{ fontSize: 9, color: 'var(--ink3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}
                  >
                    追加到条目
                  </div>
                  <select
                    value={appendToItemId}
                    onChange={e => setAppendToItemId(e.target.value)}
                    className="mono"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      fontSize: 12,
                      background: 'var(--bg2)',
                      border: '1px solid var(--rule)',
                      color: 'var(--ink)',
                      outline: 'none',
                    }}
                  >
                    <option value="">— 选择目标 —</option>
                    {wikiItems.map(it => (
                      <option key={it.id} value={it.id}>
                        {it.name}（{it.categoryId}）
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 条目名 + 分类 */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 2 }}>
                  <div
                    className="mono"
                    style={{ fontSize: 9, color: 'var(--ink3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}
                  >
                    条目名称
                  </div>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="serif"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      fontSize: 15,
                      fontWeight: 500,
                      background: 'var(--bg2)',
                      border: '1px solid var(--rule)',
                      color: 'var(--ink)',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    className="mono"
                    style={{ fontSize: 9, color: 'var(--ink3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}
                  >
                    分类
                  </div>
                  <select
                    value={categoryId}
                    onChange={e => {
                      setCategoryId(e.target.value);
                      if (e.target.value) setCatNewName('');
                    }}
                    className="mono"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      fontSize: 12,
                      background: 'var(--bg2)',
                      border: '1px solid var(--rule)',
                      color: 'var(--ink)',
                      outline: 'none',
                    }}
                  >
                    <option value="">— 未选 —</option>
                    {wikiCats.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <input
                    value={catNewName}
                    onChange={e => {
                      setCatNewName(e.target.value);
                      if (e.target.value) setCategoryId('');
                    }}
                    placeholder="或新建分类名"
                    className="mono"
                    style={{
                      width: '100%',
                      marginTop: 6,
                      padding: '6px 10px',
                      fontSize: 11,
                      background: 'var(--bg2)',
                      border: '1px dashed var(--rule)',
                      color: 'var(--ink2)',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* 段落列表 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <div
                  className="mono"
                  style={{ fontSize: 9, color: 'var(--red)', letterSpacing: 1.2, textTransform: 'uppercase' }}
                >
                  ─ 分组（按 suggestedSection 初始化 · 可手动调整）
                </div>
                <button
                  onClick={addSection}
                  className="mono"
                  style={{
                    fontSize: 10,
                    color: 'var(--amber)',
                    border: '1px solid var(--amber)',
                    padding: '3px 10px',
                    letterSpacing: 0.3,
                  }}
                >
                  ＋ 新段落
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {sections.map((sec, i) => (
                  <div
                    key={sec.id}
                    style={{
                      padding: '12px 14px',
                      background: 'var(--bg2)',
                      border: '1px solid var(--rule)',
                      borderLeft: '2px solid var(--amber)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span
                        className="mono"
                        style={{ fontSize: 9, color: 'var(--amber)', letterSpacing: 0.5 }}
                      >
                        § {i + 1}
                      </span>
                      <input
                        value={sec.heading}
                        onChange={e => updateSectionHeading(sec.id, e.target.value)}
                        className="serif"
                        style={{
                          flex: 1,
                          padding: '4px 6px',
                          fontSize: 14,
                          fontWeight: 500,
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px dashed var(--rule)',
                          color: 'var(--ink)',
                          outline: 'none',
                        }}
                      />
                      <span
                        className="mono"
                        style={{ fontSize: 9, color: 'var(--ink3)' }}
                      >
                        {sec.sedimentIds.length} 要点
                      </span>
                      <button
                        onClick={() => removeSection(sec.id)}
                        className="mono"
                        style={{
                          fontSize: 10,
                          color: 'var(--ink3)',
                          letterSpacing: 0.3,
                        }}
                      >
                        × 删段
                      </button>
                    </div>
                    {sec.sedimentIds.length === 0 ? (
                      <div
                        className="mono"
                        style={{
                          padding: 10,
                          fontSize: 10,
                          color: 'var(--ink3)',
                          textAlign: 'center',
                          border: '1px dashed var(--rule)',
                        }}
                      >
                        空段 · 从未分组或其他段「移到此段」
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {sec.sedimentIds.map(sid => {
                          const s = sedimentById.get(sid);
                          if (!s) return null;
                          const opts = moveOptions.filter(o => o.value !== sec.id);
                          return (
                            <SedimentRow
                              key={sid}
                              point={s}
                              moveOptions={opts}
                              onMove={target => moveSediment(sid, target)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                {sections.length === 0 && (
                  <div
                    className="mono"
                    style={{
                      padding: 16,
                      fontSize: 11,
                      color: 'var(--ink3)',
                      textAlign: 'center',
                      border: '1px dashed var(--rule)',
                    }}
                  >
                    暂无段落 · 点「＋ 新段落」开始分组
                  </div>
                )}
              </div>

              {/* 未分组 */}
              {unassigned.length > 0 && (
                <div
                  style={{
                    marginTop: 14,
                    padding: '12px 14px',
                    background: 'var(--bg2)',
                    border: '1px dashed var(--red)',
                  }}
                >
                  <div
                    className="mono"
                    style={{
                      fontSize: 9,
                      color: 'var(--red)',
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      marginBottom: 8,
                    }}
                  >
                    ○ 未分组 {unassigned.length} 要点 · 保存时自动塞入「其他」段
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {unassigned.map(sid => {
                      const s = sedimentById.get(sid);
                      if (!s) return null;
                      const opts = moveOptions.filter(o => o.value !== UNASSIGNED_ID);
                      return (
                        <SedimentRow
                          key={sid}
                          point={s}
                          moveOptions={opts}
                          onMove={target => moveSediment(sid, target)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {errMsg && (
            <div
              className="mono"
              style={{
                marginTop: 14,
                padding: '10px',
                fontSize: 10,
                color: 'var(--red)',
                border: '1px solid var(--red)',
                background: 'var(--red-soft)',
              }}
            >
              {errMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--rule)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg2)',
          }}
        >
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink3)' }}>
            {session.sediment.length} 要点 · {session.nodes.filter(n => n.state === 'done').length} 回答 · session#{session.id.slice(0, 8)}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              className="mono tool-btn"
              style={{ padding: '8px 14px', fontSize: 11 }}
            >
              再想想
            </button>
            <button
              onClick={save}
              disabled={
                saving || session.sediment.length === 0 ||
                (mode === 'append' && !appendToItemId)
              }
              className="mono"
              style={{
                padding: '8px 18px',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.5,
                background: saving || session.sediment.length === 0 || (mode === 'append' && !appendToItemId)
                  ? 'var(--bg2)' : 'var(--amber)',
                color: saving || session.sediment.length === 0 || (mode === 'append' && !appendToItemId)
                  ? 'var(--ink4)' : 'var(--bg)',
                border: '1px solid var(--amber)',
                cursor: saving || session.sediment.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? '保存中…' : mode === 'append' ? '追加到词条 →' : '创建词条 →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ReviewSheet 子组件：单个 sediment 行（标题 + 来源 + 展开原文 + 移到...下拉）
function SedimentRow({
  point,
  moveOptions,
  onMove,
}: {
  point: SedimentPoint;
  moveOptions?: { value: string; label: string }[];
  onMove?: (targetId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const body = point.excerpts.join('\n\n');
  return (
    <div style={{ borderLeft: '1px dashed var(--rule)', paddingLeft: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          className="mono"
          style={{
            fontSize: 9,
            color: 'var(--teal)',
            letterSpacing: 0.3,
            border: '1px solid var(--teal)',
            padding: '1px 5px',
            opacity: 0.85,
          }}
        >
          {point.mode === 'full' ? 'full' : 'custom'}
        </span>
        <span
          className="serif"
          style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 500, flex: 1, minWidth: 120 }}
        >
          {point.text}
        </span>
        <span className="mono" style={{ fontSize: 9, color: 'var(--ink3)' }}>
          Q{point.fromNode} · {point.markedAt}
        </span>
        {moveOptions && onMove && (
          <select
            value=""
            onChange={e => {
              const v = e.target.value;
              if (v) onMove(v);
            }}
            className="mono"
            style={{
              fontSize: 9,
              padding: '2px 4px',
              background: 'transparent',
              color: 'var(--ink3)',
              border: '1px solid var(--rule)',
              outline: 'none',
            }}
          >
            <option value="">移到…</option>
            {moveOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
        <button
          onClick={() => setExpanded(v => !v)}
          className="mono"
          style={{ fontSize: 9, color: 'var(--ink3)' }}
        >
          {expanded ? '收起' : '展开原文'}
        </button>
      </div>
      {expanded && (
        <div
          style={{
            marginTop: 6,
            padding: '6px 10px',
            fontSize: 11,
            lineHeight: 1.6,
            color: 'var(--ink2)',
            background: 'var(--bg)',
            border: '1px solid var(--rule)',
            whiteSpace: 'pre-wrap',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {body}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   AskSheet — 对话弹窗：展示分支问答链 + 就地追问
   ────────────────────────────────────────────────────────── */
interface AskTarget {
  // 挂在哪个节点下追问；null = 作为画布新根
  parentId: string | null;
  // 仅在以某个节点为"焦点"查看对话时显示链路用
  focusId?: string | null;
}

function AskSheet({
  session,
  target,
  streamingNodeId,
  toolStatus,
  canAsk,
  onAsk,
  onMark,
  onUnmark,
  onClose,
}: {
  session: PipelineSession;
  target: AskTarget;
  streamingNodeId: string | null;
  toolStatus: string | null;
  canAsk: boolean;
  onAsk: (question: string, parentId: string | null, opts: { isBranch: boolean; branchLabel?: string }) => void;
  onMark: (nodeId: string) => void;
  onUnmark: (nodeId: string) => void;
  onClose: () => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const [isBranch, setIsBranch] = useState(false);
  const [branchLabel, setBranchLabel] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // 链路锚点：
  //  - 双击打开：锚点 = 被双击节点（target.focusId）
  //  - 底部按钮打开：初始无锚点，首次提交后自动抓挂在 target.parentId 下新创建的问题
  // 用 mount 时的节点数快照限定"新创建"的范围，确保多次打开弹窗互不污染。
  const [snapshotLen] = useState(() => session.nodes.length);
  const threadHead = useMemo<string | null>(() => {
    if (target.focusId) return target.focusId;
    for (let i = session.nodes.length - 1; i >= snapshotLen; i--) {
      const n = session.nodes[i];
      if (n.type === 'question' && n.parent === target.parentId) return n.id;
    }
    return null;
  }, [target.focusId, target.parentId, session.nodes, snapshotLen]);

  // 从 threadHead 构造链路：祖先 + 后代（沿最新子节点一路到叶子）
  // 交给 react-compiler 自动 memoize。
  const chain: PipelineNode[] = (() => {
    if (!threadHead) return [];
    const byId = new Map(session.nodes.map(n => [n.id, n]));

    // ① ancestors：从 threadHead 往根
    const ancestors: PipelineNode[] = [];
    {
      let cursor: string | null = threadHead;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        const n = byId.get(cursor);
        if (!n) break;
        ancestors.unshift(n);
        cursor = n.parent;
      }
    }

    // ② descendants：从 threadHead 沿最新子节点往下
    const descendants: PipelineNode[] = [];
    {
      let pid: string | null = threadHead;
      const seen = new Set<string>();
      while (pid && !seen.has(pid)) {
        seen.add(pid);
        const children = session.nodes.filter(n => n.parent === pid);
        if (children.length === 0) break;
        const latest = children[children.length - 1];
        descendants.push(latest);
        pid = latest.id;
      }
    }

    return [...ancestors, ...descendants];
  })();

  const displayNodes = chain;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [displayNodes.length, streamingNodeId]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = inputValue.trim();
    if (!q || !canAsk) return;
    const leaf = chain.length ? chain[chain.length - 1].id : null;
    // 继续追问：挂在链条末尾；派生分支：回到 threadHead（或 target.parentId）派生
    const parent = isBranch ? (threadHead ?? target.parentId) : (leaf ?? target.parentId);
    onAsk(q, parent, {
      isBranch,
      branchLabel: isBranch && branchLabel.trim() ? branchLabel.trim() : undefined,
    });
    setInputValue('');
    setBranchLabel('');
  };

  const headLabel = threadHead
    ? `锚定 ${threadHead}`
    : session.nodes.length === 0
      ? '开启第一条链'
      : '新主干';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 25,
        background: 'rgba(20,17,13,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'pipelineFadeIn 0.2s',
      }}
    >
      <div
        className="pipeline-deep"
        onClick={e => e.stopPropagation()}
        style={{
          width: 760,
          maxWidth: '92vw',
          height: '82vh',
          maxHeight: 720,
          background: 'var(--panel)',
          border: '1px solid var(--amber)',
          boxShadow: '0 0 0 1px var(--bg), 8px 8px 0 rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 18px',
            borderBottom: '1px solid var(--rule)',
            background: 'rgba(232,162,76,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: 'var(--amber)',
                letterSpacing: 1.4,
                textTransform: 'uppercase',
              }}
            >
              {isBranch ? '⎇ 派生分支' : '→ 对话追问'}
            </span>
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: 'var(--ink3)',
                letterSpacing: 0.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {headLabel} · {displayNodes.length} 轮
            </span>
          </div>
          <button
            onClick={onClose}
            className="mono"
            style={{ fontSize: 12, color: 'var(--ink3)', letterSpacing: 0.3 }}
          >
            × 关闭
          </button>
        </div>

        {/* Conversation chain */}
        <div
          className="scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px 22px',
            background: 'var(--bg)',
          }}
        >
          {displayNodes.length === 0 && (
            <div
              className="mono"
              style={{
                fontSize: 11,
                color: 'var(--ink3)',
                textAlign: 'center',
                padding: 40,
                border: '1px dashed var(--rule)',
                lineHeight: 1.8,
              }}
            >
              这是一个新分支起点
              <br />
              <span style={{ color: 'var(--ink4)' }}>
                在下方输入问题，agent 会在此分支上回答
              </span>
            </div>
          )}

          {displayNodes.map(n => {
            const isQ = n.type === 'question';
            const isNodeStreaming = streamingNodeId === n.id;
            return (
              <div
                key={n.id}
                style={{
                  marginBottom: 18,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 9,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    color: isQ ? 'var(--amber)' : 'var(--ink3)',
                    fontWeight: isQ ? 600 : 400,
                    flexShrink: 0,
                    width: 56,
                    paddingTop: 2,
                  }}
                >
                  {isQ ? '→ 你问' : '← agent'}
                  <div style={{ color: 'var(--ink4)', marginTop: 2 }}>
                    {n.id}
                  </div>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className={isQ ? 'serif' : undefined}
                    style={{
                      fontSize: isQ ? 14 : 13,
                      lineHeight: 1.65,
                      color: isQ ? 'var(--ink)' : 'var(--ink2)',
                      fontWeight: isQ ? 500 : 400,
                      letterSpacing: isQ ? -0.1 : 0,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {n.text ? (
                      isQ ? n.text : <Narrative text={n.text} />
                    ) : (
                      <span className="mono" style={{ color: 'var(--ink4)', fontSize: 11 }}>
                        {isNodeStreaming ? '正在生成…' : '（空）'}
                      </span>
                    )}
                  </div>
                  {isNodeStreaming && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        marginTop: 6,
                      }}
                    >
                      {[0, 1, 2].map(i => (
                        <span
                          key={i}
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: '50%',
                            background: 'var(--red)',
                            animation: `pipelineTypingDot 1s infinite ${i * 0.15}s`,
                          }}
                        />
                      ))}
                      {toolStatus && (
                        <span
                          className="mono"
                          style={{
                            fontSize: 9,
                            color: 'var(--red)',
                            marginLeft: 4,
                          }}
                        >
                          {toolStatus}
                        </span>
                      )}
                    </div>
                  )}
                  {!isQ && n.state === 'done' && (
                    <div
                      style={{
                        marginTop: 8,
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <span
                        className="mono"
                        style={{ fontSize: 9, color: 'var(--ink3)' }}
                      >
                        {n.duration ?? ''}
                        {n.duration && n.tokens ? ' · ' : ''}
                        {n.tokens ? `${n.tokens} tok` : ''}
                      </span>
                      <span style={{ flex: 1 }} />
                      {!n.marked ? (
                        <button
                          onClick={() => onMark(n.id)}
                          className="mono"
                          style={{
                            fontSize: 10,
                            color: 'var(--amber)',
                            border: '1px solid var(--amber)',
                            padding: '2px 8px',
                            letterSpacing: 0.3,
                          }}
                        >
                          ◈ 标为要点
                        </button>
                      ) : (
                        <button
                          onClick={() => onUnmark(n.id)}
                          className="mono"
                          style={{
                            fontSize: 10,
                            color: 'var(--bg)',
                            background: 'var(--amber)',
                            padding: '2px 8px',
                            letterSpacing: 0.3,
                            fontWeight: 600,
                          }}
                        >
                          ✓ 已标记
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Ask input */}
        <form
          onSubmit={onSubmit}
          style={{
            padding: '12px 18px 14px',
            borderTop: '1px solid var(--rule)',
            background: 'var(--bg2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flexShrink: 0,
          }}
        >
          {/* Branch toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={() => setIsBranch(false)}
              className="mono"
              style={{
                fontSize: 10,
                padding: '3px 8px',
                border: '1px solid ' + (!isBranch ? 'var(--amber)' : 'var(--rule)'),
                color: !isBranch ? 'var(--amber)' : 'var(--ink3)',
                background: !isBranch ? 'var(--amber-soft)' : 'transparent',
                letterSpacing: 0.3,
              }}
            >
              → 继续追问
            </button>
            <button
              type="button"
              onClick={() => setIsBranch(true)}
              className="mono"
              style={{
                fontSize: 10,
                padding: '3px 8px',
                border: '1px solid ' + (isBranch ? 'var(--branch)' : 'var(--rule)'),
                color: isBranch ? 'var(--branch)' : 'var(--ink3)',
                background: isBranch ? 'rgba(184,132,217,0.1)' : 'transparent',
                letterSpacing: 0.3,
              }}
            >
              ⎇ 派生分支
            </button>
            {isBranch && (
              <input
                value={branchLabel}
                onChange={e => setBranchLabel(e.target.value)}
                placeholder="分支标签（可选）"
                className="mono"
                style={{
                  flex: 1,
                  fontSize: 10,
                  padding: '3px 8px',
                  background: 'var(--bg)',
                  border: '1px solid var(--branch)',
                  color: 'var(--ink2)',
                  outline: 'none',
                }}
              />
            )}
            <span style={{ flex: isBranch ? 0 : 1 }} />
            <span
              className="mono"
              style={{
                fontSize: 9,
                color: canAsk ? 'var(--ink3)' : 'var(--red)',
                letterSpacing: 0.3,
              }}
            >
              {canAsk ? 'ready' : '● 生成中'}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              border: '1px solid var(--rule)',
              background: 'var(--bg)',
              padding: '8px 12px',
            }}
          >
            <span
              className="mono"
              style={{
                color: canAsk ? 'var(--amber)' : 'var(--ink4)',
                fontSize: 12,
              }}
            >
              {canAsk ? '>' : '…'}
            </span>
            <input
              autoFocus
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder={
                canAsk
                  ? isBranch
                    ? '派生一个新分支，问一个细化问题...'
                    : '继续追问...'
                  : '生成中，请稍候...'
              }
              disabled={!canAsk}
              className="mono"
              style={{
                flex: 1,
                fontSize: 13,
                color: 'var(--ink)',
                background: 'transparent',
                border: 'none',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || !canAsk}
              className="mono"
              style={{
                color:
                  inputValue.trim() && canAsk ? 'var(--amber)' : 'var(--ink4)',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: 0.5,
                cursor: inputValue.trim() && canAsk ? 'pointer' : 'not-allowed',
              }}
            >
              ⌘↵ 发送
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Main PipelineView
   ────────────────────────────────────────────────────────── */
export function PipelineView({ pipeline, onExit }: Props) {
  const session = pipeline.session;
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [askTarget, setAskTarget] = useState<AskTarget | null>(null);
  const [markTarget, setMarkTarget] = useState<string | null>(null);
  const [parseTarget, setParseTarget] = useState<string | null>(null);

  // 首次 mount：确保存在 session + 至少一张 input 节点
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await pipeline.ensureSession();
      if (cancelled) return;
      if (s && s.nodes.length === 0) {
        await pipeline.addInputFlow();
      }
    })();
    return () => {
      cancelled = true;
    };
    // 只在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!session) {
    return (
      <div
        className="pipeline-deep"
        style={{
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--ink3)',
        }}
      >
        <div className="mono" style={{ fontSize: 12, letterSpacing: 1 }}>
          正在初始化画布…
        </div>
      </div>
    );
  }

  const canAsk = pipeline.streamingNodeId === null;

  // 打开交互：
  // - input 节点：双击不做事（直接在卡内编辑）
  // - parse 节点：弹窗显示完整解析（含深入追问入口）
  // - question/answer 节点：弹窗显示对话链
  const openSheet = (nodeId: string | null) => {
    if (!nodeId) {
      setAskTarget({ parentId: null, focusId: null });
      return;
    }
    const n = session.nodes.find(x => x.id === nodeId);
    if (!n) return;
    if (n.type === 'input') return;
    if (n.type === 'parse') {
      setParseTarget(nodeId);
      return;
    }
    setAskTarget({ parentId: nodeId, focusId: nodeId });
  };

  const onSheetAsk = (
    question: string,
    parentId: string | null,
    opts: { isBranch: boolean; branchLabel?: string },
  ) => {
    pipeline.ask(question, parentId, opts);
  };

  return (
    <div
      className="pipeline-deep"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <TopBar
        session={session}
        onExit={onExit}
        onOpenReview={() => setShowReview(true)}
        onNewFlow={() => pipeline.addInputFlow()}
        model={pipeline.model}
        onModelChange={pipeline.setModel}
      />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            position: 'relative',
          }}
        >
          <Canvas
            nodes={session.nodes}
            streamingNodeId={pipeline.streamingNodeId}
            toolStatus={pipeline.toolStatus}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
            onMark={(id: string) => setMarkTarget(id)}
            onUnmark={pipeline.unmarkNode}
            onOpen={nodeId => openSheet(nodeId)}
            onSubmitInput={(id, urls) => pipeline.submitInput(id, urls)}
          />
        </div>
        <SedimentTray
          points={session.sediment}
          onJumpTo={nodeId => {
            setSelectedNode(nodeId);
            openSheet(nodeId);
          }}
          onRemove={pipeline.removeSediment}
          setShowReview={setShowReview}
        />
      </div>

      {parseTarget && (
        <ParseDetailSheet
          session={session}
          nodeId={parseTarget}
          onClose={() => setParseTarget(null)}
          onDeepDive={nodeId => {
            setParseTarget(null);
            setAskTarget({ parentId: nodeId, focusId: nodeId });
          }}
        />
      )}

      {askTarget && (
        <AskSheet
          session={session}
          target={askTarget}
          streamingNodeId={pipeline.streamingNodeId}
          toolStatus={pipeline.toolStatus}
          canAsk={canAsk}
          onAsk={onSheetAsk}
          onMark={pipeline.markNode}
          onUnmark={pipeline.unmarkNode}
          onClose={() => setAskTarget(null)}
        />
      )}

      {showReview && (
        <ReviewSheet
          session={session}
          onClose={() => setShowReview(false)}
          onSaved={() => {
            setShowReview(false);
          }}
        />
      )}

      {markTarget && (
        <MarkSheet
          session={session}
          nodeId={markTarget}
          onConfirm={(options) => {
            pipeline.markNode(markTarget, options);
            setMarkTarget(null);
          }}
          onClose={() => setMarkTarget(null)}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   ParseDetailSheet — 解析详情弹窗
   ────────────────────────────────────────────────────────── */
function ParseDetailSheet({
  session,
  nodeId,
  onClose,
  onDeepDive,
}: {
  session: PipelineSession;
  nodeId: string;
  onClose: () => void;
  onDeepDive: (nodeId: string) => void;
}) {
  const node = session.nodes.find(n => n.id === nodeId);
  const p = node?.parseEntry;

  if (!node || !p) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 25,
        background: 'rgba(20,17,13,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'pipelineFadeIn 0.2s',
      }}
    >
      <div
        className="pipeline-deep"
        onClick={e => e.stopPropagation()}
        style={{
          width: 820,
          maxWidth: '94vw',
          height: '84vh',
          maxHeight: 760,
          background: 'var(--panel)',
          border: '1px solid var(--red)',
          boxShadow: '0 0 0 1px var(--bg), 8px 8px 0 rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--rule)',
            background: 'rgba(201,74,26,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 10,
              color: 'var(--red)',
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              border: '1px solid var(--red)',
              padding: '2px 6px',
            }}
          >
            ◎ 解析详情
          </span>
          <span
            className="mono"
            style={{
              fontSize: 10,
              color: 'var(--ink3)',
              letterSpacing: 0.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {p.url}
          </span>
          <button
            onClick={onClose}
            className="mono"
            style={{ fontSize: 12, color: 'var(--ink3)', letterSpacing: 0.3 }}
          >
            × 关闭
          </button>
        </div>

        {/* Body */}
        <div
          className="scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '22px 26px',
            background: 'var(--bg)',
          }}
        >
          <h2
            className="serif"
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: 'var(--ink)',
              letterSpacing: -0.4,
              lineHeight: 1.3,
              marginBottom: 12,
            }}
          >
            {p.title}
          </h2>

          {p.concepts && p.concepts.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div
                className="mono"
                style={{
                  fontSize: 9,
                  color: 'var(--red)',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                ※ 识别到的技术
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {p.concepts.map((c, i) => (
                  <span
                    key={i}
                    className="mono"
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      border: `1px solid ${c.role === 'subject' ? 'var(--red)' : 'var(--ink4)'}`,
                      color: c.role === 'subject' ? 'var(--red)' : 'var(--ink2)',
                      background: c.role === 'subject' ? 'rgba(201,74,26,0.06)' : 'transparent',
                      letterSpacing: 0.3,
                    }}
                  >
                    {c.role === 'subject' ? '◆ ' : ''}{c.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {p.narrative && (
            <div style={{ marginBottom: 22 }}>
              <div
                className="mono"
                style={{
                  fontSize: 9,
                  color: 'var(--ink3)',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                ── 解析叙述
              </div>
              {p.narrative.split(/\n\n+/).map((para, i) => (
                <p key={i} style={{ marginBottom: 14 }}>
                  <Narrative text={para} size="large" />
                </p>
              ))}
            </div>
          )}

          {p.sources && p.sources.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div
                className="mono"
                style={{
                  fontSize: 9,
                  color: 'var(--ink3)',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                ── 溯源
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {p.sources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: 'var(--ink2)',
                      textDecoration: 'none',
                      borderBottom: '1px dashed var(--rule)',
                      padding: '4px 0',
                    }}
                  >
                    <span style={{ color: 'var(--ink4)' }}>[{s.type}]</span>{' '}
                    {s.title || s.url}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--rule)',
            background: 'var(--bg2)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}
        >
          <span
            className="mono"
            style={{ fontSize: 10, color: 'var(--ink3)', letterSpacing: 0.3, flex: 1 }}
          >
            节点 {node.id} · 深入追问将以该解析为上下文派生新问题
          </span>
          <button
            onClick={() => onDeepDive(node.id)}
            className="mono"
            style={{
              padding: '8px 18px',
              fontSize: 12,
              letterSpacing: 0.5,
              fontWeight: 600,
              background: 'var(--amber)',
              color: 'var(--bg)',
              border: '1px solid var(--amber)',
              boxShadow: '3px 3px 0 rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>深入追问</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   MarkSheet — 标记弹框：默认全量 Q+A；可切自定义模式选多段摘录
   ────────────────────────────────────────────────────────── */
function MarkSheet({
  session,
  nodeId,
  onConfirm,
  onClose,
}: {
  session: PipelineSession;
  nodeId: string;
  onConfirm: (options: {
    text: string;
    mode: SedimentMode;
    excerpts: string[];
    suggestedSection?: string;
  }) => void;
  onClose: () => void;
}) {
  const node = session.nodes.find(n => n.id === nodeId);

  const paired = useMemo(() => {
    if (!node) return null;
    return node.type === 'answer'
      ? session.nodes.find(n => n.id === node.parent && n.type === 'question')
      : session.nodes.find(n => n.parent === node.id && n.type === 'answer');
  }, [node, session.nodes]);

  const fullText = useMemo(() => {
    if (!node) return '';
    if (!paired) return node.text;
    return node.type === 'answer'
      ? `${paired.text}\n\n${node.text}`
      : `${node.text}\n\n${paired.text}`;
  }, [node, paired]);

  const defaultTitle = node?.markedAs || node?.text.split('\n')[0].slice(0, 60) || '新要点';

  const [mode, setMode] = useState<SedimentMode>('full');
  const [title, setTitle] = useState(defaultTitle);
  const [suggestedSection, setSuggestedSection] = useState('新要点');
  const [customExcerpts, setCustomExcerpts] = useState<string[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);

  const addSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text) return;
    const anchor = sel.anchorNode;
    if (!anchor || !previewRef.current?.contains(anchor)) return;
    setCustomExcerpts(prev => [...prev, text]);
    sel.removeAllRanges();
  };

  const removeExcerpt = (i: number) => {
    setCustomExcerpts(prev => prev.filter((_, idx) => idx !== i));
  };

  const editExcerpt = (i: number, next: string) => {
    setCustomExcerpts(prev => prev.map((e, idx) => (idx === i ? next : e)));
  };

  const canSave =
    mode === 'full' ? fullText.length > 0 : customExcerpts.length > 0;

  const save = () => {
    const excerpts = mode === 'full' ? [fullText] : customExcerpts;
    onConfirm({
      text: title.trim() || defaultTitle,
      mode,
      excerpts,
      suggestedSection: suggestedSection.trim() || undefined,
    });
  };

  if (!node) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        background: 'rgba(20,17,13,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'pipelineFadeIn 0.2s',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 780,
          maxWidth: '92vw',
          maxHeight: '88vh',
          background: 'var(--panel)',
          border: '1px solid var(--amber)',
          boxShadow: '0 0 0 1px var(--bg), 8px 8px 0 rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--rule)',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            background: 'rgba(232,162,76,0.06)',
          }}
        >
          <div>
            <div
              className="mono"
              style={{
                fontSize: 10,
                color: 'var(--amber)',
                letterSpacing: 1.4,
                textTransform: 'uppercase',
              }}
            >
              ◈ 标为要点 · mark
            </div>
            <div
              className="serif"
              style={{
                fontSize: 18,
                color: 'var(--ink)',
                fontWeight: 500,
                marginTop: 4,
                letterSpacing: -0.3,
              }}
            >
              {node.type === 'answer' ? 'A' : 'Q'}[{node.id}]
              {paired ? ` · 配对 ${paired.type === 'answer' ? 'A' : 'Q'}[${paired.id}]` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            className="mono"
            style={{ fontSize: 14, color: 'var(--ink3)' }}
          >
            × 关闭
          </button>
        </div>

        {/* mode tabs */}
        <div
          style={{
            padding: '14px 20px 0',
            display: 'flex',
            gap: 0,
            borderBottom: '1px solid var(--rule)',
          }}
        >
          {(['full', 'custom'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="mono"
              style={{
                padding: '10px 16px',
                fontSize: 11,
                letterSpacing: 0.5,
                color: mode === m ? 'var(--amber)' : 'var(--ink3)',
                borderBottom:
                  mode === m
                    ? '2px solid var(--amber)'
                    : '2px solid transparent',
              }}
            >
              {m === 'full' ? '全量（整个 Q+A）' : '自定义摘录'}
            </button>
          ))}
        </div>

        {/* body */}
        <div
          className="scroll"
          style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 22px' }}
        >
          {/* title + suggestedSection inputs */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 2 }}>
              <div
                className="mono"
                style={{
                  fontSize: 9,
                  color: 'var(--ink3)',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                要点标题
              </div>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: 13,
                  background: 'var(--bg2)',
                  border: '1px solid var(--rule)',
                  color: 'var(--ink)',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div
                className="mono"
                style={{
                  fontSize: 9,
                  color: 'var(--ink3)',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                建议段落
              </div>
              <input
                value={suggestedSection}
                onChange={e => setSuggestedSection(e.target.value)}
                className="mono"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: 12,
                  background: 'var(--bg2)',
                  border: '1px solid var(--rule)',
                  color: 'var(--ink)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* full mode: 原文预览 */}
          {mode === 'full' && (
            <>
              <div
                className="mono"
                style={{
                  fontSize: 9,
                  color: 'var(--red)',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                ─ 原文（将整段无损存入）
              </div>
              <div
                style={{
                  padding: '14px 16px',
                  background: 'var(--bg2)',
                  border: '1px solid var(--rule)',
                  fontSize: 12.5,
                  lineHeight: 1.7,
                  color: 'var(--ink2)',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 360,
                  overflowY: 'auto',
                }}
              >
                {fullText}
              </div>
            </>
          )}

          {/* custom mode: 框选 + 片段列表 */}
          {mode === 'custom' && (
            <>
              <div
                className="mono"
                style={{
                  fontSize: 9,
                  color: 'var(--red)',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>─ 在原文中选中文字，点「添加选中」即可摘录多段</span>
                <button
                  onClick={addSelection}
                  className="mono"
                  style={{
                    fontSize: 10,
                    color: 'var(--amber)',
                    border: '1px solid var(--amber)',
                    padding: '3px 10px',
                    letterSpacing: 0.3,
                  }}
                >
                  ＋ 添加选中
                </button>
              </div>
              <div
                ref={previewRef}
                style={{
                  padding: '14px 16px',
                  background: 'var(--bg2)',
                  border: '1px solid var(--rule)',
                  fontSize: 12.5,
                  lineHeight: 1.7,
                  color: 'var(--ink2)',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 260,
                  overflowY: 'auto',
                  userSelect: 'text',
                }}
              >
                {fullText}
              </div>

              <div
                className="mono"
                style={{
                  fontSize: 9,
                  color: 'var(--red)',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  marginTop: 16,
                  marginBottom: 8,
                }}
              >
                ─ 已摘录 {customExcerpts.length} 段
              </div>
              {customExcerpts.length === 0 ? (
                <div
                  className="mono"
                  style={{
                    padding: 16,
                    fontSize: 10,
                    color: 'var(--ink3)',
                    textAlign: 'center',
                    border: '1px dashed var(--rule)',
                  }}
                >
                  暂无摘录 · 上方选中文字后点「添加选中」
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {customExcerpts.map((ex, i) => (
                    <div
                      key={i}
                      style={{
                        border: '1px solid var(--rule)',
                        borderLeft: '2px solid var(--amber)',
                        background: 'var(--bg2)',
                      }}
                    >
                      <div
                        style={{
                          padding: '6px 10px',
                          borderBottom: '1px dashed var(--rule)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          className="mono"
                          style={{
                            fontSize: 9,
                            color: 'var(--amber)',
                            letterSpacing: 0.5,
                          }}
                        >
                          摘录 № {i + 1}
                        </span>
                        <button
                          onClick={() => removeExcerpt(i)}
                          className="mono"
                          style={{
                            fontSize: 10,
                            color: 'var(--ink3)',
                            letterSpacing: 0.3,
                          }}
                        >
                          × 删除
                        </button>
                      </div>
                      <textarea
                        value={ex}
                        onChange={e => editExcerpt(i, e.target.value)}
                        rows={Math.min(6, Math.max(2, ex.split('\n').length + 1))}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          fontSize: 12,
                          lineHeight: 1.6,
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--ink2)',
                          outline: 'none',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--rule)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg2)',
          }}
        >
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink3)' }}>
            {mode === 'full'
              ? `全量 · ${fullText.length} 字`
              : `自定义 · ${customExcerpts.length} 段摘录`}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              className="mono tool-btn"
              style={{ padding: '8px 14px', fontSize: 11 }}
            >
              取消
            </button>
            <button
              onClick={save}
              disabled={!canSave}
              className="mono"
              style={{
                padding: '8px 18px',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0.5,
                background: canSave ? 'var(--amber)' : 'var(--bg2)',
                color: canSave ? 'var(--bg)' : 'var(--ink4)',
                border: '1px solid var(--amber)',
                cursor: canSave ? 'pointer' : 'not-allowed',
              }}
            >
              ◈ 保存要点 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
