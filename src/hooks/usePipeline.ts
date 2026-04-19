'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  PipelineSession,
  PipelineNode,
  ParseNodePayload,
  SedimentPoint,
  SedimentMode,
  TriageEntry,
  TriageModel,
  TriageBatch,
} from '@/lib/types';

// ── 画布布局常量 ──
// 统一画布：input → parse → Q → A 均为「向右延伸」
export const NODE_W = 280;
export const NODE_H = 160;
const COL_GAP = 64;      // 同一流水平列间距
const ROW_GAP = 40;      // 同流内 parse 子行间距
const BRANCH_DY = NODE_H + ROW_GAP; // 分支上下偏移
const FLOW_ROW = NODE_H * 5 + 160;  // 每条流占据的纵向带宽
const FLOW_Y_BASE = 80;
const TRUNK_X = 80;

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
  const [model, setModelState] = useState<TriageModel>('sonnet');
  const sessionRef = useRef<PipelineSession | null>(null);
  // batchId -> { inputNodeId, urlToNode（按 URL 匹配后端真实 entryId） }
  const parsePollMapRef = useRef<Map<string, {
    inputNodeId: string;
    urlToNode: Map<string, string>;
  }>>(new Map());
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setSessionBoth = useCallback((next: PipelineSession | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  // 确保存在 session：首次进入画布时调用，创建空 session
  const ensureSession = useCallback(async () => {
    if (sessionRef.current) return sessionRef.current;
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

  // ── 提交 input 节点的 URL 列表：创建解析 batch + 并列 parse 占位节点 ──
  const submitInput = useCallback(async (
    inputNodeId: string,
    urls: string[],
    submitModel?: TriageModel,
  ) => {
    const current = sessionRef.current;
    if (!current) return;
    const input = current.nodes.find(n => n.id === inputNodeId);
    if (!input || !urls.length) return;

    const useModel = submitModel || input.inputModel || model;

    // 1. 提交 triage batch
    let batchId: string | null = null;
    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls, model: useModel }),
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
      const node: PipelineNode = {
        id,
        type: 'parse',
        state: 'streaming',
        text: url,
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
          title: url,
          livePhases: [],
          liveStatus: '排队中',
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
        setSessionBoth({
          ...current,
          nodes: current.nodes.map(n =>
            n.id === nodeId
              ? {
                  ...n,
                  text: data.text || n.text,
                  state: 'done',
                  duration: data.duration,
                  tokens: data.tokens,
                }
              : n,
          ),
        });
        setStreamingNodeId(null);
        setToolStatus(null);
        break;
      }
      case 'error': {
        const nodeId = data.nodeId as string;
        if (nodeId) {
          setSessionBoth({
            ...current,
            nodes: current.nodes.map(n =>
              n.id === nodeId ? { ...n, state: 'error', error: data.message } : n,
            ),
          });
        }
        setStreamingNodeId(null);
        setToolStatus(null);
        break;
      }
    }
  }

  // ── 标记/取消标记 ──
  const markNode = useCallback(async (
    nodeId: string,
    options?: {
      text?: string;
      mode?: SedimentMode;
      excerpts?: string[];
      suggestedSection?: string;
    },
  ) => {
    const current = sessionRef.current;
    if (!current) return;
    const node = current.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const mode: SedimentMode = options?.mode ?? 'full';
    const title = options?.text || node.markedAs || node.text.split('\n')[0].slice(0, 60);

    let excerpts: string[];
    if (mode === 'custom' && options?.excerpts?.length) {
      excerpts = options.excerpts;
    } else {
      const paired = node.type === 'answer'
        ? current.nodes.find(n => n.id === node.parent && n.type === 'question')
        : current.nodes.find(n => n.parent === node.id && n.type === 'answer');
      const merged = paired
        ? (node.type === 'answer'
            ? `${paired.text}\n\n${node.text}`
            : `${node.text}\n\n${paired.text}`)
        : node.text;
      excerpts = [merged];
    }

    const sediment: SedimentPoint = {
      id: `s-${Date.now()}`,
      fromNode: nodeId,
      mode,
      text: title,
      excerpts,
      markedAt: nowClock(),
      suggestedSection: options?.suggestedSection ?? '新要点',
      order: current.sediment.length,
    };

    setSessionBoth({
      ...current,
      nodes: current.nodes.map(n =>
        n.id === nodeId ? { ...n, marked: true, markedAs: title } : n,
      ),
      sediment: [...current.sediment, sediment],
    });

    await fetch(`/api/pipeline/${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodePatch: { id: nodeId, patch: { marked: true, markedAs: title } },
        sedimentAdd: sediment,
      }),
    });
  }, [setSessionBoth]);

  const unmarkNode = useCallback(async (nodeId: string) => {
    const current = sessionRef.current;
    if (!current) return;
    const sedId = current.sediment.find(s => s.fromNode === nodeId)?.id;
    setSessionBoth({
      ...current,
      nodes: current.nodes.map(n =>
        n.id === nodeId ? { ...n, marked: false } : n,
      ),
      sediment: current.sediment.filter(s => s.fromNode !== nodeId),
    });
    await fetch(`/api/pipeline/${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodePatch: { id: nodeId, patch: { marked: false } },
        sedimentRemoveId: sedId,
      }),
    });
  }, [setSessionBoth]);

  const removeSediment = useCallback(async (sedimentId: string) => {
    const current = sessionRef.current;
    if (!current) return;
    const s = current.sediment.find(x => x.id === sedimentId);
    setSessionBoth({
      ...current,
      sediment: current.sediment.filter(x => x.id !== sedimentId),
      nodes: s
        ? current.nodes.map(n => (n.id === s.fromNode ? { ...n, marked: false } : n))
        : current.nodes,
    });
    await fetch(`/api/pipeline/${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sedimentRemoveId: sedimentId,
        nodePatch: s ? { id: s.fromNode, patch: { marked: false } } : undefined,
      }),
    });
  }, [setSessionBoth]);

  return {
    session,
    active: session !== null,
    streamingNodeId,
    toolStatus,
    model,
    setModel,
    ensureSession,
    addInputFlow,
    submitInput,
    startFromEntry,
    ask,
    markNode,
    unmarkNode,
    removeSediment,
    exit,
  };
}
