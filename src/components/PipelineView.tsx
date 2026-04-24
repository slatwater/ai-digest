'use client';

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  PipelineSession,
  PipelineNode,
  TriageModel,
  CozeRun,
  WikiSourceLink,
} from '@/lib/types';
import type { usePipeline } from '@/hooks/usePipeline';

type PipelineCtx = ReturnType<typeof usePipeline>;

interface Props {
  pipeline: PipelineCtx;
  onExit?: () => void;            // 可选：外部导航（如返回 wiki 等其它视图）
}

// 卡片固定尺寸（与 usePipeline.ts 一致）
const NODE_W = 280;
const NODE_H = 160;
const COL_GAP = 64;      // 合并卡后续节点视觉左移单位
const FLOW_Y_BASE = 80;  // 每条流 y baseline 起点
const FLOW_ROW = 240;    // 每条流占据的纵向带宽（= NODE_H + 80）

// ReactMarkdown 组件覆写：所有 <a> 都新开标签页
const MD_COMPONENTS = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
  ),
};

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

/* overlay 关闭：仅当 mousedown 与 click 都发生在遮罩本身才关闭，
   防止 resize 拖拽时鼠标滑到遮罩上触发误关 */
function useOverlayClose(onClose: () => void) {
  const downOnOverlay = useRef(false);
  return {
    onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => {
      downOnOverlay.current = e.target === e.currentTarget;
    },
    onClick: (e: ReactMouseEvent<HTMLDivElement>) => {
      if (downOnOverlay.current && e.target === e.currentTarget) onClose();
      downOnOverlay.current = false;
    },
  };
}

/* ──────────────────────────────────────────────────────────
   选区右键菜单：在文本容器上左键拖选→右键时浮出"§ 存入 Wiki"
   选区为空则不拦截浏览器默认菜单。
   ────────────────────────────────────────────────────────── */
type SelectionMenuState = { x: number; y: number; text: string } | null;

function useSelectionMenu() {
  const [menu, setMenu] = useState<SelectionMenuState>(null);
  const onContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    const text = sel ? sel.toString().trim() : '';
    if (!text) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, text });
  };
  // 任意点击 / 滚动 / Esc → 关闭
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  return { menu, setMenu, onContextMenu };
}

/* 从 markdown 源里反查选区对应的 md 子串。
   构造 plain↔md 字符映射跳过 `[[name]]` / `**bold**` / `[text](url)` / `` `code` `` 标记字符，
   命中后回切原 md 子串以保留排版；命中失败 fallback 到选区原文。
   选区里的 \n 在多段时通常是单 \n（浏览器折叠），fallback 路径把它升级到 \n\n 让 wiki 的 ReactMarkdown 分段。*/
function extractMarkdownExcerpt(source: string, plainSelection: string): string {
  const target = plainSelection.trim();
  if (!target || !source) return normalizeParagraphs(plainSelection);

  const plainChars: string[] = [];
  const mdIdx: number[] = []; // plainChars[i] 在 source 中的位置
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\[\[([^\]]+)\]\]/))) {
      const t = m[1];
      for (let k = 0; k < t.length; k++) { plainChars.push(t[k]); mdIdx.push(i + 2 + k); }
      i += m[0].length; continue;
    }
    if ((m = rest.match(/^\*\*([^*]+)\*\*/))) {
      const t = m[1];
      for (let k = 0; k < t.length; k++) { plainChars.push(t[k]); mdIdx.push(i + 2 + k); }
      i += m[0].length; continue;
    }
    if ((m = rest.match(/^`([^`]+)`/))) {
      const t = m[1];
      for (let k = 0; k < t.length; k++) { plainChars.push(t[k]); mdIdx.push(i + 1 + k); }
      i += m[0].length; continue;
    }
    if ((m = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/))) {
      const t = m[1];
      for (let k = 0; k < t.length; k++) { plainChars.push(t[k]); mdIdx.push(i + 1 + k); }
      i += m[0].length; continue;
    }
    plainChars.push(source[i]);
    mdIdx.push(i);
    i += 1;
  }
  const plain = plainChars.join('');

  // 尝试 1：原样匹配（跨段时浏览器多以单 \n 分隔，下方再退到 \n→' ' 试一次）
  let pIdx = plain.indexOf(target);
  if (pIdx < 0) {
    // 尝试 2：把 plain 内的 \n 也压成 ' ' 再匹配（与折叠后的选区对齐）
    const plainOneLine = plain.replace(/\n+/g, ' ');
    pIdx = plainOneLine.indexOf(target);
    // plainOneLine 与 plain 字符总数相同（仅替换），idx 通用
  }
  if (pIdx < 0) return toWikiMarkdown(normalizeParagraphs(plainSelection));

  const startMd = mdIdx[pIdx];
  const endMd = mdIdx[pIdx + target.length - 1] + 1;
  // 命中位置若整段落在 ```...``` 内部，则把围栏（含语言标签）包回去，否则 wiki 渲染会折叠多行
  const fence = findFenceRange(source, startMd, endMd);
  if (fence) {
    const inner = source.slice(startMd, endMd).replace(/^\n+|\n+$/g, '');
    return toWikiMarkdown(`\`\`\`${fence.lang}\n${inner}\n\`\`\``);
  }
  return toWikiMarkdown(source.slice(startMd, endMd).trim());
}

// 检测 [startMd, endMd) 是否完全落在某个 fenced code block 的内部（围栏之间）；返回该围栏的语言标签
function findFenceRange(source: string, startMd: number, endMd: number): { lang: string } | null {
  const re = /```([^\n`]*)\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const innerStart = m.index + m[0].indexOf('\n') + 1;
    const innerEnd = m.index + m[0].length - 4; // 减去 "\n```"
    if (startMd >= innerStart && endMd <= innerEnd + 1) {
      return { lang: m[1].trim() };
    }
  }
  return null;
}

// 选区文本里的单 \n 升到 \n\n，让 wiki ReactMarkdown 分段；连续多空行规整成 \n\n
function normalizeParagraphs(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean)
    .join('\n\n');
}

// aidigest 自定义的 [[技术名]] 不是标准 markdown，wiki 那边的 ReactMarkdown 不识别会显示字面字符；
// 转成 **加粗** 让 prose 样式给视觉强调。叠加 autolink 让裸 URL 在 wiki 里可点。
function toWikiMarkdown(md: string): string {
  return autolinkBareUrls(md.replace(/\[\[([^\]]+)\]\]/g, '**$1**'));
}

// 把裸 URL 转成 markdown link，跳过已在 [text](url) / `code` / <https://…> 里的部分（用 \0 占位符保护）。
// 只转"含路径的裸域名"或"已带 http(s):// 协议"的——避免把 "Adam's Law" 这种英文短语误识为 url。
function autolinkBareUrls(md: string): string {
  const links: string[] = [];
  let s = md.replace(/\[[^\]]+\]\([^)]+\)/g, m => {
    links.push(m);
    return `LNK${links.length - 1}`;
  });
  const codes: string[] = [];
  s = s.replace(/`[^`]+`/g, m => {
    codes.push(m);
    return `COD${codes.length - 1}`;
  });
  const angles: string[] = [];
  s = s.replace(/<https?:\/\/[^>\s]+>/g, m => {
    angles.push(m);
    return `ANG${angles.length - 1}`;
  });

  // 域名 + 可选路径：必须带 http(s):// 协议 OR 含 / 路径；末尾常见标点不吞
  const urlRe = /(?:https?:\/\/)?[a-zA-Z0-9][a-zA-Z0-9\-]*(?:\.[a-zA-Z0-9\-]+){1,}(?:\/[^\s)，。、；：（）「」『』""'']*)?/g;
  s = s.replace(urlRe, m => {
    const hasProtocol = /^https?:\/\//i.test(m);
    const hasPath = /\//.test(m.replace(/^https?:\/\//i, ''));
    if (!hasProtocol && !hasPath) return m; // 仅域名（如 "x.com" / "ai.cn"）不转
    // 收尾常见标点（如句末逗号点）剥到 url 外
    const trail = m.match(/[.,;:!?）」』）]+$/);
    let body = m;
    let tail = '';
    if (trail) { body = m.slice(0, -trail[0].length); tail = trail[0]; }
    const url = /^https?:\/\//i.test(body) ? body : `https://${body}`;
    return `[${body}](${url})${tail}`;
  });

  s = s.replace(/ANG(\d+)/g, (_, i) => angles[+i]);
  s = s.replace(/COD(\d+)/g, (_, i) => codes[+i]);
  s = s.replace(/LNK(\d+)/g, (_, i) => links[+i]);
  return s;
}

function SelectionContextMenu({
  x, y, onSave, onClose,
}: { x: number; y: number; onSave: () => void; onClose: () => void }) {
  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      className="mono"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 60,
        background: 'var(--panel)',
        border: '1px solid var(--amber)',
        boxShadow: '4px 4px 0 rgba(0,0,0,0.4)',
        minWidth: 160,
        fontSize: 12,
        letterSpacing: 0.3,
      }}
    >
      <button
        onClick={() => { onSave(); onClose(); }}
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: '10px 14px',
          background: 'transparent',
          color: 'var(--amber)',
          fontWeight: 600,
          letterSpacing: 0.5,
        }}
      >
        § 存入 Wiki
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Narrative — markdown-ish inline renderer
   ────────────────────────────────────────────────────────── */
type NarrativeSize = 'small' | 'normal' | 'large';

