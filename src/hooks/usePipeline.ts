'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  PipelineSession,
  PipelineNode,
  ParseNodePayload,
  PipelineDraft,
  TriageEntry,
  TriageModel,
  TriageBatch,
  ExperimentNodePayload,
  ExperimentToolTrace,
  ChatMessage,
  CozeRun,
  WikiSourceLink,
  GithubTrendingPayload,
} from '@/lib/types';

// ── 画布布局常量 ──
// 统一画布：input → parse → Q → A 均为「向右延伸」
export const NODE_W = 280;
export const NODE_H = 160;
const COL_GAP = 64;      // 同一流水平列间距
const ROW_GAP = 40;      // 同流内 parse 子行间距
const BRANCH_DY = NODE_H + ROW_GAP; // 分支上下偏移
const FLOW_ROW = NODE_H + 80;       // 每条流占据的纵向带宽（紧凑：一屏能看到多条流）
const FLOW_Y_BASE = 80;
const TRUNK_X = 80;
// github 节点布局：固定在 trunk 左侧（x 负坐标），y 与 flow 0 起点对齐
// 这样它跟主干 input/parse 处于同一水平带，但落在画布原点左方的"零号槽位"
const GITHUB_NODE_H = 360;
const GITHUB_NODE_X = -320;
const GITHUB_NODE_Y = FLOW_Y_BASE;

const LS_LAST_SESSION = 'aidigest.lastPipelineId';

function nowClock() {
  return new Date().toTimeString().slice(0, 8);
}

