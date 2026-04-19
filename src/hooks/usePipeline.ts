'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  PipelineSession,
  PipelineNode,
  SedimentPoint,
  SedimentMode,
  TriageEntry,
  TriageModel,
} from '@/lib/types';

// 节点自动布局常量（固定摘要卡尺寸）
const TRUNK_X = 80;
const NODE_W = 280;
const NODE_H = 160;
const NODE_GAP = 40;
const BRANCH_DX = 340;

function nowClock() {
  return new Date().toTimeString().slice(0, 8);
}

interface CreateArgs {
  entry: TriageEntry;
  model?: TriageModel;
}

function computePositions(
  session: PipelineSession,
  parentId: string | null,
  isBranch: boolean,
) {
  const parent = parentId ? session.nodes.find(n => n.id === parentId) : null;
  if (!parent) {
    // 画布根主干 — 每条新主干横向错开，避免重叠
    const existingTrunks = session.nodes.filter(
      n => n.parent === null && n.type === 'question',
    ).length;
    const x = TRUNK_X + existingTrunks * BRANCH_DX;
    return {
      questionPos: { x, y: 80, w: NODE_W },
      answerPos: { x, y: 80 + NODE_H + NODE_GAP, w: NODE_W },
    };
  }

  const parentX = parent.x ?? TRUNK_X;
  const parentY = parent.y ?? 80;

  const dx = isBranch
    ? (() => {
        const siblings = session.nodes.filter(n => n.parent === parentId);
        const dir = siblings.length % 2 === 0 ? -1 : 1;
        return BRANCH_DX * Math.ceil((siblings.length + 1) / 2) * dir;
      })()
    : 0;

  const baseX = parentX + dx;
  const baseY = parentY + NODE_H + NODE_GAP;
  return {
    questionPos: { x: baseX, y: baseY, w: NODE_W },
    answerPos: { x: baseX, y: baseY + NODE_H + NODE_GAP, w: NODE_W },
  };
}

export function usePipeline() {
  const [session, setSession] = useState<PipelineSession | null>(null);
  const [streamingNodeId, setStreamingNodeId] = useState<string | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [model, setModelState] = useState<TriageModel>('sonnet');
  const sessionRef = useRef<PipelineSession | null>(null);

  const setSessionBoth = (next: PipelineSession | null) => {
    sessionRef.current = next;
    setSession(next);
  };

  // 从 triage entry 创建新 pipeline session
  const startFromEntry = useCallback(
    async ({ entry, model: m }: CreateArgs) => {
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
    [],
  );

  const exit = useCallback(() => {
    setSessionBoth(null);
    setStreamingNodeId(null);
    setToolStatus(null);
  }, []);

  const setModel = useCallback((m: TriageModel) => setModelState(m), []);

  // ── 提问（SSE）──
  const ask = useCallback(
    async (question: string, parentId: string | null, opts?: { branchLabel?: string; isBranch?: boolean }) => {
      const current = sessionRef.current;
      if (!current || !question.trim()) return;

      const { questionPos, answerPos } = computePositions(current, parentId, !!opts?.isBranch);

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
    // handlePipelineEvent captures sessionRef.current fresh on each call, so its
    // identity can change without invalidating ask.
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
  // 默认 full 模式：取 Q+A 完整原文（被标节点 + 配对节点），无截断
  // custom 模式：由调用方（标记弹框）传入手动框选的多段 excerpts
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
      // full 模式：找配对节点（答对问、问对答），拼成一段 Q+A 原文
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
  }, []);

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
  }, []);

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
  }, []);

  return {
    session,
    active: session !== null,
    streamingNodeId,
    toolStatus,
    model,
    setModel,
    startFromEntry,
    ask,
    markNode,
    unmarkNode,
    removeSediment,
    exit,
  };
}