function Narrative({ text, small, size }: { text: string; small?: boolean; size?: NarrativeSize }) {
  if (!text) return null;
  const resolved: NarrativeSize = size ?? (small ? 'small' : 'normal');
  const fontSize = resolved === 'large' ? 20 : resolved === 'small' ? 14 : 18;
  const codeFontSize = resolved === 'large' ? 17 : resolved === 'small' ? 12 : 15;
  const lineHeight = resolved === 'large' ? 1.9 : 1.8;
  const color = resolved === 'small' ? 'var(--ink2)' : 'var(--ink)';
  const fontWeight = resolved === 'large' ? 450 : 420;

  // 检测 markdown 表格（至少有一行 | … | 和一行分隔 |---|）
  // 若命中，整段交给 ReactMarkdown + remarkGfm 渲染（复用 .prose 表格样式），
  // 否则继续走轻量 regex parser（保留 [[技术名]] 等自定义样式）
  const hasTable =
    /^\s*\|[^\n]+\|\s*$/m.test(text) && /^\s*\|\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|\s*$/m.test(text);
  if (hasTable) {
    return (
      <div
        className="aidigest-md"
        style={{
          fontSize,
          lineHeight,
          color,
          fontWeight,
          letterSpacing: resolved === 'large' ? 0.15 : 0.1,
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{text}</ReactMarkdown>
      </div>
    );
  }

  const parts = text.split(/(\*\*[^*]+\*\*|\[\[[^\]]+\]\]|`[^`]+`)/g);
  return (
    <span
      style={{
        fontSize,
        lineHeight,
        color,
        fontWeight,
        whiteSpace: 'pre-wrap',
        letterSpacing: resolved === 'large' ? 0.15 : 0.1,
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
  onNewFlow,
  model,
  onModelChange,
}: {
  session: PipelineSession;
  onExit?: () => void;
  onNewFlow: () => void;
  model: TriageModel;
  onModelChange: (m: TriageModel) => void;
}) {
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
      </div>
    </header>
  );
}


/* ──────────────────────────────────────────────────────────
   Canvas — pan/zoom, nodes, bezier connectors
   ────────────────────────────────────────────────────────── */
export interface CanvasView { x: number; y: number; zoom: number }
export interface CanvasRect { w: number; h: number }
export interface CanvasHandle {
  focusNode: (nodeId: string) => void;
  panToWorld: (worldX: number, worldY: number) => void;
  getView: () => CanvasView;
  getRect: () => CanvasRect;
}

const Canvas = forwardRef<CanvasHandle, {
  nodes: PipelineNode[];
  streamingNodeId: string | null;
  toolStatus: string | null;
  selectedNode: string | null;
  setSelectedNode: (id: string | null) => void;
  onOpen: (nodeId: string) => void;
  onSubmitInput: (nodeId: string, urls: string[], opts?: { direct?: boolean; texts?: Record<string, string> }) => void;
  onStartExperiment: (answerNodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onViewChange?: (view: CanvasView, rect: CanvasRect) => void;
}>(function Canvas({
  nodes,
  streamingNodeId,
  toolStatus,
  selectedNode,
  setSelectedNode,
  onOpen,
  onSubmitInput,
  onStartExperiment,
  onDelete,
  onViewChange,
}, forwardedRef) {
  const [view, setView] = useState({ x: 40, y: 20, zoom: 1.6 });
  const [rect, setRect] = useState<CanvasRect>({ w: 0, h: 0 });
  const [panning, setPanning] = useState<
    { startX: number; startY: number; viewX: number; viewY: number } | null
  >(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ nodeId: string; typeLabel: string; descCount: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<PipelineNode[]>(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  // 追踪画布容器尺寸（minimap 需要用来算视口框）
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => setRect({ w: el.clientWidth, h: el.clientHeight });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 把 view + rect 向外广播（供 Minimap 等使用）；用 ref 捕获最新回调避免依赖抖动
  const onViewChangeRef = useRef(onViewChange);
  useEffect(() => { onViewChangeRef.current = onViewChange; }, [onViewChange]);
  useEffect(() => {
    onViewChangeRef.current?.(view, rect);
  }, [view, rect]);

  // 点画布任意位置关闭菜单
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [ctxMenu]);

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

  // Q/A 视觉合并：每对 question + answer 合成一张卡
  //   - mergedByQId: question.id → 对应的 answer 节点
  //   - questionByAId: answer.id → 对应的 question 节点（edge 起点映射用）
  //   - hiddenIds: 被合并掉的 answer id（节点循环里跳过）
  const { mergedByQId, questionByAId, hiddenIds } = useMemo(() => {
    const m = new Map<string, PipelineNode>();
    const q2: Map<string, PipelineNode> = new Map();
    const h = new Set<string>();
    for (const n of nodes) {
      if (n.type === 'answer' && n.parent) {
        const q = nodes.find(x => x.id === n.parent && x.type === 'question');
        if (q) {
          m.set(q.id, n);
          q2.set(n.id, q);
          h.add(n.id);
        }
      }
    }
    return { mergedByQId: m, questionByAId: q2, hiddenIds: h };
  }, [nodes]);

  // 合并后节点左移：经过每个被隐藏 answer，后续子树整体左移 NODE_W+COL_GAP
  //   —— 让连线紧贴合并卡右边，消除原 answer 留下的空白
  const effectiveX = useMemo(() => {
    const result = new Map<string, number>();
    const byId = new Map(nodes.map(n => [n.id, n]));
    const childrenBy = new Map<string, string[]>();
    for (const n of nodes) {
      if (n.parent) {
        const arr = childrenBy.get(n.parent) ?? [];
        arr.push(n.id);
        childrenBy.set(n.parent, arr);
      }
    }
    const SHIFT = NODE_W + COL_GAP;
    const visit = (id: string, shift: number) => {
      const n = byId.get(id);
      if (!n) return;
      result.set(id, (n.x ?? 0) + shift);
      const nextShift = hiddenIds.has(id) ? shift - SHIFT : shift;
      for (const cid of childrenBy.get(id) ?? []) visit(cid, nextShift);
    };
    for (const r of nodes.filter(n => !n.parent)) visit(r.id, 0);
    return result;
  }, [nodes, hiddenIds]);

  // 删除中间流后上移下方：按存活 flowIdx 压缩到连续行号
  const effectiveY = useMemo(() => {
    const result = new Map<string, number>();
    const flowIdxs = Array.from(new Set(nodes.map(n => n.flowIdx ?? 0))).sort((a, b) => a - b);
    const shiftByFlow = new Map<number, number>();
    flowIdxs.forEach((fi, newRow) => {
      shiftByFlow.set(fi, (newRow - fi) * FLOW_ROW);
    });
    for (const n of nodes) {
      const dy = shiftByFlow.get(n.flowIdx ?? 0) ?? 0;
      result.set(n.id, (n.y ?? FLOW_Y_BASE) + dy);
    }
    return result;
  }, [nodes]);

  const getX = (n: PipelineNode) => effectiveX.get(n.id) ?? (n.x ?? 0);
  const getY = (n: PipelineNode) => effectiveY.get(n.id) ?? (n.y ?? 0);

  // 对外暴露命令式 API：聚焦某节点 / 平移到世界坐标
  useImperativeHandle(forwardedRef, () => ({
    getView: () => view,
    getRect: () => rect,
    panToWorld: (wx: number, wy: number) => {
      setView(v => ({
        ...v,
        x: rect.w / 2 - wx * v.zoom,
        y: rect.h / 2 - wy * v.zoom,
      }));
    },
    focusNode: (nodeId: string) => {
      // 点到被隐藏的 answer 时自动回退到对应合并卡（question）
      const targetId = hiddenIds.has(nodeId)
        ? (questionByAId.get(nodeId)?.id ?? nodeId)
        : nodeId;
      const n = nodesRef.current.find(x => x.id === targetId);
      if (!n) return;
      const cx = (effectiveX.get(targetId) ?? (n.x ?? 0)) + (n.w ?? NODE_W) / 2;
      const cy = (effectiveY.get(targetId) ?? (n.y ?? 0)) + NODE_H / 2;
      setView(v => ({
        ...v,
        x: rect.w / 2 - cx * v.zoom,
        y: rect.h / 2 - cy * v.zoom,
      }));
    },
  }), [view, rect, hiddenIds, questionByAId, effectiveX, effectiveY]);

  const edges = nodes
    .filter(n => n.parent)
    .map(n => {
      const p = nodes.find(x => x.id === n.parent);
      return p ? { from: p, to: n } : null;
    })
    .filter((e): e is { from: PipelineNode; to: PipelineNode } => !!e)
    // 合并卡内部的 question→answer 边不画
    .filter(e => !(e.from.type === 'question' && e.to.type === 'answer' && hiddenIds.has(e.to.id)));

  const bounds = useMemo(() => {
    if (!nodes.length)
      return { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    nodes.forEach(n => {
      if (hiddenIds.has(n.id)) return; // 被合并的 answer 不参与 bbox，避免空白拉大画布
      const x = effectiveX.get(n.id) ?? (n.x ?? 0);
      const y = effectiveY.get(n.id) ?? (n.y ?? 0);
      const w = n.w ?? NODE_W;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + NODE_H);
    });
    return { minX: minX - 40, minY: minY - 40, maxX: maxX + 40, maxY: maxY + 40 };
  }, [nodes, hiddenIds, effectiveX, effectiveY]);

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
            // 若 from 是被合并掉的 answer，起点落到其 question（合并卡）的右边
            const fromNode = hiddenIds.has(e.from.id)
              ? (questionByAId.get(e.from.id) ?? e.from)
              : e.from;
            const fromX = getX(fromNode) - bounds.minX + (fromNode.w ?? NODE_W);
            const fromY = getY(fromNode) - bounds.minY + NODE_H / 2;
            const toX = getX(e.to) - bounds.minX;
            const toY = getY(e.to) - bounds.minY + NODE_H / 2;
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

        {nodes.map(n => {
          if (hiddenIds.has(n.id)) return null;
          const mergedAnswer = mergedByQId.get(n.id);
          const nShown = { ...n, x: getX(n), y: getY(n) };
          if (mergedAnswer) {
            const aSelected = selectedNode === n.id || selectedNode === mergedAnswer.id;
            return (
              <MergedQACard
                key={n.id}
                question={nShown}
                answer={mergedAnswer}
                selected={aSelected}
                streaming={streamingNodeId === mergedAnswer.id}
                toolStatus={streamingNodeId === mergedAnswer.id ? toolStatus : null}
                onSelect={() => setSelectedNode(mergedAnswer.id)}
                onOpen={() => onOpen(mergedAnswer.id)}
                onStartExperiment={onStartExperiment}
                onContextMenu={(x, y) => setCtxMenu({ x, y, nodeId: n.id })}
              />
            );
          }
          return (
            <CanvasNode
              key={n.id}
              node={nShown}
              selected={selectedNode === n.id}
              streaming={streamingNodeId === n.id}
              toolStatus={streamingNodeId === n.id ? toolStatus : null}
              onSelect={() => setSelectedNode(n.id)}
              onOpen={() => onOpen(n.id)}
              onSubmitInput={onSubmitInput}
              onStartExperiment={onStartExperiment}
              onContextMenu={(x, y) => setCtxMenu({ x, y, nodeId: n.id })}
            />
          );
        })}
      </div>

      {ctxMenu && (() => {
        const target = nodes.find(n => n.id === ctxMenu.nodeId);
        // 统计级联删除的后代数
        const descendants = new Set<string>();
        let frontier = [ctxMenu.nodeId];
        while (frontier.length) {
          const next: string[] = [];
          for (const n of nodes) {
            if (n.parent && frontier.includes(n.parent) && !descendants.has(n.id)) {
              descendants.add(n.id);
              next.push(n.id);
            }
          }
          frontier = next;
        }
        const descCount = descendants.size;
        const typeLabel = target ? ({ input: '输入', parse: '解析', question: '问题', answer: '回答', experiment: '实验' } as const)[target.type] : '节点';
        return (
          <div
            onClick={e => e.stopPropagation()}
            className="mono"
            style={{
              position: 'fixed',
              left: ctxMenu.x,
              top: ctxMenu.y,
              zIndex: 50,
              background: 'var(--panel)',
              border: '1px solid var(--ink2)',
              boxShadow: '4px 4px 0 rgba(0,0,0,0.35)',
              minWidth: 200,
              fontSize: 12,
              letterSpacing: 0.3,
            }}
          >
            <div
              style={{
                padding: '6px 12px',
                borderBottom: '1px solid var(--rule)',
                color: 'var(--ink3)',
                fontSize: 10,
                letterSpacing: 1.1,
                textTransform: 'uppercase',
                background: 'var(--bg2)',
              }}
            >
              {typeLabel} {ctxMenu.nodeId}
            </div>
            <button
              onClick={() => {
                setConfirmDel({ nodeId: ctxMenu.nodeId, typeLabel, descCount });
                setCtxMenu(null);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--red)',
                cursor: 'pointer',
                fontSize: 12,
                letterSpacing: 0.3,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,74,26,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              × 删除节点{descCount > 0 ? `（含 ${descCount} 个下游）` : ''}
            </button>
            <button
              onClick={() => setCtxMenu(null)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderTop: '1px solid var(--rule)',
                color: 'var(--ink3)',
                cursor: 'pointer',
                fontSize: 12,
                letterSpacing: 0.3,
              }}
            >
              取消
            </button>
          </div>
        );
      })()}

      {confirmDel && (
        <div
          onClick={() => setConfirmDel(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(20,17,13,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'pipelineFadeIn 0.15s',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 420,
              maxWidth: '90vw',
              background: 'var(--panel)',
              border: '1px solid var(--red)',
              boxShadow: '0 0 0 1px var(--bg), 6px 6px 0 rgba(0,0,0,0.5)',
            }}
          >
            <div
              className="mono"
              style={{
                padding: '10px 16px',
                borderBottom: '1px solid var(--rule)',
                background: 'rgba(201,74,26,0.08)',
                fontSize: 10,
                color: 'var(--red)',
                letterSpacing: 1.3,
                textTransform: 'uppercase',
              }}
            >
              × 确认删除 · {confirmDel.typeLabel} {confirmDel.nodeId}
            </div>
            <div
              style={{
                padding: '18px 20px',
                fontSize: 13,
                color: 'var(--ink)',
                lineHeight: 1.65,
              }}
            >
              {confirmDel.descCount === 0
                ? `即将删除此${confirmDel.typeLabel}节点。`
                : `即将删除此${confirmDel.typeLabel}节点及其 ${confirmDel.descCount} 个下游节点。`}
              <div
                className="mono"
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  color: 'var(--ink3)',
                  letterSpacing: 0.2,
                }}
              >
                不可撤销。若该分支被删光，对应的 SDK session 也会清理。
              </div>
            </div>
            <div
              style={{
                padding: '10px 14px',
                borderTop: '1px solid var(--rule)',
                background: 'var(--bg2)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
              }}
            >
              <button
                onClick={() => setConfirmDel(null)}
                className="mono"
                style={{
                  padding: '6px 16px',
                  fontSize: 12,
                  letterSpacing: 0.4,
                  background: 'transparent',
                  color: 'var(--ink2)',
                  border: '1px solid var(--rule)',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  onDelete(confirmDel.nodeId);
                  setSelectedNode(null);
                  setConfirmDel(null);
                }}
                className="mono"
                style={{
                  padding: '6px 16px',
                  fontSize: 12,
                  letterSpacing: 0.4,
                  fontWeight: 600,
                  background: 'var(--red)',
                  color: 'var(--bg)',
                  border: '1px solid var(--red)',
                  boxShadow: '2px 2px 0 rgba(0,0,0,0.4)',
                  cursor: 'pointer',
                }}
              >
                × 确认删除
              </button>
            </div>
          </div>
        </div>
      )}

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
          onClick={() => setView({ x: 40, y: 20, zoom: 1.05 })}
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
        拖拽平移 · ⌘滚轮缩放 · 双击解析卡查看完整内容 · 详情/对话内选中文字右键 § 存入 Wiki
      </div>
    </div>
  );
});

/* ──────────────────────────────────────────────────────────
   Minimap — 画布卡片总览导航
   读 session.nodes + Canvas 广播的 view/rect，SVG 缩略图渲染
   点节点 → Canvas.focusNode(id)；点空白 / 拖视口框 → Canvas.panToWorld
   ────────────────────────────────────────────────────────── */
const MINI_W = 276;
const MINI_H = 176;
const MINI_PAD = 6;

function nodeMiniFill(node: PipelineNode): string {
  switch (node.type) {
    case 'input':
      return 'var(--ink)';
    case 'parse':
      return node.parseEntry?.direct ? 'var(--amber)' : 'var(--red)';
    case 'question':
      return 'var(--amber)';
    case 'experiment':
      return 'var(--teal)';
    default:
      return 'var(--ink3)';
  }
}

function Minimap({
  nodes,
  view,
  canvasRect,
  selectedNode,
  streamingNodeId,
  onFocusNode,
  onNavigate,
}: {
  nodes: PipelineNode[];
  view: CanvasView;
  canvasRect: CanvasRect;
  selectedNode: string | null;
  streamingNodeId: string | null;
  onFocusNode: (id: string) => void;
  onNavigate: (worldX: number, worldY: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Q/A 视觉合并 + effectiveX 左移（与 Canvas 内逻辑保持一致）
  const { mergedByQId, hiddenIds, effectiveX, effectiveY } = useMemo(() => {
    const m = new Map<string, PipelineNode>();
    const h = new Set<string>();
    for (const n of nodes) {
      if (n.type === 'answer' && n.parent) {
        const q = nodes.find(x => x.id === n.parent && x.type === 'question');
        if (q) {
          m.set(q.id, n);
          h.add(n.id);
        }
      }
    }
    const xMap = new Map<string, number>();
    const byId = new Map(nodes.map(n => [n.id, n]));
    const childrenBy = new Map<string, string[]>();
    for (const n of nodes) {
      if (n.parent) {
        const arr = childrenBy.get(n.parent) ?? [];
        arr.push(n.id);
        childrenBy.set(n.parent, arr);
      }
    }
    const SHIFT = NODE_W + COL_GAP;
    const visit = (id: string, shift: number) => {
      const nn = byId.get(id);
      if (!nn) return;
      xMap.set(id, (nn.x ?? 0) + shift);
      const nextShift = h.has(id) ? shift - SHIFT : shift;
      for (const cid of childrenBy.get(id) ?? []) visit(cid, nextShift);
    };
    for (const r of nodes.filter(n => !n.parent)) visit(r.id, 0);

    // y 压紧：按存活 flowIdx 连续编号，让中间流被删后下方自动上移
    const yMap = new Map<string, number>();
    const flowIdxs = Array.from(new Set(nodes.map(n => n.flowIdx ?? 0))).sort((a, b) => a - b);
    const shiftByFlow = new Map<number, number>();
    flowIdxs.forEach((fi, newRow) => {
      shiftByFlow.set(fi, (newRow - fi) * FLOW_ROW);
    });
    for (const n of nodes) {
      const dy = shiftByFlow.get(n.flowIdx ?? 0) ?? 0;
      yMap.set(n.id, (n.y ?? FLOW_Y_BASE) + dy);
    }

    return { mergedByQId: m, hiddenIds: h, effectiveX: xMap, effectiveY: yMap };
  }, [nodes]);

  const getX = (n: PipelineNode) => effectiveX.get(n.id) ?? (n.x ?? 0);
  const getY = (n: PipelineNode) => effectiveY.get(n.id) ?? (n.y ?? 0);

  // 当前在跑的节点数：SSE streaming + 任意节点 state='streaming'（parse 并发解析）
  const activeCount = useMemo(
    () => nodes.filter(n => n.id === streamingNodeId || n.state === 'streaming').length,
    [nodes, streamingNodeId],
  );

  // 世界坐标 bbox（只算非隐藏节点 + 120px padding）
  const bbox = useMemo(() => {
    if (!nodes.length) {
      return { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    nodes.forEach(n => {
      if (hiddenIds.has(n.id)) return;
      const x = effectiveX.get(n.id) ?? (n.x ?? 0);
      const y = effectiveY.get(n.id) ?? (n.y ?? 0);
      const w = n.w ?? NODE_W;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + NODE_H);
    });
    const pad = 120;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }, [nodes, hiddenIds, effectiveX, effectiveY]);

  const innerW = MINI_W - MINI_PAD * 2;
  const innerH = MINI_H - MINI_PAD * 2;
  const bboxW = Math.max(1, bbox.maxX - bbox.minX);
  const bboxH = Math.max(1, bbox.maxY - bbox.minY);
  const scale = Math.min(innerW / bboxW, innerH / bboxH);
  const drawW = bboxW * scale;
  const drawH = bboxH * scale;
  const offX = MINI_PAD + (innerW - drawW) / 2;
  const offY = MINI_PAD + (innerH - drawH) / 2;

  const toMini = (wx: number, wy: number) => ({
    x: offX + (wx - bbox.minX) * scale,
    y: offY + (wy - bbox.minY) * scale,
  });

  // 视口在世界坐标的位置 / 尺寸
  const zoom = view.zoom || 1;
  const vpWorld = {
    x: -view.x / zoom,
    y: -view.y / zoom,
    w: (canvasRect.w || 0) / zoom,
    h: (canvasRect.h || 0) / zoom,
  };
  const vp = toMini(vpWorld.x, vpWorld.y);
  const vpW = vpWorld.w * scale;
  const vpH = vpWorld.h * scale;

  // 鼠标 clientXY → 世界坐标
  const clientToWorld = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const mx = clientX - r.left;
    const my = clientY - r.top;
    return {
      wx: (mx - offX) / scale + bbox.minX,
      wy: (my - offY) / scale + bbox.minY,
    };
  };

  // SVG 空白/节点点击
  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const pt = clientToWorld(e.clientX, e.clientY);
    if (!pt) return;
    // 合并卡用单卡宽度命中；隐藏 answer 不参与；hit-test 用 effective x/y
    const hit = nodes.find(n => {
      if (hiddenIds.has(n.id)) return false;
      const x = getX(n);
      const y = getY(n);
      const w = n.w ?? NODE_W;
      return pt.wx >= x && pt.wx <= x + w && pt.wy >= y && pt.wy <= y + NODE_H;
    });
    if (hit) {
      // 合并卡：selected 挂 answer（操作行为都挂在 answer 上）
      const focusId = mergedByQId.get(hit.id)?.id || hit.id;
      onFocusNode(focusId);
    } else {
      onNavigate(pt.wx, pt.wy);
    }
  };

  // 视口框拖动：抓住框上某点，框跟随鼠标；offset 保存点击位置相对视口中心的偏移
  const [dragOff, setDragOff] = useState<{ dx: number; dy: number } | null>(null);
  const onVpMouseDown = (e: React.MouseEvent<SVGRectElement>) => {
    e.stopPropagation();
    const pt = clientToWorld(e.clientX, e.clientY);
    if (!pt) return;
    const cx = vpWorld.x + vpWorld.w / 2;
    const cy = vpWorld.y + vpWorld.h / 2;
    setDragOff({ dx: pt.wx - cx, dy: pt.wy - cy });
  };
  useEffect(() => {
    if (!dragOff) return;
    const mv = (e: globalThis.MouseEvent) => {
      const pt = clientToWorld(e.clientX, e.clientY);
      if (!pt) return;
      onNavigate(pt.wx - dragOff.dx, pt.wy - dragOff.dy);
    };
    const up = () => setDragOff(null);
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragOff]);

  return (
    <div
      style={{
        padding: '12px 12px 10px',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--panel)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 9,
            color: 'var(--red)',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          ◎ 画布总览
          {activeCount > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '1px 5px',
                background: 'var(--red-soft)',
                color: 'var(--red)',
                border: '1px solid var(--red)',
                fontWeight: 600,
                letterSpacing: 0.3,
              }}
              title={`${activeCount} 个节点处理中`}
            >
              ● {activeCount}
            </span>
          )}
        </span>
        <span
          className="mono"
          style={{ fontSize: 9, color: 'var(--ink3)', letterSpacing: 0.5 }}
        >
          {nodes.length} 节点 · {zoom.toFixed(1)}×
        </span>
      </div>
      <svg
        ref={svgRef}
        width={MINI_W}
        height={MINI_H}
        onClick={handleClick}
        style={{
          display: 'block',
          background: 'var(--bg)',
          border: '1px solid var(--rule)',
          cursor: dragOff ? 'grabbing' : 'default',
        }}
      >
        {nodes.length === 0 && (
          <text
            x={MINI_W / 2}
            y={MINI_H / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10}
            fill="var(--ink4)"
            style={{ fontFamily: 'var(--mono, monospace)', letterSpacing: 1 }}
          >
            空画布
          </text>
        )}
        {nodes.map(n => {
          if (hiddenIds.has(n.id)) return null;
          const merged = mergedByQId.get(n.id);
          const x = getX(n);
          const y = getY(n);
          // 合并卡在缩略图里也只占单卡宽度
          const w = n.w ?? NODE_W;
          const mp = toMini(x, y);
          const mw = Math.max(2, w * scale);
          const mh = Math.max(2, NODE_H * scale);
          // 合并卡选中/streaming 同时感知 question+answer
          const isSelected = merged
            ? selectedNode === n.id || selectedNode === merged.id
            : n.id === selectedNode;
          // streaming 判定：SSE 正在写入 / 节点自身 state='streaming'（parse 并发解析也算）
          const effectiveN = merged ?? n;
          const isStreaming =
            effectiveN.id === streamingNodeId || effectiveN.state === 'streaming';
          const fill = merged ? 'var(--amber)' : nodeMiniFill(n);
          const cx0 = mp.x + mw / 2;
          const cy0 = mp.y + mh / 2;
          const rMin = Math.max(mw, mh) / 2 + 1;
          const rMax = Math.max(mw, mh) * 1.4;
          return (
            <g key={n.id}>
              {/* streaming 时单层柔和涟漪 */}
              {isStreaming && (
                <circle
                  cx={cx0}
                  cy={cy0}
                  fill="none"
                  stroke="var(--red)"
                  style={{ pointerEvents: 'none' }}
                >
                  <animate
                    attributeName="r"
                    values={`${rMin};${rMax}`}
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.55;0"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="stroke-width"
                    values="1.2;0.3"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              {/* 节点本体：保留类型色，仅做柔和 opacity pulse */}
              <rect
                x={mp.x}
                y={mp.y}
                width={mw}
                height={mh}
                fill={fill}
                opacity={isStreaming ? 1 : 0.85}
                rx={1}
                className={isStreaming ? 'pipe-mini-streaming' : undefined}
              />
              {isSelected && (
                <rect
                  x={mp.x - 1}
                  y={mp.y - 1}
                  width={mw + 2}
                  height={mh + 2}
                  fill="none"
                  stroke="var(--amber)"
                  strokeWidth={1.2}
                />
              )}
            </g>
          );
        })}
        {/* 视口框：在节点之上，便于点击/拖动 */}
        {canvasRect.w > 0 && canvasRect.h > 0 && (
          <rect
            x={vp.x}
            y={vp.y}
            width={vpW}
            height={vpH}
            fill="rgba(201,74,26,0.08)"
            stroke="var(--red)"
            strokeWidth={1}
            style={{ cursor: dragOff ? 'grabbing' : 'grab' }}
            onMouseDown={onVpMouseDown}
          />
        )}
      </svg>
      <div
        className="mono"
        style={{
          marginTop: 6,
          fontSize: 9,
          color: 'var(--ink4)',
          letterSpacing: 0.4,
          lineHeight: 1.5,
        }}
      >
        点击节点居中 · 拖红框或点空白处平移
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
        headerBg: node.parseEntry?.direct ? 'rgba(201,146,26,0.1)' : 'rgba(201,74,26,0.08)',
        leftBar: node.parseEntry?.direct ? 'var(--amber)' : 'var(--red)',
        label: node.parseEntry?.direct ? '⚡ 直接深入' : '◎ 解析',
        labelColor: node.parseEntry?.direct ? 'var(--amber)' : 'var(--red)',
        clickTitle: node.parseEntry?.direct ? '双击查看原文摘要' : '双击查看完整解析',
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
    case 'experiment':
      return {
        bg: 'var(--panel)',
        headerBg: 'rgba(95,179,168,0.1)',
        leftBar: 'var(--teal)',
        label: '❦ 实验',
        labelColor: 'var(--teal)',
        clickTitle: '双击展开实验对话',
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
  onOpen,
  onSubmitInput,
  onStartExperiment,
  onContextMenu,
}: {
  node: PipelineNode;
  selected: boolean;
  streaming: boolean;
  toolStatus: string | null;
  onSelect: () => void;
  onOpen: () => void;
  onSubmitInput: (nodeId: string, urls: string[], opts?: { direct?: boolean; texts?: Record<string, string> }) => void;
  onStartExperiment: (answerNodeId: string) => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  const [hovering, setHovering] = useState(false);
  const v = nodeVisuals(node, selected);
  const isQ = node.type === 'question';
  const isAnswer = node.type === 'answer';
  const isInput = node.type === 'input';
  const isParse = node.type === 'parse';
  const isExperiment = node.type === 'experiment';
  const isStreaming = node.state === 'streaming' || streaming;

  const stateLabel = isStreaming
    ? (isParse ? '● 解析中' : isExperiment ? '● 对话中' : '● 正在写')
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
    const isErr = node.state === 'error';
    const isPaste = p?.url?.startsWith('paste://');
    let secondLine: string;
    if (isErr) {
      secondLine = node.error || '解析失败';
    } else if (isPaste && p?.narrative) {
      // 原文粘贴：不回显原文，显示字数 + 追问提示
      const chars = p.narrative.length;
      secondLine = `📋 已收录原文 · ${chars} 字 · 右键追问`;
    } else if (p?.narrative) {
      secondLine = truncate(p.narrative, 110);
    } else {
      secondLine = p?.liveStatus || '排队中';
    }
    summaryLines = [
      p?.title || (isPaste ? '📋 原文粘贴' : (p?.url || '解析中…')),
      secondLine,
    ];
  }

  const summaryText = !isInput && !isParse && !isExperiment
    ? (isQ
        ? truncate(node.text, 90)
        : node.text
          ? truncate(node.text, 140)
          : isStreaming
            ? '正在生成…'
            : '')
    : '';

  // experiment 节点：标题（seedTitle）+ 摘要（对话轮数 · coze 次数 · 最新 AI 回复首行）
  let experimentLines: string[] = [];
  if (isExperiment) {
    const ep = node.experimentPayload;
    const roundCount = Math.ceil(((ep?.messages?.length) ?? 0) / 2);
    const cozeTotal = ep?.cozeRuns?.length ?? 0;
    const cozeOk = ep?.cozeRuns?.filter(r => r.status === 'success').length ?? 0;
    const lastAssistant = [...(ep?.messages ?? [])].reverse().find(m => m.role === 'assistant');
    const firstLine = lastAssistant
      ? (lastAssistant.content.split('\n').map(l => l.trim()).find(Boolean) || '').replace(/^#+\s*/, '')
      : '';
    const stats = roundCount === 0
      ? '尚未开始对话 · 双击进入'
      : `${roundCount} 轮${cozeTotal ? ` · coze ${cozeOk}/${cozeTotal}` : ''}${ep?.savedExperienceId ? ' · 已存经验' : ''}`;
    experimentLines = [
      ep?.seedTitle || node.text || '实验',
      firstLine ? truncate(firstLine, 90) : stats,
      firstLine ? stats : '',
    ].filter(Boolean);
  }

  const borderColor = selected ? 'var(--amber)' : 'var(--rule)';

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
      onContextMenu={e => {
        e.preventDefault();
        e.stopPropagation();
        onSelect();
        onContextMenu(e.clientX, e.clientY);
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
        borderLeft: `3px solid ${v.leftBar}`,
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
            onSubmit={(urls, opts) => onSubmitInput(node.id, urls, opts)}
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
                color: isParse && node.state === 'error' ? 'var(--red)' : 'var(--ink2)',
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

        {!isInput && !isParse && !isExperiment && (
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

        {isExperiment && (
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
              {experimentLines[0]}
            </div>
            {experimentLines[1] && (
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
                {experimentLines[1]}
              </div>
            )}
            {experimentLines[2] && (
              <div
                className="mono"
                style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 'auto' }}
              >
                {experimentLines[2]}
              </div>
            )}
          </>
        )}

        {isStreaming && (isAnswer || isExperiment) && (
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
        {isAnswer && node.state === 'done' && (
          <button
            onClick={e => {
              e.stopPropagation();
              onStartExperiment(node.id);
            }}
            className="mono"
            title="以此回答为起点开启实验节点"
            style={{
              fontSize: 9,
              color: 'var(--teal)',
              border: '1px solid var(--teal)',
              padding: '2px 6px',
              letterSpacing: 0.3,
              opacity: hovering || selected ? 1 : 0.55,
              transition: 'opacity 0.15s',
            }}
          >
            ❦ 实验
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

/* ──────────────────────────────────────────────────────────
   MergedQACard — 把一对 question + answer 视觉合并为一张卡
   数据层仍保留两个独立节点（parent 链、experiment 派生照旧）
   ────────────────────────────────────────────────────────── */
function MergedQACard({
  question,
  answer,
  selected,
  streaming,
  toolStatus,
  onSelect,
  onOpen,
  onStartExperiment,
  onContextMenu,
}: {
  question: PipelineNode;
  answer: PipelineNode;
  selected: boolean;
  streaming: boolean;
  toolStatus: string | null;
  onSelect: () => void;
  onOpen: () => void;
  onStartExperiment: (answerNodeId: string) => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  const [hovering, setHovering] = useState(false);
  const isStreaming = answer.state === 'streaming' || streaming;
  const left = question.x ?? 0;
  const top = question.y ?? 0;
  // 合并卡收窄为单卡宽度：视觉上是一张 question 卡，答案通过双击或 footer 按钮触达
  const width = question.w ?? NODE_W;
  const borderColor = selected ? 'var(--amber)' : 'var(--rule)';

  const stateLabel = isStreaming
    ? '● 正在写'
    : answer.state === 'error'
      ? '× 失败'
      : answer.state === 'pending'
        ? '等待'
        : 'done';
  const stateColor = isStreaming
    ? 'var(--red)'
    : answer.state === 'error'
      ? 'var(--red)'
      : 'var(--ink3)';

  const questionText = truncate(question.text || '', 220);

  return (
    <div
      data-node={question.id}
      onClick={e => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={e => {
        e.stopPropagation();
        onOpen();
      }}
      onContextMenu={e => {
        e.preventDefault();
        e.stopPropagation();
        onSelect();
        onContextMenu(e.clientX, e.clientY);
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      title="双击展开对话详情"
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height: NODE_H,
        background: 'var(--panel)',
        borderTop: `1px solid ${borderColor}`,
        borderRight: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        borderLeft: `3px solid var(--amber)`,
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

      {/* Header */}
      <div
        style={{
          padding: '5px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderBottom: '1px solid var(--rule)',
          background: 'rgba(232,162,76,0.06)',
          flexShrink: 0,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: 'var(--amber)',
            fontWeight: 600,
          }}
        >
          → 你问
        </span>
        <span className="mono" style={{ fontSize: 9, color: 'var(--ink4)' }}>
          {question.id}
        </span>
        {question.branchLabel && (
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
            {question.branchLabel}
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

      {/* Body：只显示问题；答案通过双击或 footer 按钮触达 */}
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
        <div
          className="serif"
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--ink)',
            fontWeight: 500,
            letterSpacing: -0.1,
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            flex: 1,
          }}
        >
          {questionText || '（空问题）'}
        </div>
        {isStreaming && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
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
            <span
              className="mono"
              style={{
                fontSize: 9,
                color: 'var(--red)',
                marginLeft: 4,
                letterSpacing: 0.5,
              }}
            >
              {toolStatus || 'agent 回答中…'}
            </span>
          </div>
        )}
      </div>

      {/* Footer：复刻 answer 的操作区 */}
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
        {(answer.duration || answer.tokens) && (
          <span className="mono" style={{ fontSize: 9, color: 'var(--ink3)' }}>
            {answer.duration ?? ''}
            {answer.duration && answer.tokens ? ' · ' : ''}
            {answer.tokens ? `${answer.tokens}t` : ''}
          </span>
        )}
        {answer.createdAt && (
          <span className="mono" style={{ fontSize: 9, color: 'var(--ink4)' }}>
            {answer.createdAt.length > 8
              ? answer.createdAt.slice(11, 19)
              : answer.createdAt}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {answer.state === 'done' && (
          <button
            onClick={e => {
              e.stopPropagation();
              onStartExperiment(answer.id);
            }}
            className="mono"
            title="以此回答为起点开启实验节点"
            style={{
              fontSize: 9,
              color: 'var(--teal)',
              border: '1px solid var(--teal)',
              padding: '2px 6px',
              letterSpacing: 0.3,
              opacity: hovering || selected ? 1 : 0.55,
              transition: 'opacity 0.15s',
            }}
          >
            ❦ 实验
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

// InputNodeBody — 输入卡主体（粘贴 URL 或粘贴原文，回车提交）
function InputNodeBody({
  node,
  onSubmit,
}: {
  node: PipelineNode;
  onSubmit: (urls: string[], opts?: { direct?: boolean; texts?: Record<string, string> }) => void;
}) {
  // mode: url=粘贴链接（走解析或直接深入）；text=粘贴原文（只走直接深入，跳过 scrape）
  const [mode, setMode] = useState<'url' | 'text'>('url');
  const [value, setValue] = useState(node.inputUrls?.join('\n') || '');
  const [pasteText, setPasteText] = useState('');
  const urls = value
    .split(/\r?\n|\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  const valid = urls.filter(validUrl);
  const submitted = (node.inputUrls?.length ?? 0) > 0;
  const trimmedText = pasteText.trim();
  const textReady = trimmedText.length >= 20; // 至少 20 字才算有效原文

  const submitText = () => {
    if (!textReady) return;
    const pseudoUrl = `paste://${Date.now()}`;
    onSubmit([pseudoUrl], { direct: true, texts: { [pseudoUrl]: trimmedText } });
  };

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
            {u.startsWith('paste://') ? '📋 原文粘贴' : u}
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
        if (mode === 'url' && valid.length) onSubmit(valid);
        else if (mode === 'text') submitText();
      }}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {/* mode tab */}
      <div style={{ display: 'flex', gap: 4 }}>
        {(['url', 'text'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="mono"
            style={{
              fontSize: 9,
              padding: '1px 6px',
              letterSpacing: 0.3,
              color: mode === m ? 'var(--bg)' : 'var(--ink3)',
              background: mode === m ? 'var(--ink)' : 'transparent',
              border: `1px solid ${mode === m ? 'var(--ink)' : 'var(--rule)'}`,
              cursor: 'pointer',
            }}
          >
            {m === 'url' ? '🔗 链接' : '📋 原文'}
          </button>
        ))}
      </div>
      {mode === 'url' ? (
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
      ) : (
        <textarea
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitText();
          }}
          placeholder="粘贴文章原文（≥20 字）。直接成为追问锚点，跳过解析 agent"
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
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {mode === 'url' ? (
          <>
            <span
              className="mono"
              style={{ fontSize: 9, color: 'var(--ink3)', letterSpacing: 0.3 }}
            >
              {valid.length}/{urls.length} 有效
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              disabled={!valid.length}
              onClick={() => valid.length && onSubmit(valid, { direct: true })}
              title="跳过解析，直接抓取原文后进入追问。适合你已经确认这是一手来源（论文、项目、官方博客）"
              className="mono"
              style={{
                fontSize: 10,
                padding: '2px 8px',
                letterSpacing: 0.3,
                color: valid.length ? 'var(--amber)' : 'var(--ink4)',
                background: 'transparent',
                border: `1px solid ${valid.length ? 'var(--amber)' : 'var(--rule)'}`,
                fontWeight: 600,
                cursor: valid.length ? 'pointer' : 'not-allowed',
              }}
            >
              ⚡ 直接深入
            </button>
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
          </>
        ) : (
          <>
            <span
              className="mono"
              style={{ fontSize: 9, color: 'var(--ink3)', letterSpacing: 0.3 }}
            >
              {trimmedText.length} 字{textReady ? '' : '（≥20）'}
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="submit"
              disabled={!textReady}
              title="把粘贴的原文作为锚点，跳过解析 agent 直接进入追问"
              className="mono"
              style={{
                fontSize: 10,
                padding: '2px 8px',
                letterSpacing: 0.3,
                color: textReady ? 'var(--bg)' : 'var(--ink4)',
                background: textReady ? 'var(--amber)' : 'transparent',
                border: `1px solid ${textReady ? 'var(--amber)' : 'var(--rule)'}`,
                fontWeight: 600,
                cursor: textReady ? 'pointer' : 'not-allowed',
              }}
            >
              ⚡ 直接深入
            </button>
          </>
        )}
      </div>
    </form>
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
  onSaveExcerpt,
  onClose,
}: {
  session: PipelineSession;
  target: AskTarget;
  streamingNodeId: string | null;
  toolStatus: string | null;
  canAsk: boolean;
  onAsk: (question: string, parentId: string | null, opts: { isBranch: boolean; branchLabel?: string }) => void;
  onSaveExcerpt: (excerpt: string, source: { nodeId: string; sourceUrl?: string; sourceTitle?: string }) => void;
  onClose: () => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const [isBranch, setIsBranch] = useState(false);
  const [branchLabel, setBranchLabel] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  // 选区右键菜单：记录选中文本来自哪个 answer 节点，存入 wiki 时带上 source
  const { menu: selMenu, setMenu: setSelMenu, onContextMenu: onSelectionContext } = useSelectionMenu();
  const selSourceRef = useRef<{ nodeId: string } | null>(null);

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

  // AskSheet 只展示对话链（question/answer）；input/parse 属于画布主视图的上下文，不在此重复
  const displayNodes = chain.filter(n => n.type === 'question' || n.type === 'answer');
  // 本次追问锚定的解析节点（从 chain 里取最靠近 threadHead 的 parse 祖先）
  const anchorParse = [...chain].reverse().find(n => n.type === 'parse' && n.parseEntry);

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

  const overlayHandlers = useOverlayClose(onClose);

  return (
    <div
      {...overlayHandlers}
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
        className="pipeline-deep pipeline-sheet-resizable"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(1200px, 94vw)',
          height: 'auto',
          minWidth: 560,
          minHeight: 320,
          maxWidth: '98vw',
          maxHeight: '96vh',
          resize: 'both',
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
            padding: '9px 16px',
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
                fontSize: 14,
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
                fontSize: 14,
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
            style={{ fontSize: 16, color: 'var(--ink3)', letterSpacing: 0.3 }}
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
            padding: '9px 16px',
            background: 'var(--bg)',
          }}
        >
          {anchorParse?.parseEntry && (
            <div
              style={{
                marginBottom: 20,
                border: '1px solid var(--red)',
                borderLeft: '3px solid var(--red)',
                background: 'rgba(201,74,26,0.05)',
                padding: '12px 16px',
              }}
            >
              <div
                className="mono"
                style={{
                  fontSize: 13,
                  color: 'var(--red)',
                  letterSpacing: 1.3,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}
              >
                ◎ 锚定解析 · {anchorParse.id}
              </div>
              <div
                className="serif"
                style={{
                  fontSize: 19,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  letterSpacing: -0.2,
                  lineHeight: 1.35,
                  marginBottom: anchorParse.parseEntry.narrative || anchorParse.parseEntry.concepts?.length ? 8 : 0,
                }}
              >
                {anchorParse.parseEntry.title || anchorParse.parseEntry.url}
              </div>
              {anchorParse.parseEntry.narrative && (
                <div
                  style={{
                    fontSize: 16,
                    color: 'var(--ink2)',
                    lineHeight: 1.65,
                    marginBottom: anchorParse.parseEntry.concepts?.length ? 8 : 0,
                  }}
                >
                  <Narrative text={truncate(anchorParse.parseEntry.narrative, 220)} />
                </div>
              )}
              {anchorParse.parseEntry.concepts && anchorParse.parseEntry.concepts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {anchorParse.parseEntry.concepts.map((c, i) => (
                    <span
                      key={i}
                      className="mono"
                      style={{
                        fontSize: 14,
                        padding: '2px 6px',
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
              )}
            </div>
          )}

          {displayNodes.length === 0 && (
            <div
              className="mono"
              style={{
                fontSize: 15,
                color: 'var(--ink3)',
                textAlign: 'center',
                padding: 24,
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
                    fontSize: 13,
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
                    onContextMenu={!isQ && n.state === 'done' ? (e) => {
                      selSourceRef.current = { nodeId: n.id };
                      onSelectionContext(e);
                    } : undefined}
                    style={{
                      fontSize: 20,
                      lineHeight: 1.9,
                      color: 'var(--ink)',
                      fontWeight: isQ ? 550 : 450,
                      letterSpacing: 0.15,
                      whiteSpace: 'pre-wrap',
                      userSelect: !isQ ? 'text' : 'auto',
                    }}
                    title={!isQ && n.state === 'done' ? '选中文字 → 右键存入 Wiki' : undefined}
                  >
                    {n.text ? (
                      isQ ? n.text : <Narrative text={n.text} size="large" />
                    ) : (
                      <span className="mono" style={{ color: 'var(--ink3)', fontSize: 15 }}>
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
                            fontSize: 13,
                            color: 'var(--red)',
                            marginLeft: 4,
                          }}
                        >
                          {toolStatus}
                        </span>
                      )}
                    </div>
                  )}
                  {!isQ && n.state === 'done' && (n.duration || n.tokens) && (
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
                        style={{ fontSize: 13, color: 'var(--ink3)' }}
                      >
                        {n.duration ?? ''}
                        {n.duration && n.tokens ? ' · ' : ''}
                        {n.tokens ? `${n.tokens} tok` : ''}
                      </span>
                      <span style={{ flex: 1 }} />
                      <span className="mono" style={{ fontSize: 11, color: 'var(--ink4)', letterSpacing: 0.3 }}>
                        选中文字 → 右键 § 存入 Wiki
                      </span>
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
                fontSize: 14,
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
                fontSize: 14,
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
                  fontSize: 14,
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
                fontSize: 13,
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
                fontSize: 16,
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
              style={{
                flex: 1,
                fontSize: 18,
                fontWeight: 450,
                letterSpacing: 0.1,
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
                fontSize: 15,
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
      {selMenu && (
        <SelectionContextMenu
          x={selMenu.x}
          y={selMenu.y}
          onClose={() => setSelMenu(null)}
          onSave={() => {
            const src = selSourceRef.current;
            if (!src) return;
            // 从 answer 节点 text 反查保留 markdown 源
            const sourceNode = session.nodes.find(n => n.id === src.nodeId);
            const md = extractMarkdownExcerpt(sourceNode?.text ?? '', selMenu.text);
            onSaveExcerpt(md, { nodeId: src.nodeId });
          }}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Main PipelineView
   ────────────────────────────────────────────────────────── */
export function PipelineView({ pipeline, onExit }: Props) {
  const session = pipeline.session;
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [askTarget, setAskTarget] = useState<AskTarget | null>(null);
  const [parseTarget, setParseTarget] = useState<string | null>(null);
  const [experimentTarget, setExperimentTarget] = useState<string | null>(null);
  // 选区右键 → 存入 wiki：弹窗承载的状态（excerpt 文本 + 可选来源链接）
  const [saveDialog, setSaveDialog] = useState<{
    excerpt: string;
    sourceLink?: WikiSourceLink | null;
  } | null>(null);

  // 把 AskSheet / ParseDetailSheet 的"右键 → 存入"统一打开 SaveExcerptDialog
  const handleSaveExcerpt = (
    excerpt: string,
    source: { nodeId: string; sourceUrl?: string; sourceTitle?: string },
  ) => {
    let sourceLink: WikiSourceLink | null = null;
    if (source.sourceUrl) {
      sourceLink = { url: source.sourceUrl, title: source.sourceTitle || source.sourceUrl, type: 'original' };
    } else {
      // 从节点祖先链找最近的 parse 节点取来源
      const byId = new Map(session?.nodes.map(n => [n.id, n]) ?? []);
      let cursor: string | null = source.nodeId;
      while (cursor) {
        const n = byId.get(cursor);
        if (!n) break;
        if (n.type === 'parse' && n.parseEntry?.url && !n.parseEntry.url.startsWith('paste://')) {
          sourceLink = {
            url: n.parseEntry.url,
            title: n.parseEntry.title || n.parseEntry.url,
            type: 'original',
          };
          break;
        }
        cursor = n.parent;
      }
    }
    setSaveDialog({ excerpt, sourceLink });
  };

  // Minimap 需要 Canvas 的 view + 尺寸；通过 ref 反向调用 focusNode/panToWorld
  const canvasRef = useRef<CanvasHandle>(null);
  const [canvasView, setCanvasView] = useState<CanvasView>({ x: 40, y: 20, zoom: 1.6 });
  const [canvasRect, setCanvasRect] = useState<CanvasRect>({ w: 0, h: 0 });

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
    if (n.type === 'experiment') {
      setExperimentTarget(nodeId);
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
            ref={canvasRef}
            nodes={session.nodes}
            streamingNodeId={pipeline.streamingNodeId}
            toolStatus={pipeline.toolStatus}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
            onOpen={nodeId => openSheet(nodeId)}
            onSubmitInput={(id, urls, opts) => pipeline.submitInput(id, urls, undefined, opts)}
            onStartExperiment={async (answerId: string) => {
              const newId = await pipeline.startExperiment(answerId);
              if (newId) {
                setSelectedNode(newId);
                setExperimentTarget(newId);
              }
            }}
            onDelete={pipeline.deleteNode}
            onViewChange={(v, r) => {
              setCanvasView(v);
              setCanvasRect(r);
            }}
          />
        </div>
        {/* 右侧栏：顶部 Minimap 总览导航；下方空间保留供后续功能 */}
        <aside
          aria-label="右侧功能栏"
          style={{
            width: 300,
            height: '100%',
            borderLeft: '1px solid var(--rule)',
            background: 'var(--panel)',
            position: 'relative',
            zIndex: 4,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Minimap
            nodes={session.nodes}
            view={canvasView}
            canvasRect={canvasRect}
            selectedNode={selectedNode}
            streamingNodeId={pipeline.streamingNodeId}
            onFocusNode={id => {
              setSelectedNode(id);
              canvasRef.current?.focusNode(id);
            }}
            onNavigate={(wx, wy) => canvasRef.current?.panToWorld(wx, wy)}
          />
        </aside>
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
          onSaveExcerpt={handleSaveExcerpt}
        />
      )}

      {experimentTarget && (
        <ExperimentSheet
          session={session}
          pipeline={pipeline}
          nodeId={experimentTarget}
          onClose={() => setExperimentTarget(null)}
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
          onSaveExcerpt={handleSaveExcerpt}
          onClose={() => setAskTarget(null)}
        />
      )}

      {saveDialog && (
        <SaveExcerptDialog
          excerpt={saveDialog.excerpt}
          sourceLink={saveDialog.sourceLink ?? null}
          defaultName={
            session.nodes.find(n => n.type === 'parse' && n.parseEntry?.title)?.parseEntry?.title
            || session.entrySnapshot?.title
            || ''
          }
          onSave={async ({ excerpt, name, categoryId, newCategoryName, appendToItemId, heading }) => {
            return pipeline.saveExcerptToWiki({
              excerpt,
              heading,
              name,
              categoryId,
              newCategory: newCategoryName ? { name: newCategoryName } : null,
              appendToItemId,
              sourceLink: saveDialog.sourceLink ?? null,
            });
          }}
          onClose={() => setSaveDialog(null)}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   SaveExcerptDialog — 选区右键 → 存入 Wiki 的轻量四字段弹窗
   字段：① 项目名称（已有条目下拉 / 新建）② 分类 ③ 内容预览（可微调）④ 确认存入
   ────────────────────────────────────────────────────────── */
interface WikiCategoryMeta { id: string; name: string }
interface WikiItemMeta { id: string; name: string; categoryId: string }
const NEW_ITEM_VALUE = '__new__';

function SaveExcerptDialog({
  excerpt,
  sourceLink,
  defaultName,
  onSave,
  onClose,
}: {
  excerpt: string;
  sourceLink: WikiSourceLink | null;
  defaultName: string;
  onSave: (payload: {
    excerpt: string;
    name: string;
    categoryId: string;
    newCategoryName: string;
    appendToItemId?: string;
    heading: string;
  }) => Promise<{ ok: true; itemId: string } | { ok: false; error: string }>;
  onClose: () => void;
}) {
  const overlayHandlers = useOverlayClose(onClose);
  const [cats, setCats] = useState<WikiCategoryMeta[]>([]);
  const [items, setItems] = useState<WikiItemMeta[]>([]);
  // 项目选择：'__new__' 表示新建，其它值为 wiki 条目 id
  const [itemPick, setItemPick] = useState<string>(NEW_ITEM_VALUE);
  const [name, setName] = useState(defaultName || '');
  const [catId, setCatId] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [heading, setHeading] = useState('要点');
  const [excerptText, setExcerptText] = useState(excerpt);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/wiki').then(r => r.json()).then(data => {
      if (cancelled) return;
      setCats(data.categories || []);
      setItems(data.items || []);
      // 默认分类：第一个
      if (data.categories?.[0]?.id) setCatId(data.categories[0].id);
    }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, []);

  const isAppend = itemPick !== NEW_ITEM_VALUE;
  const targetItem = isAppend ? items.find(i => i.id === itemPick) : null;
  const lockedCatId = targetItem?.categoryId;

  const canSave = !saving && excerptText.trim().length > 0 && (
    isAppend
      ? !!targetItem
      : (name.trim().length > 0 && (catId || newCatName.trim()))
  );

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    const result = await onSave({
      excerpt: excerptText,
      name: isAppend ? (targetItem?.name || name) : name.trim(),
      categoryId: isAppend ? (lockedCatId || '') : (catId || ''),
      newCategoryName: !isAppend && !catId ? newCatName.trim() : '',
      appendToItemId: isAppend ? itemPick : undefined,
      heading: heading.trim() || '要点',
    });
    setSaving(false);
    if (result.ok) onClose();
    else setErr(result.error);
  };

  return (
    <div
      {...overlayHandlers}
      className="pipeline-deep"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        background: 'rgba(20,17,13,0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'pipelineFadeIn 0.18s',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(1040px, 94vw)',
          maxHeight: '88vh',
          background: 'var(--panel)',
          border: '1px solid var(--amber)',
          boxShadow: '6px 6px 0 rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '12px 22px', borderBottom: '1px solid var(--rule)', background: 'rgba(232,162,76,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="mono" style={{ fontSize: 16, color: 'var(--amber)', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600 }}>
            § 存入 Wiki
          </span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} className="mono" style={{ fontSize: 16, color: 'var(--ink3)' }}>× 关闭</button>
        </div>

        <div className="scroll" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* 上半行：项目名称 / 分类 / 段落标题 三列并排 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr', gap: 14 }}>
            {/* 项目名称 */}
            <div>
              <div className="mono" style={{ fontSize: 13, color: 'var(--ink3)', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6 }}>
                项目名称
              </div>
              <select
                value={itemPick}
                onChange={e => setItemPick(e.target.value)}
                className="mono"
                style={{ width: '100%', padding: '8px 10px', fontSize: 16, background: 'var(--bg2)', border: '1px solid var(--rule)', color: 'var(--ink)', outline: 'none', marginBottom: 6 }}
              >
                <option value={NEW_ITEM_VALUE}>＋ 新建条目</option>
                {items.map(it => (
                  <option key={it.id} value={it.id}>追加 → {it.name}</option>
                ))}
              </select>
              {!isAppend && (
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="新条目名称（必填）"
                  style={{ width: '100%', padding: '8px 11px', fontSize: 17, background: 'var(--bg2)', border: '1px solid var(--rule)', color: 'var(--ink)', outline: 'none' }}
                />
              )}
            </div>

            {/* 分类选择 */}
            <div>
              <div className="mono" style={{ fontSize: 13, color: 'var(--ink3)', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6 }}>
                分类
              </div>
              {isAppend ? (
                <div className="mono" style={{ fontSize: 16, color: 'var(--ink3)', padding: '8px 11px', background: 'var(--bg2)', border: '1px dashed var(--rule)' }}>
                  {cats.find(c => c.id === lockedCatId)?.name || lockedCatId || '（沿用目标条目分类）'}
                </div>
              ) : (
                <>
                  <select
                    value={catId}
                    onChange={e => { setCatId(e.target.value); if (e.target.value) setNewCatName(''); }}
                    className="mono"
                    style={{ width: '100%', padding: '8px 10px', fontSize: 16, background: 'var(--bg2)', border: '1px solid var(--rule)', color: 'var(--ink)', outline: 'none', marginBottom: 6 }}
                  >
                    <option value="">— 选择已有分类 —</option>
                    {cats.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <input
                    value={newCatName}
                    onChange={e => { setNewCatName(e.target.value); if (e.target.value) setCatId(''); }}
                    placeholder="或填写新分类名"
                    style={{ width: '100%', padding: '8px 11px', fontSize: 16, background: 'var(--bg2)', border: '1px solid var(--rule)', color: 'var(--ink)', outline: 'none' }}
                  />
                </>
              )}
            </div>

            {/* 段落标题 */}
            <div>
              <div className="mono" style={{ fontSize: 13, color: 'var(--ink3)', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6 }}>
                段落标题
              </div>
              <input
                value={heading}
                onChange={e => setHeading(e.target.value)}
                placeholder="要点"
                style={{ width: '100%', padding: '8px 11px', fontSize: 17, background: 'var(--bg2)', border: '1px solid var(--rule)', color: 'var(--ink)', outline: 'none' }}
              />
            </div>
          </div>

          {/* 存入内容（占满整行） */}
          <div>
            <div className="mono" style={{ fontSize: 13, color: 'var(--ink3)', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>存入内容</span>
              <span style={{ color: 'var(--ink4)' }}>{excerptText.length} 字</span>
            </div>
            <textarea
              value={excerptText}
              onChange={e => setExcerptText(e.target.value)}
              rows={Math.min(10, Math.max(5, excerptText.split('\n').length + 1))}
              style={{ width: '100%', padding: '12px 14px', fontSize: 18, lineHeight: 1.75, background: 'var(--bg2)', border: '1px solid var(--rule)', color: 'var(--ink)', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
            />
            {sourceLink && (
              <div className="mono" style={{ fontSize: 13, color: 'var(--ink4)', marginTop: 5, letterSpacing: 0.3 }}>
                来源：{sourceLink.title}
              </div>
            )}
          </div>

          {err && (
            <div className="mono" style={{ fontSize: 14, color: 'var(--red)', padding: '8px 12px', border: '1px solid var(--red)', background: 'rgba(201,74,26,0.08)' }}>
              × {err}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--rule)', background: 'var(--bg2)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} className="mono" style={{ padding: '8px 18px', fontSize: 15, color: 'var(--ink3)' }}>取消</button>
          <button
            onClick={submit}
            disabled={!canSave}
            className="mono"
            style={{
              padding: '8px 22px',
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: 0.5,
              background: canSave ? 'var(--amber)' : 'var(--bg2)',
              color: canSave ? 'var(--bg)' : 'var(--ink4)',
              border: '1px solid var(--amber)',
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? '保存中…' : '✓ 确认存入'}
          </button>
        </div>
      </div>
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
  onSaveExcerpt,
}: {
  session: PipelineSession;
  nodeId: string;
  onClose: () => void;
  onDeepDive: (nodeId: string) => void;
  onSaveExcerpt: (excerpt: string, source: { nodeId: string; sourceUrl?: string; sourceTitle?: string }) => void;
}) {
  const node = session.nodes.find(n => n.id === nodeId);
  const p = node?.parseEntry;
  const overlayHandlers = useOverlayClose(onClose);
  const { menu: selMenu, setMenu: setSelMenu, onContextMenu: onSelectionContext } = useSelectionMenu();

  if (!node || !p) return null;

  return (
    <div
      {...overlayHandlers}
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
        className="pipeline-deep pipeline-sheet-resizable"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(1200px, 94vw)',
          height: 'auto',
          minWidth: 560,
          minHeight: 320,
          maxWidth: '98vw',
          maxHeight: '96vh',
          resize: 'both',
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
            padding: '10px 18px',
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
              fontSize: 14,
              color: p.direct ? 'var(--amber)' : 'var(--red)',
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              border: `1px solid ${p.direct ? 'var(--amber)' : 'var(--red)'}`,
              padding: '2px 6px',
            }}
          >
            {p.direct ? '⚡ 直接深入' : '◎ 解析详情'}
          </span>
          <span
            className="mono"
            style={{
              fontSize: 14,
              color: 'var(--ink3)',
              letterSpacing: 0.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {p.url.startsWith('paste://') ? '📋 原文粘贴（无外部链接）' : p.url}
          </span>
          <button
            onClick={onClose}
            className="mono"
            style={{ fontSize: 16, color: 'var(--ink3)', letterSpacing: 0.3 }}
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
            padding: '14px 22px',
            background: 'var(--bg)',
          }}
        >
          <h2
            className="serif"
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: 'var(--ink)',
              letterSpacing: -0.4,
              lineHeight: 1.3,
              marginBottom: 12,
            }}
          >
            {p.title}
          </h2>

          {node.state === 'error' && node.error && (
            <div
              className="mono"
              style={{
                marginBottom: 18,
                padding: '10px 14px',
                border: '1px solid var(--red)',
                background: 'rgba(201,74,26,0.08)',
                color: 'var(--red)',
                fontSize: 16,
                lineHeight: 1.6,
                letterSpacing: 0.2,
              }}
            >
              <div style={{ fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6, opacity: 0.8 }}>
                × 解析失败
              </div>
              {node.error}
            </div>
          )}

          {p.concepts && p.concepts.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div
                className="mono"
                style={{
                  fontSize: 13,
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
                      fontSize: 15,
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
                  fontSize: 13,
                  color: 'var(--ink3)',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 12,
                }}
              >
                <span>
                  {p.url?.startsWith('paste://')
                    ? '── 你粘贴的原文（追问时作为锚点）'
                    : p.direct
                      ? '── 原文摘要（未经 agent 分析）'
                      : '── 解析叙述'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink4)', textTransform: 'none', letterSpacing: 0.3 }}>
                  选中文字 → 右键 § 存入 Wiki
                </span>
              </div>
              <div
                onContextMenu={onSelectionContext}
                style={{ userSelect: 'text' }}
                title="选中文字 → 右键存入 Wiki"
              >
                {p.narrative.split(/\n\n+/).map((para, i) => (
                  <p key={i} style={{ marginBottom: 14 }}>
                    <Narrative text={para} size="large" />
                  </p>
                ))}
              </div>
            </div>
          )}

          {p.sources && p.sources.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div
                className="mono"
                style={{
                  fontSize: 13,
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
                      fontSize: 15,
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
            style={{ fontSize: 14, color: 'var(--ink3)', letterSpacing: 0.3, flex: 1 }}
          >
            节点 {node.id} · 深入追问将以该解析为上下文派生新问题
          </span>
          <button
            onClick={() => onDeepDive(node.id)}
            className="mono"
            style={{
              padding: '6px 14px',
              fontSize: 16,
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
      {selMenu && (
        <SelectionContextMenu
          x={selMenu.x}
          y={selMenu.y}
          onClose={() => setSelMenu(null)}
          onSave={() => {
            // 从 narrative markdown 源反查保留排版
            const md = extractMarkdownExcerpt(p.narrative ?? '', selMenu.text);
            onSaveExcerpt(md, {
              nodeId: node.id,
              sourceUrl: p.url && !p.url.startsWith('paste://') ? p.url : undefined,
              sourceTitle: p.title || undefined,
            });
          }}
        />
      )}
    </div>
  );
}


/* ──────────────────────────────────────────────────────────
   ExperimentSheet — 画布内实验对话弹窗
   以 answer 节点文本为种子，直接进入对话 + coze 验证
   ────────────────────────────────────────────────────────── */
function ExperimentSheet({
  session,
  pipeline,
  nodeId,
  onClose,
}: {
  session: PipelineSession;
  pipeline: PipelineCtx;
  nodeId: string;
  onClose: () => void;
}) {
  const node = session.nodes.find(n => n.id === nodeId);
  const payload = node?.experimentPayload;

  const [input, setInput] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [cozeOpen, setCozeOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isStreamingHere = pipeline.streamingNodeId === nodeId;
  const streamingText = isStreamingHere ? pipeline.experimentStreamingText : '';

  // 新消息到来：无条件滚到底（让用户看到新消息）
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [payload?.messages.length]);

  // 流式 token 增量：只有用户当前「粘在底部」才跟随滚动，
  // 否则保持用户自行滚动的位置，允许上翻查看历史
  useEffect(() => {
    if (!streamingText) return;
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [streamingText]);

  useEffect(() => {
    if (!isStreamingHere) inputRef.current?.focus();
  }, [isStreamingHere]);

  const overlayHandlers = useOverlayClose(onClose);

  if (!node || !payload) return null;

  const lastAssistant = [...payload.messages].reverse().find(m => m.role === 'assistant');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreamingHere) return;
    pipeline.sendExperimentMessage(nodeId, input);
    setInput('');
  };

  return (
    <div
      {...overlayHandlers}
      className="pipeline-deep"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(20,17,13,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'pipelineFadeIn 0.15s',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="pipeline-sheet-resizable"
        style={{
          width: 'min(1200px, 94vw)',
          height: 'min(820px, 90vh)',
          minWidth: 560,
          minHeight: 320,
          maxWidth: '98vw',
          maxHeight: '96vh',
          resize: 'both',
          background: 'var(--panel)',
          border: '1px solid var(--ink2)',
          boxShadow: '0 0 0 1px var(--bg), 6px 6px 0 rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--rule)',
            background: 'rgba(232,162,76,0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span className="mono" style={{ fontSize: 14, color: 'var(--amber)', letterSpacing: 1.3, fontWeight: 600, textTransform: 'uppercase' }}>
            ❦ 实验
          </span>
          <span className="mono" style={{ fontSize: 14, color: 'var(--ink4)' }}>
            {node.id} · 源自 {payload.sourceNodeId}
          </span>
          {payload.resolvedModel && (
            <span className="mono" style={{ fontSize: 13, color: 'var(--ink3)' }}>
              {payload.resolvedModel}
            </span>
          )}
          <span style={{ flex: 1 }} />
          {lastAssistant && (
            <button
              onClick={() => setSaveOpen(true)}
              className="mono"
              style={{
                fontSize: 15,
                color: 'var(--amber)',
                border: '1px solid var(--amber)',
                padding: '3px 10px',
                letterSpacing: 0.4,
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              ◈ 保存为经验
            </button>
          )}
          <button
            onClick={onClose}
            className="mono"
            style={{ fontSize: 15, color: 'var(--ink3)', letterSpacing: 0.4, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            × 关闭
          </button>
        </div>

        {/* Seed 折叠区 */}
        <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--rule)', background: 'var(--bg2)' }}>
          <button
            onClick={() => setSeedOpen(v => !v)}
            className="mono"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              border: 'none',
              color: 'var(--ink3)',
              fontSize: 14,
              letterSpacing: 0.8,
              cursor: 'pointer',
              padding: 0,
              textTransform: 'uppercase',
            }}
          >
            <span style={{ transform: seedOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>▸</span>
            实验起点 · {payload.seedText.length} 字
            {payload.seedTitle ? ` · ${truncate(payload.seedTitle, 40)}` : ''}
          </button>
          {seedOpen && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                background: 'var(--bg)',
                border: '1px solid var(--rule)',
                fontSize: 16,
                lineHeight: 1.6,
                color: 'var(--ink2)',
                maxHeight: 240,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {payload.seedText}
            </div>
          )}
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: '1 1 0',
            minHeight: 0,
            overflowY: 'auto',
            padding: '11px 18px',
          }}
        >
          {payload.messages.length === 0 && !isStreamingHere && (
            <div className="mono" style={{ color: 'var(--ink3)', fontSize: 16, lineHeight: 1.8, letterSpacing: 0.3 }}>
              从这段结论出发，提一个要验证的问题开始对话。<br />
              agent 会按需调 coze CLI 实际跑一下。
            </div>
          )}
          {payload.messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 18 }}>
              {m.role === 'user' ? (
                <p className="serif" style={{ fontSize: 18, color: 'var(--ink)', fontWeight: 500, margin: 0, lineHeight: 1.6 }}>
                  {m.content}
                </p>
              ) : (
                <div
                  className="experiment-markdown aidigest-md"
                  style={{
                    fontSize: 17,
                    color: 'var(--ink2)',
                    paddingLeft: 12,
                    borderLeft: '1px solid var(--rule)',
                    lineHeight: 1.7,
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{m.content}</ReactMarkdown>
                </div>
              )}
            </div>
          ))}
          {isStreamingHere && streamingText && (
            <div
              className="experiment-markdown aidigest-md"
              style={{
                fontSize: 17,
                color: 'var(--ink2)',
                paddingLeft: 12,
                borderLeft: '1px solid var(--amber)',
                lineHeight: 1.7,
                marginBottom: 18,
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{streamingText}</ReactMarkdown>
            </div>
          )}
          {isStreamingHere && !streamingText && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
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
              {pipeline.toolStatus && (
                <span className="mono" style={{ fontSize: 14, color: 'var(--red)', marginLeft: 6 }}>
                  {pipeline.toolStatus}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Coze runs panel */}
        {payload.cozeRuns.length > 0 && (
          <div style={{ borderTop: '1px solid var(--rule)', padding: '6px 14px' }}>
            <button
              onClick={() => setCozeOpen(v => !v)}
              className="mono"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: 'none',
                color: 'var(--ink2)',
                fontSize: 14,
                letterSpacing: 0.8,
                cursor: 'pointer',
                padding: 0,
                textTransform: 'uppercase',
              }}
            >
              <span style={{ transform: cozeOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>▸</span>
              Coze 运行 ({payload.cozeRuns.length}) ·{' '}
              <span style={{ color: 'var(--ink3)' }}>
                {payload.cozeRuns.filter(r => r.status === 'success').length} 成功 ·{' '}
                {payload.cozeRuns.filter(r => r.status === 'failed').length} 失败 ·{' '}
                {payload.cozeRuns.filter(r => r.status === 'running').length} 运行中
              </span>
            </button>
            {cozeOpen && (
              <div
                style={{
                  marginTop: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  maxHeight: 260,
                  overflowY: 'auto',
                  paddingRight: 4,
                }}
              >
                {payload.cozeRuns.map(run => <CozeRunRow key={run.id} run={run} />)}
              </div>
            )}
          </div>
        )}

        {/* Tool traces */}
        {payload.toolTraces && payload.toolTraces.length > 0 && (
          <div style={{ borderTop: '1px solid var(--rule)', padding: '6px 16px', background: 'var(--bg2)' }}>
            <button
              onClick={() => setTraceOpen(v => !v)}
              className="mono"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: 'none',
                color: 'var(--ink3)',
                fontSize: 14,
                letterSpacing: 0.6,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span style={{ transform: traceOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>▸</span>
              工具轨迹 ({payload.toolTraces.length})
            </button>
            {traceOpen && (
              <div style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
                {payload.toolTraces.map((t, i) => (
                  <div key={i} className="mono" style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink3)', padding: '2px 0' }}>
                    <span style={{ color: 'var(--amber)', fontWeight: 500 }}>{t.tool}</span>{' '}
                    <span style={{ wordBreak: 'break-all' }}>
                      {t.detail.replace(/^\/.*?\/aidigest-experiment-[^/]+\//, '')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 14px',
            borderTop: '1px solid var(--rule)',
            background: 'var(--bg2)',
          }}
        >
          <span className="mono" style={{ color: isStreamingHere ? 'var(--ink4)' : 'var(--amber)', fontSize: 17 }}>
            {isStreamingHere ? '…' : '>'}
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={isStreamingHere ? '正在生成，请稍候…' : '提一个要验证的问题，或让 agent 跑 coze…'}
            disabled={isStreamingHere}
            className="mono"
            style={{
              flex: 1,
              fontSize: 17,
              color: 'var(--ink)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
            }}
          />
          {isStreamingHere ? (
            <button
              type="button"
              onClick={() => pipeline.abortExperiment(nodeId)}
              className="mono"
              style={{
                padding: '5px 12px',
                fontSize: 16,
                letterSpacing: 0.4,
                background: 'var(--red)',
                color: 'var(--bg)',
                border: '1px solid var(--red)',
                cursor: 'pointer',
              }}
            >
              × 中止
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="mono"
              style={{
                padding: '5px 12px',
                fontSize: 16,
                letterSpacing: 0.4,
                color: input.trim() ? 'var(--amber)' : 'var(--ink4)',
                background: 'transparent',
                border: `1px solid ${input.trim() ? 'var(--amber)' : 'var(--rule)'}`,
                cursor: input.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              ⌘↵ 发送
            </button>
          )}
        </form>
      </div>

      {saveOpen && lastAssistant && (
        <SaveExperienceInline
          defaultContent={lastAssistant.content}
          onClose={() => setSaveOpen(false)}
          onSave={async (body) => pipeline.saveExperimentAsExperience(nodeId, body)}
        />
      )}
    </div>
  );
}

function CozeRunRow({ run }: { run: CozeRun }) {
  const [open, setOpen] = useState(false);
  const duration = run.endedAt ? ((run.endedAt - run.startedAt) / 1000).toFixed(1) : null;
  const statusColor = run.status === 'running' ? 'var(--amber)' : run.status === 'success' ? 'var(--ink2)' : 'var(--red)';
  const label = run.status === 'running' ? '运行中' : run.status === 'success' ? '完成' : '失败';

  return (
    <div style={{ border: '1px solid var(--rule)', background: 'var(--bg)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={run.status === 'running'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          textAlign: 'left',
          padding: '6px 10px',
          background: 'transparent',
          border: 'none',
          cursor: run.status === 'running' ? 'default' : 'pointer',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: statusColor,
            animation: run.status === 'running' ? 'pipelineTypingDot 1s infinite' : undefined,
          }}
        />
        <span className="mono" style={{ fontSize: 10, color: statusColor, letterSpacing: 0.4, fontWeight: 500 }}>
          {label}
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink2)', flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
          {run.command.length > 160 ? run.command.slice(0, 160) + '…' : run.command}
        </span>
        {duration && (
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink3)' }}>
            {duration}s
          </span>
        )}
      </button>
      {open && run.stdout && (
        <pre
          className="mono"
          style={{
            fontSize: 10,
            color: 'var(--ink3)',
            lineHeight: 1.5,
            padding: '0 12px 8px',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {run.stdout}
        </pre>
      )}
    </div>
  );
}

function SaveExperienceInline({
  defaultContent,
  onClose,
  onSave,
}: {
  defaultContent: string;
  onClose: () => void;
  onSave: (body: { title: string; summary: string; content: string }) => Promise<{ ok: boolean; id?: string; error?: string }>;
}) {
  const firstLine = defaultContent.split('\n').find(l => l.trim())?.replace(/^#+\s*/, '').slice(0, 60) || '';
  const [title, setTitle] = useState(firstLine);
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState(defaultContent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) { setError('请填写标题'); return; }
    setSaving(true);
    setError(null);
    const res = await onSave({ title: title.trim(), summary: summary.trim(), content });
    setSaving(false);
    if (!res.ok) setError(res.error || '保存失败');
    else onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: '92vw',
          background: 'var(--panel)',
          border: '1px solid var(--amber)',
          padding: 20,
        }}
      >
        <h3 className="mono" style={{ fontSize: 11, color: 'var(--amber)', letterSpacing: 1.3, textTransform: 'uppercase', margin: 0, marginBottom: 14 }}>
          ◈ 保存为经验
        </h3>
        <label className="mono" style={{ fontSize: 10, color: 'var(--ink3)', letterSpacing: 0.5 }}>标题</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="mono"
          style={{ width: '100%', marginTop: 4, marginBottom: 10, padding: '6px 8px', fontSize: 13, color: 'var(--ink)', background: 'var(--bg2)', border: '1px solid var(--rule)', outline: 'none' }}
        />
        <label className="mono" style={{ fontSize: 10, color: 'var(--ink3)', letterSpacing: 0.5 }}>一句话概要</label>
        <input
          value={summary}
          onChange={e => setSummary(e.target.value)}
          placeholder="解决什么问题 / 验证了什么"
          className="mono"
          style={{ width: '100%', marginTop: 4, marginBottom: 10, padding: '6px 8px', fontSize: 13, color: 'var(--ink)', background: 'var(--bg2)', border: '1px solid var(--rule)', outline: 'none' }}
        />
        <label className="mono" style={{ fontSize: 10, color: 'var(--ink3)', letterSpacing: 0.5 }}>内容 Markdown</label>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={10}
          className="mono"
          style={{ width: '100%', marginTop: 4, padding: '8px 10px', fontSize: 12, color: 'var(--ink)', background: 'var(--bg2)', border: '1px solid var(--rule)', outline: 'none', resize: 'vertical', lineHeight: 1.55 }}
        />
        {error && <div className="mono" style={{ marginTop: 8, fontSize: 11, color: 'var(--red)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <button
            onClick={onClose}
            className="mono"
            style={{ padding: '5px 12px', fontSize: 12, color: 'var(--ink2)', background: 'transparent', border: '1px solid var(--rule)', cursor: 'pointer' }}
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={saving || !title.trim()}
            className="mono"
            style={{
              padding: '5px 14px',
              fontSize: 12,
              background: saving || !title.trim() ? 'var(--bg2)' : 'var(--amber)',
              color: saving || !title.trim() ? 'var(--ink4)' : 'var(--bg)',
              border: '1px solid var(--amber)',
              cursor: saving || !title.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            {saving ? '保存中…' : '◈ 保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