// 下一个节点 id
function nextNodeId(session: PipelineSession): string {
  let max = 0;
  for (const n of session.nodes) {
    const m = n.id.match(/^n(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `n${max + 1}`;
}

// 计算下一条流的 y 起点
function nextFlowY(session: PipelineSession): number {
  const flowIdxs = session.nodes
    .map(n => n.flowIdx ?? 0)
    .reduce((max, v) => Math.max(max, v), -1);
  return FLOW_Y_BASE + (flowIdxs + 1) * FLOW_ROW;
}

// Q/A 追问节点：挂在父节点右侧
function computeAskPositions(
  session: PipelineSession,
  parentId: string | null,
  isBranch: boolean,
) {
  const parent = parentId ? session.nodes.find(n => n.id === parentId) : null;
  if (!parent) {
    const x = TRUNK_X + session.nodes.filter(n => n.parent === null).length * (NODE_W + COL_GAP);
    return {
      questionPos: { x, y: FLOW_Y_BASE, w: NODE_W },
      answerPos: { x: x + NODE_W + COL_GAP, y: FLOW_Y_BASE, w: NODE_W },
    };
  }
  const parentX = parent.x ?? TRUNK_X;
  const parentY = parent.y ?? FLOW_Y_BASE;
  let baseY = parentY;
  if (isBranch) {
    const siblings = session.nodes.filter(n => n.parent === parentId);
    const dir = siblings.length % 2 === 0 ? -1 : 1;
    baseY = parentY + BRANCH_DY * Math.ceil((siblings.length + 1) / 2) * dir;
  }
  const qx = parentX + NODE_W + COL_GAP;
  const ax = qx + NODE_W + COL_GAP;
  return {
    questionPos: { x: qx, y: baseY, w: NODE_W },
    answerPos: { x: ax, y: baseY, w: NODE_W },
  };
}

interface CreateFromEntryArgs {
  entry: TriageEntry;
  model?: TriageModel;
}

export function usePipeline() {
  const [session, setSession] = useState<PipelineSession | null>(null);
  const [streamingNodeId, setStreamingNodeId] = useState<string | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [experimentStreamingText, setExperimentStreamingText] = useState<string>('');
  const [model, setModelState] = useState<TriageModel>('sonnet');
  const sessionRef = useRef<PipelineSession | null>(null);
  // batchId -> { inputNodeId, urlToNode（按 URL 匹配后端真实 entryId） }
  const parsePollMapRef = useRef<Map<string, {
    inputNodeId: string;
    urlToNode: Map<string, string>;
  }>>(new Map());
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // github 节点检查锁：每个 session 仅检查一次（避免重复触发抓取）
  const githubCheckedRef = useRef<string | null>(null);

  const setSessionBoth = useCallback((next: PipelineSession | null) => {
    sessionRef.current = next;
    setSession(next);
    if (typeof window !== 'undefined') {
      if (next?.id) {
        try { localStorage.setItem(LS_LAST_SESSION, next.id); } catch { /* quota */ }
      } else {
        try { localStorage.removeItem(LS_LAST_SESSION); } catch { /* ignore */ }
      }
    }
  }, []);

  // 确保存在 session：首次进入画布时调用
  //   - 先尝试恢复 localStorage 里记录的上次 session（刷新后继续）
  //   - 找不到或已被删除时再创建新 session
  const ensureSession = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;

    if (typeof window !== 'undefined') {
      let lastId: string | null = null;
      try { lastId = localStorage.getItem(LS_LAST_SESSION); } catch { /* ignore */ }
      if (lastId) {
        try {
          const r = await fetch(`/api/pipeline/${lastId}`);
          if (r.ok) {
            const j = await r.json();
            if (j.session) {
              setSessionBoth(j.session);
              return j.session as PipelineSession;
            }
          }
        } catch { /* fall through to new session */ }
      }
    }

    const res = await fetch('/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    });
    const json = await res.json();
    if (json.session) {
      setSessionBoth(json.session);
      return json.session as PipelineSession;
    }
    return null;
  }, [model, setSessionBoth]);

  // 从 triage entry 创建新 pipeline session（老入口，兼容）
  const startFromEntry = useCallback(
    async ({ entry, model: m }: CreateFromEntryArgs) => {
      const pickModel = m || 'sonnet';
      setModelState(pickModel);
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry, model: pickModel }),
      });
      const json = await res.json();
      if (json.session) setSessionBoth(json.session);
    },
    [setSessionBoth],
  );

  const exit = useCallback(() => {
    setSessionBoth(null);
    setStreamingNodeId(null);
    setToolStatus(null);
    parsePollMapRef.current.clear();
  }, [setSessionBoth]);

  const setModel = useCallback((m: TriageModel) => setModelState(m), []);

  // ── 新流程：创建一个空 input 节点 ──
  const addInputFlow = useCallback(async () => {
    const current = (await ensureSession()) ?? sessionRef.current;
    if (!current) return;
    const y = nextFlowY(current);
    const flowIdx = Math.round((y - FLOW_Y_BASE) / FLOW_ROW);
    const node: PipelineNode = {
      id: nextNodeId(current),
      type: 'input',
      state: 'done',
      text: '',
      parent: null,
      branchIdx: 0,
      flowIdx,
      x: TRUNK_X,
      y,
      w: NODE_W,
      createdAt: nowClock(),
      inputUrls: [],
      inputModel: model,
    };
    const next: PipelineSession = { ...current, nodes: [...current.nodes, node] };
    setSessionBoth(next);
    await fetch(`/api/pipeline/${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeAdd: node }),
    });
    return node.id;
  }, [ensureSession, model, setSessionBoth]);

  // ── GitHub trending 节点：每天打开应用时检查一次，今日数据没有则触发抓取 ──
  // 用户选择 Q1=B（打开自检）+ Q2=A（每天覆盖）：每个 session 永远只有一个 github 节点
  const ensureGithubNode = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    if (githubCheckedRef.current === s.id) return;
    githubCheckedRef.current = s.id;

    let payload: GithubTrendingPayload | null = null;
    try {
      const r = await fetch('/api/trending');
      if (r.ok) {
        const j = await r.json();
        payload = (j.payload as GithubTrendingPayload) || null;
      }
    } catch { /* 静默失败：trending 是辅助功能，挂了不影响主流程 */ }
    if (!payload) return;

    const fresh = sessionRef.current;
    if (!fresh) return;
    const existing = fresh.nodes.find(n => n.type === 'github');

    if (existing) {
      // 坐标和 payload 分开判断，避免"fetchedAt 一致就完全跳过"导致旧坐标无法迁移
      // （早期版本把 github 节点放在主干上方 y=-400，现在统一改为左侧 x=-320, y=80）
      const samePayload = existing.githubPayload?.fetchedAt === payload.fetchedAt;
      const sameCoord =
        existing.x === GITHUB_NODE_X &&
        existing.y === GITHUB_NODE_Y &&
        existing.h === GITHUB_NODE_H;
      if (samePayload && sameCoord) return;

      const patch: Partial<PipelineNode> = {
        x: GITHUB_NODE_X,
        y: GITHUB_NODE_Y,
        h: GITHUB_NODE_H,
      };
      if (!samePayload) patch.githubPayload = payload;

      const nextNodes = fresh.nodes.map(n =>
        n.id === existing.id ? { ...n, ...patch } : n,
      );
      setSessionBoth({ ...fresh, nodes: nextNodes });
      await fetch(`/api/pipeline/${fresh.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodePatch: { id: existing.id, patch } }),
      }).catch(() => {});
      return;
    }

    // 新建 github 节点（x 负坐标，落在主干 input 列左侧，跟 flow 0 同一行）
    const node: PipelineNode = {
      id: nextNodeId(fresh),
      type: 'github',
      state: 'done',
      text: '今日 GitHub 热榜',
      parent: null,
      branchIdx: 0,
      x: GITHUB_NODE_X,
      y: GITHUB_NODE_Y,
      w: NODE_W,
      h: GITHUB_NODE_H,
      createdAt: nowClock(),
      githubPayload: payload,
    };
    setSessionBoth({ ...fresh, nodes: [...fresh.nodes, node] });
    await fetch(`/api/pipeline/${fresh.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeAdd: node }),
    }).catch(() => {});
  }, [setSessionBoth]);

  // session 加载完毕后自动触发一次 github 节点检查（只在 sessionId 变化时跑，
  // 否则每次 setSession 都会重复触发）
  const sessionId = session?.id;
  useEffect(() => {
    if (!sessionId) return;
    ensureGithubNode().catch(() => {});
  }, [sessionId, ensureGithubNode]);

  // ── 提交 input 节点的 URL 列表：创建解析 batch + 并列 parse 占位节点 ──
  //   texts: 可选，url → 原文（原文粘贴模式）。命中时走 direct 分支 + 后端跳过 scrape
  const submitInput = useCallback(async (
    inputNodeId: string,
    urls: string[],
    submitModel?: TriageModel,
    opts?: { direct?: boolean; texts?: Record<string, string> },
  ) => {
    const current = sessionRef.current;
    if (!current) return;
    const input = current.nodes.find(n => n.id === inputNodeId);
    if (!input || !urls.length) return;

    const useModel = submitModel || input.inputModel || model;
    const texts = opts?.texts;
    const hasTexts = texts && Object.keys(texts).length > 0;
    const direct = !!opts?.direct || !!hasTexts;

    // 1. 提交 triage batch
    let batchId: string | null = null;
    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, model: useModel, direct, texts }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '提交失败');
      batchId = (await res.json()).batchId as string;
    } catch (err) {
      console.error('[pipeline] triage submit failed', err);
      return;
    }

    // 2. 根据 urls 生成并列 parse 占位节点
    let draftSession = { ...current, nodes: [...current.nodes] };
    const urlToNode = new Map<string, string>();
    urls.forEach((url, i) => {
      const parseX = (input.x ?? TRUNK_X) + NODE_W + COL_GAP;
      const parseY = (input.y ?? FLOW_Y_BASE) + i * (NODE_H + ROW_GAP);
      const id = nextNodeId(draftSession);
      // 原文粘贴：title 用原文首行而非伪 URL
      const isPaste = url.startsWith('paste://') && texts?.[url];
      const pasteTitle = isPaste
        ? (texts![url].split(/\r?\n/).map(s => s.trim()).find(Boolean) || '原文粘贴').slice(0, 40)
        : url;
      const node: PipelineNode = {
        id,
        type: 'parse',
        state: 'streaming',
        text: isPaste ? pasteTitle : url,
        parent: inputNodeId,
        branchIdx: i,
        flowIdx: input.flowIdx,
        x: parseX,
        y: parseY,
        w: NODE_W,
        createdAt: nowClock(),
        model: useModel,
        parseEntry: {
          entryId: '',           // 真实 id 在轮询到后端后回填
          batchId: batchId!,
          url,
          title: pasteTitle,
          livePhases: [],
          liveStatus: isPaste ? '⚡ 读取原文' : (direct ? '⚡ 直接抓取中' : '排队中'),
        },
      };
      draftSession.nodes.push(node);
      urlToNode.set(url, id);
    });

    // 3. 更新 input 节点记录 URL
    draftSession = {
      ...draftSession,
      nodes: draftSession.nodes.map(n =>
        n.id === inputNodeId ? { ...n, inputUrls: urls, inputModel: useModel } : n,
      ),
    };
    setSessionBoth(draftSession);

    // 4. 持久化（一次性整个 nodes 替换）
    await fetch(`/api/pipeline/${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes: draftSession.nodes }),
    });

    // 5. 注册轮询映射（按 URL 匹配后端 entry）
    parsePollMapRef.current.set(batchId!, { inputNodeId, urlToNode });
  }, [model, setSessionBoth]);

  // ── 从 github 节点选中的链接进入解析流：复用 addInputFlow + submitInput ──
  const submitFromGithub = useCallback(async (urls: string[]) => {
    if (!urls.length) return;
    const inputId = await addInputFlow();
    if (!inputId) return;
    await submitInput(inputId, urls);
  }, [addInputFlow, submitInput]);

  // ── 合并 triage entry → parse 节点 payload ──
  const mergeEntryIntoNode = useCallback((entry: TriageEntry, nodeId: string) => {
    const current = sessionRef.current;
    if (!current) return;
    const payload: ParseNodePayload = {
      entryId: entry.id,
      url: entry.url,
      title: entry.title || entry.url,
      verdict: entry.verdict,
      verdictReason: entry.verdictReason,
      narrative: entry.narrative,
      concepts: entry.concepts,
      sources: entry.sources,
      relatedEntries: entry.relatedEntries,
      delta: entry.delta,
      livePhases: entry.livePhases,
      liveStatus: entry.status === 'done' ? undefined : entry.liveStatus,
      direct: entry.direct,
      tokenUsage: entry.tokenUsage,
    };
    const nextState: PipelineNode['state'] =
      entry.status === 'done' ? 'done' : entry.status === 'error' ? 'error' : 'streaming';
    const nextNodes = current.nodes.map(n =>
      n.id === nodeId
        ? { ...n, state: nextState, parseEntry: { ...n.parseEntry, ...payload }, error: entry.error }
        : n,
    );
    setSessionBoth({ ...current, nodes: nextNodes });
  }, [setSessionBoth]);

  // ── 统一轮询：遍历注册的 batchId，更新 parse 节点 ──
  useEffect(() => {
    const tick = async () => {
      const map = parsePollMapRef.current;
      // 自愈：session 里若存在 streaming 的 parse 节点但轮询映射里没有（页面刷新后常见），
      // 根据 parseEntry.batchId 重新注册，按 URL 匹配后端 entry
      const s = sessionRef.current;
      if (s) {
        const streamingParses = s.nodes.filter(
          n => n.type === 'parse' && n.state === 'streaming' && n.parseEntry?.batchId,
        );
        for (const n of streamingParses) {
          const batchId = n.parseEntry!.batchId!;
          if (!map.has(batchId)) {
            const inputNodeId = n.parent || '';
            const urlToNode = new Map<string, string>();
            for (const m of s.nodes) {
              if (m.type === 'parse' && m.parseEntry?.batchId === batchId && m.parseEntry?.url) {
                urlToNode.set(m.parseEntry.url, m.id);
              }
            }
            map.set(batchId, { inputNodeId, urlToNode });
          }
        }
      }
      if (!map.size) return;
      for (const [batchId, entry] of map.entries()) {
        try {
          const res = await fetch(`/api/triage?batchId=${batchId}`);
          if (!res.ok) {
            // 后端 batch 过期（重启/内存清理）→ 标记节点 error 并停止轮询
            if (res.status === 404) {
              for (const nodeId of entry.urlToNode.values()) {
                const cur = sessionRef.current;
                if (!cur) continue;
                const target = cur.nodes.find(n => n.id === nodeId);
                if (target && target.state === 'streaming') {
                  setSessionBoth({
                    ...cur,
                    nodes: cur.nodes.map(n =>
                      n.id === nodeId
                        ? { ...n, state: 'error', error: '解析批次已过期（后端重启）' }
                        : n,
                    ),
                  });
                }
              }
              map.delete(batchId);
            }
            continue;
          }
          const batch: TriageBatch = await res.json();
          let allDone = true;
          for (const e of batch.entries) {
            const nodeId = entry.urlToNode.get(e.url);
            if (!nodeId) continue;
            mergeEntryIntoNode(e, nodeId);
            if (e.status !== 'done' && e.status !== 'error') allDone = false;
          }
          if (batch.status === 'done' || allDone) {
            // 落库最终 nodes
            const s = sessionRef.current;
            if (s) {
              await fetch(`/api/pipeline/${s.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodes: s.nodes }),
              }).catch(() => {});
            }
            map.delete(batchId);
          }
        } catch {
          /* silent */
        }
      }
    };
    pollTimerRef.current = setInterval(tick, 3000);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    };
  }, [mergeEntryIntoNode]);

  // ── 提问（SSE）──
  const ask = useCallback(
    async (question: string, parentId: string | null, opts?: { branchLabel?: string; isBranch?: boolean }) => {
      const current = sessionRef.current;
      if (!current || !question.trim()) return;

      const { questionPos, answerPos } = computeAskPositions(current, parentId, !!opts?.isBranch);

      try {
        const res = await fetch(`/api/pipeline/${current.id}/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentId,
            question,
            branchLabel: opts?.branchLabel,
            newBranch: !!opts?.isBranch,
            model,
            questionPos,
            answerPos,
          }),
        });

        const reader = res.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              handlePipelineEvent(event);
            } catch {
              /* skip */
            }
          }
        }
      } catch (err) {
        console.error('pipeline ask failed', err);
      } finally {
        setStreamingNodeId(null);
        setToolStatus(null);
      }
    },
    // handlePipelineEvent captures sessionRef.current fresh on each call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model],
  );

  function handlePipelineEvent(event: { type: string; data: unknown }) {
    const current = sessionRef.current;
    if (!current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = event.data as any;

    switch (event.type) {
      case 'session_id':
        setSessionBoth({ ...current, sdkSessionId: data.sdkSessionId });
        break;
      case 'nodes_created': {
        const next: PipelineSession = {
          ...current,
          nodes: [...current.nodes, data.question as PipelineNode, data.answer as PipelineNode],
        };
        setSessionBoth(next);
        setStreamingNodeId((data.answer as PipelineNode).id);
        break;
      }
      case 'tool_status':
        setToolStatus(data.label);
        break;
      case 'replace': {
        const nodeId = data.nodeId as string;
        const content = data.content as string;
        setSessionBoth({
          ...current,
          nodes: current.nodes.map(n =>
            n.id === nodeId ? { ...n, text: content } : n,
          ),
        });
        setToolStatus(null);
        break;
      }
      case 'done': {
        const nodeId = data.nodeId as string;
        const nodePatch = {
          text: (data.text as string) || undefined,
          state: 'done' as const,
          duration: data.duration as string | undefined,
          tokens: data.tokens as number | undefined,
        };
        setSessionBoth({
          ...current,
          nodes: current.nodes.map(n =>
            n.id === nodeId
              ? { ...n, ...nodePatch, text: nodePatch.text ?? n.text }
              : n,
          ),
        });
        setStreamingNodeId(null);
        setToolStatus(null);
        // 同步落盘：state='done' + 元数据，避免刷新后残留 'streaming' 显示"正在生成"
        fetch(`/api/pipeline/${current.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodePatch: { id: nodeId, patch: nodePatch } }),
        }).catch(() => {});
        break;
      }
      case 'error': {
        const nodeId = data.nodeId as string;
        if (nodeId) {
          const patch = { state: 'error' as const, error: data.message as string | undefined };
          setSessionBoth({
            ...current,
            nodes: current.nodes.map(n =>
              n.id === nodeId ? { ...n, ...patch } : n,
            ),
          });
          fetch(`/api/pipeline/${current.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodePatch: { id: nodeId, patch } }),
          }).catch(() => {});
        }
        setStreamingNodeId(null);
        setToolStatus(null);
        break;
      }
    }
  }

  // ── 选区直接存入 Wiki（即选即存，不入暂存）──
  // payload.append: 选已有条目追加；否则按 name+categoryId 新建
  const saveExcerptToWiki = useCallback(async (payload: {
    excerpt: string;
    heading: string;
    name: string;
    categoryId?: string;
    newCategory?: { name: string } | null;
    appendToItemId?: string;
    sourceLink?: WikiSourceLink | null;
  }): Promise<{ ok: true; itemId: string } | { ok: false; error: string }> => {
    const current = sessionRef.current;
    if (!current) return { ok: false, error: 'session 未就绪' };

    // 收集来源：优先用调用方传的（来自当前所在 parse/answer 节点），兜底用首个 parse
    const fallbackLinks: WikiSourceLink[] = current.nodes
      .filter(n => n.type === 'parse' && n.parseEntry?.url && !n.parseEntry.url.startsWith('paste://'))
      .map(n => ({
        url: n.parseEntry!.url,
        title: n.parseEntry!.title || n.parseEntry!.url,
        type: 'original' as const,
      }));
    const sourceLinks = payload.sourceLink ? [payload.sourceLink] : fallbackLinks.slice(0, 1);

    const draft: PipelineDraft = {
      name: payload.name.trim(),
      categoryId: payload.categoryId || '',
      newCategory: payload.newCategory ?? null,
      appendToItemId: payload.appendToItemId,
      sections: [{ heading: payload.heading.trim() || '未命名段落', excerpts: [payload.excerpt] }],
      sourceLinks,
    };

    try {
      const res = await fetch(`/api/pipeline/${current.id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error || '保存失败' };
      // 同步 session.savedWikiItemId 到本地状态（save API 已落盘）
      setSessionBoth({ ...current, savedWikiItemId: json.itemId });
      return { ok: true, itemId: json.itemId };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, [setSessionBoth]);

  // 删除节点：级联删除其所有后代节点
  // 若某分支（branchIdx）在删除后已无任何 question/answer 节点，该分支的 SDK session 一并作废
  const deleteNode = useCallback(async (nodeId: string) => {
    const current = sessionRef.current;
    if (!current) return;
    // BFS 计算要删的 id 集合：目标 + 所有后代
    const toDelete = new Set<string>([nodeId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of current.nodes) {
        if (n.parent && toDelete.has(n.parent) && !toDelete.has(n.id)) {
          toDelete.add(n.id);
          grew = true;
        }
      }
    }
    const nextNodes = current.nodes.filter(n => !toDelete.has(n.id));

    // 找出"删完后已无 Q/A 节点"的 branchIdx：这些分支的 SDK session 要清理
    const activeBranchIdxs = new Set<number>();
    for (const n of nextNodes) {
      if (n.type === 'question' || n.type === 'answer') {
        activeBranchIdxs.add(n.branchIdx ?? 0);
      }
    }
    const knownBranchIdxs = new Set<number>();
    if (current.branchSessionIds) {
      for (const k of Object.keys(current.branchSessionIds)) knownBranchIdxs.add(Number(k));
    }
    if (current.sdkSessionId) knownBranchIdxs.add(0);
    const clearBranchSessionIds = [...knownBranchIdxs].filter(i => !activeBranchIdxs.has(i));

    // 前端状态也同步清孤儿 sid
    const nextBranchSessionIds = current.branchSessionIds
      ? Object.fromEntries(
          Object.entries(current.branchSessionIds).filter(([k]) => activeBranchIdxs.has(Number(k))),
        )
      : undefined;
    const nextSdkSessionId = clearBranchSessionIds.includes(0) ? undefined : current.sdkSessionId;

    setSessionBoth({
      ...current,
      nodes: nextNodes,
      branchSessionIds: nextBranchSessionIds && Object.keys(nextBranchSessionIds).length > 0
        ? nextBranchSessionIds
        : undefined,
      sdkSessionId: nextSdkSessionId,
    });
    await fetch(`/api/pipeline/${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: nextNodes,
        clearBranchSessionIds: clearBranchSessionIds.length > 0 ? clearBranchSessionIds : undefined,
      }),
    });
  }, [setSessionBoth]);

  // ── 实验节点：挂在 answer 节点右侧 ──
  // 素材只取 answer 文本，不再选 Wiki；节点内对话封闭，不展开成 Q/A
  const startExperiment = useCallback(async (answerNodeId: string): Promise<string | null> => {
    const current = sessionRef.current;
    if (!current) return null;
    const answer = current.nodes.find(n => n.id === answerNodeId);
    if (!answer || answer.type !== 'answer') return null;
    // 同一 answer 已起过实验：复用
    const existing = current.nodes.find(n => n.parent === answerNodeId && n.type === 'experiment');
    if (existing) return existing.id;

    const seedTitle = answer.text.split('\n').find(l => l.trim())?.slice(0, 60) || '';
    const payload: ExperimentNodePayload = {
      sourceNodeId: answerNodeId,
      seedTitle,
      seedText: answer.text,
      sdkSessionId: null,
      model,
      messages: [],
      cozeRuns: [],
      toolTraces: [],
    };
    const parseX = (answer.x ?? TRUNK_X) + NODE_W + COL_GAP;
    const parseY = answer.y ?? FLOW_Y_BASE;
    const node: PipelineNode = {
      id: nextNodeId(current),
      type: 'experiment',
      state: 'done',
      text: seedTitle,
      parent: answerNodeId,
      branchIdx: answer.branchIdx,
      flowIdx: answer.flowIdx,
      x: parseX,
      y: parseY,
      w: NODE_W,
      createdAt: nowClock(),
      model,
      experimentPayload: payload,
    };
    setSessionBoth({ ...current, nodes: [...current.nodes, node] });
    await fetch(`/api/pipeline/${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeAdd: node }),
    }).catch(() => {});
    return node.id;
  }, [model, setSessionBoth]);

  // experiment 节点的进行中运行引用（用于中止）
  const experimentAbortRef = useRef<Map<string, AbortController>>(new Map());

  const patchExperimentPayload = useCallback(async (nodeId: string, patch: Partial<ExperimentNodePayload>) => {
    const current = sessionRef.current;
    if (!current) return;
    const node = current.nodes.find(n => n.id === nodeId);
    if (!node?.experimentPayload) return;
    const merged: ExperimentNodePayload = { ...node.experimentPayload, ...patch };
    const nextNodes = current.nodes.map(n => n.id === nodeId ? { ...n, experimentPayload: merged } : n);
    setSessionBoth({ ...current, nodes: nextNodes });
    await fetch(`/api/pipeline/${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodePatch: { id: nodeId, patch: { experimentPayload: merged } } }),
    }).catch(() => {});
  }, [setSessionBoth]);

  const sendExperimentMessage = useCallback(async (nodeId: string, message: string) => {
    if (!message.trim()) return;
    const current = sessionRef.current;
    if (!current) return;
    const node = current.nodes.find(n => n.id === nodeId);
    if (!node?.experimentPayload) return;

    const userMsg: ChatMessage = { role: 'user', content: message.trim(), timestamp: Date.now() };
    const history = node.experimentPayload.messages;
    const startSessionId = node.experimentPayload.sdkSessionId ?? null;
    const runModel = node.experimentPayload.model ?? model;

    // 先把 user 消息推入 payload + 节点进入 streaming
    const payloadAfterUser: ExperimentNodePayload = {
      ...node.experimentPayload,
      messages: [...history, userMsg],
    };
    setSessionBoth({
      ...current,
      nodes: current.nodes.map(n => n.id === nodeId
        ? { ...n, state: 'streaming', experimentPayload: payloadAfterUser }
        : n),
    });
    setStreamingNodeId(nodeId);
    setToolStatus(null);

    const abort = new AbortController();
    experimentAbortRef.current.set(nodeId, abort);

    // 流内累积（不落库，结束时一次性落库）
    let streamingSessionId: string | null = startSessionId;
    let resolvedModel: string | undefined;
    let assistantText = '';
    const cozeRuns: CozeRun[] = [...(node.experimentPayload.cozeRuns || [])];
    const toolTraces: ExperimentToolTrace[] = [...(node.experimentPayload.toolTraces || [])];
    const pushCozeStart = (run: CozeRun) => {
      cozeRuns.push(run);
      // 实时刷新到 payload 以便 Sheet 可见
      const s = sessionRef.current;
      if (!s) return;
      setSessionBoth({
        ...s,
        nodes: s.nodes.map(n => n.id === nodeId && n.experimentPayload
          ? { ...n, experimentPayload: { ...n.experimentPayload, cozeRuns: [...cozeRuns] } }
          : n),
      });
    };
    const patchCoze = (id: string, patch: Partial<CozeRun>) => {
      const idx = cozeRuns.findIndex(r => r.id === id);
      if (idx >= 0) cozeRuns[idx] = { ...cozeRuns[idx], ...patch };
      const s = sessionRef.current;
      if (!s) return;
      setSessionBoth({
        ...s,
        nodes: s.nodes.map(n => n.id === nodeId && n.experimentPayload
          ? { ...n, experimentPayload: { ...n.experimentPayload, cozeRuns: [...cozeRuns] } }
          : n),
      });
    };

    try {
      const res = await fetch('/api/experiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedText: node.experimentPayload.seedText,
          seedTitle: node.experimentPayload.seedTitle,
          message: message.trim(),
          history,
          sessionId: startSessionId,
          model: runModel,
        }),
        signal: abort.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('no stream');
      const decoder = new TextDecoder();
      let buffer = '';

      const parseEvent = (line: string) => {
        if (!line.startsWith('data: ')) return;
        let event: { type: string; data: Record<string, unknown> };
        try { event = JSON.parse(line.slice(6)); } catch { return; }
        const data = event.data || {};
        switch (event.type) {
          case 'session':
            if (typeof data.sessionId === 'string') streamingSessionId = data.sessionId;
            break;
          case 'resolved_model':
            if (typeof data.model === 'string') resolvedModel = data.model;
            break;
          case 'text':
            if (typeof data.content === 'string') {
              assistantText += data.content;
              setExperimentStreamingText(assistantText);
              setToolStatus(null);
            }
            break;
          case 'tool_status':
            if (typeof data.label === 'string') setToolStatus(data.label);
            break;
          case 'tool_trace':
            toolTraces.push({
              tool: String(data.tool || ''),
              detail: String(data.detail || ''),
              timestamp: Number(data.timestamp || Date.now()),
            });
            break;
          case 'coze_run_start':
            pushCozeStart({
              id: String(data.id),
              command: String(data.command || ''),
              status: 'running',
              startedAt: Number(data.startedAt || Date.now()),
              stdout: '',
              stderr: '',
            });
            setToolStatus('coze 运行中...');
            break;
          case 'coze_run_end':
            patchCoze(String(data.id), {
              status: data.status === 'failed' ? 'failed' : 'success',
              endedAt: Number(data.endedAt || Date.now()),
              stdout: typeof data.output === 'string' ? data.output : '',
            });
            setToolStatus(null);
            break;
          case 'aborted':
            // 把 running 的 coze 标 failed
            cozeRuns.forEach((r, i) => {
              if (r.status === 'running') cozeRuns[i] = { ...r, status: 'failed', endedAt: Date.now() };
            });
            break;
          case 'error':
            throw new Error(String(data.message || 'experiment error'));
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) parseEvent(buffer.trim());
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        for (const line of lines) parseEvent(line);
      }

      // 落库：assistant 消息 + coze + traces + sdkSessionId
      const finalMessages = assistantText
        ? [...payloadAfterUser.messages, { role: 'assistant' as const, content: assistantText, timestamp: Date.now() }]
        : payloadAfterUser.messages;
      await patchExperimentPayload(nodeId, {
        messages: finalMessages,
        cozeRuns,
        toolTraces,
        sdkSessionId: streamingSessionId,
        resolvedModel,
      });
      // 恢复 state（内存 + 磁盘一起改，否则刷新后 state='streaming' 残留会一直显示"● 对话中"）
      const s = sessionRef.current;
      if (s) {
        setSessionBoth({
          ...s,
          nodes: s.nodes.map(n => n.id === nodeId ? { ...n, state: 'done' } : n),
        });
        await fetch(`/api/pipeline/${s.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodePatch: { id: nodeId, patch: { state: 'done' } } }),
        }).catch(() => {});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 部分回复也存下来
      const finalMessages = assistantText
        ? [...payloadAfterUser.messages, { role: 'assistant' as const, content: assistantText + '\n\n_（中断）_', timestamp: Date.now() }]
        : payloadAfterUser.messages;
      await patchExperimentPayload(nodeId, {
        messages: finalMessages,
        cozeRuns,
        toolTraces,
        sdkSessionId: streamingSessionId,
        resolvedModel,
      });
      const s = sessionRef.current;
      if (s) {
        const finalState: PipelineNode['state'] = abort.signal.aborted ? 'done' : 'error';
        setSessionBoth({
          ...s,
          nodes: s.nodes.map(n => n.id === nodeId
            ? { ...n, state: finalState, error: finalState === 'error' ? msg : undefined }
            : n),
        });
        await fetch(`/api/pipeline/${s.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodePatch: { id: nodeId, patch: { state: finalState, error: finalState === 'error' ? msg : undefined } } }),
        }).catch(() => {});
      }
    } finally {
      experimentAbortRef.current.delete(nodeId);
      setStreamingNodeId(cur => (cur === nodeId ? null : cur));
      setToolStatus(null);
      setExperimentStreamingText('');
    }
  }, [model, patchExperimentPayload, setSessionBoth]);

  const abortExperiment = useCallback(async (nodeId: string) => {
    const current = sessionRef.current;
    if (!current) return;
    const node = current.nodes.find(n => n.id === nodeId);
    const sid = node?.experimentPayload?.sdkSessionId;
    if (sid) {
      fetch('/api/experiment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid }),
      }).catch(() => {});
    }
    experimentAbortRef.current.get(nodeId)?.abort();
  }, []);

  const saveExperimentAsExperience = useCallback(async (
    nodeId: string,
    payload: { title: string; summary: string; content: string },
  ): Promise<{ ok: boolean; id?: string; error?: string }> => {
    const current = sessionRef.current;
    if (!current) return { ok: false, error: '无 session' };
    const node = current.nodes.find(n => n.id === nodeId);
    if (!node?.experimentPayload) return { ok: false, error: '无实验节点' };
    try {
      const res = await fetch('/api/experiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: payload.title,
          summary: payload.summary,
          content: payload.content,
          wikiItemIds: [],
          wikiItemNames: node.experimentPayload.seedTitle ? [node.experimentPayload.seedTitle] : [],
          cozeRuns: node.experimentPayload.cozeRuns,
        }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || '保存失败' };
      await patchExperimentPayload(nodeId, { savedExperienceId: data.id });
      return { ok: true, id: data.id };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, [patchExperimentPayload]);

  return {
    session,
    active: session !== null,
    streamingNodeId,
    toolStatus,
    experimentStreamingText,
    model,
    setModel,
    ensureSession,
    addInputFlow,
    submitInput,
    submitFromGithub,
    startFromEntry,
    ask,
    saveExcerptToWiki,
    deleteNode,
    startExperiment,
    sendExperimentMessage,
    abortExperiment,
    saveExperimentAsExperience,
    exit,
  };
}
