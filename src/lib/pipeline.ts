// 深入追问 Pipeline — 分支画布的后端 agent 运行时
// 设计要点：
//   - 所有分支共享一个 Claude Agent SDK session（pipeline.sdkSessionId）
//   - 每轮提问在 user prompt 里用 [[parent context: nX]] 标记让模型识别分支父节点
//   - 问题 + 回答分别作为 PipelineNode 持久化；回答节点按 state=streaming → done 流转
//   - 持久化发生在节点创建（入库问题/占位答复）与最终 done（落定答复正文）两处

import { query } from '@anthropic-ai/claude-agent-sdk';
import { TriageModel, PipelineSession, PipelineNode, TriageConcept, SourceInfo, resolveModelId } from './types';
import { reportFromSDKMessage } from './token-report';
import { savePipelineSession } from './storage';

interface AskContextSnapshot {
  title: string;
  url: string;
  narrative?: string;
  concepts?: TriageConcept[];
  sources?: SourceInfo[];
}

type EventSender = (type: string, data: unknown) => void;

const SYSTEM_PROMPT = `你是一个技术深度研究助手，正在一个「分支式追问」画布上陪用户深挖。

## 画布规则
- 每轮 user prompt 里会用 \`[[parent context: nX]]\` 标出本次追问挂在哪个父节点下；
- 其下会列出该父节点至根节点的完整问答链路（祖先上下文），按时间顺序；
- 你的回答只针对当前这一次问题，但应基于它所在的这条分支上下文来作答；
- 不同分支之间不要串线——如果当前问题的父节点不是上一条问答，请忽略其他分支的细节。

## 工具使用
- 上下文里会给一手来源 URL，必要时用 WebFetch 读取最相关的 1-2 个来源；
- 如果来源不够，用 WebSearch 补充搜索（最多 1 次）；
- 工具调用控制在 2-3 次以内。

## 输出要求
- 中文 markdown，单次回答 250-500 字，紧凑不灌水；
- 只回答当前这一问，不要在结尾列后续方向或延伸阅读；
- 如果题面是在之前回答的基础上做细化，直接深入、不要重复铺垫；
- 内联来源用 \`[[n]]\` 角标，例如 \`[[1]] PR #121845\`，同时把具体链接/文件名写进正文。`;

// ── 内存中的活跃会话缓存：pipeline.id → { lastAccess }
// SDK session 已经持久化到 pipeline.sdkSessionId，这里只做节流、不做唯一来源
const activePipelines = new Map<string, { lastAccess: number }>();
const PIPELINE_TTL = 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of activePipelines) {
    if (now - entry.lastAccess > PIPELINE_TTL) activePipelines.delete(id);
  }
}, 5 * 60 * 1000);

// 找到当前追问最近的 parse 祖先节点，提取其 entry 作为上下文
// 若找不到（纯追问 session），退化到 session.entrySnapshot（老数据兼容）
function findAncestorParseContext(
  session: PipelineSession,
  parentId: string | null,
): AskContextSnapshot | null {
  const byId = new Map(session.nodes.map(n => [n.id, n]));
  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const n = byId.get(cursor);
    if (!n) break;
    if (n.type === 'parse' && n.parseEntry) {
      const p = n.parseEntry;
      return {
        title: p.title,
        url: p.url,
        narrative: p.narrative,
        concepts: p.concepts,
        sources: p.sources,
      };
    }
    cursor = n.parent;
  }
  if (session.entrySnapshot) {
    return {
      title: session.entrySnapshot.title,
      url: session.entrySnapshot.url,
      narrative: session.entrySnapshot.narrative,
      concepts: session.entrySnapshot.concepts,
      sources: session.entrySnapshot.sources,
    };
  }
  return null;
}

// 构建首轮的完整上下文（只在 pipeline 首次提问时使用）
function buildInitialContext(session: PipelineSession, parentId: string | null): string {
  const snap = findAncestorParseContext(session, parentId);
  if (!snap) return '（本次追问无上游解析节点，直接基于问题作答即可）';
  const parts: string[] = [];
  parts.push('## 来源文章');
  parts.push(`标题: ${snap.title}`);
  parts.push(`URL: ${snap.url}`);
  if (snap.narrative) parts.push(`\n解析叙述:\n${snap.narrative}`);
  if (snap.concepts?.length) {
    parts.push('\n识别到的技术:');
    for (const c of snap.concepts) {
      parts.push(`- **${c.name}** (${c.role || 'component'}): ${c.root}`);
      if (c.sourceUrl) parts.push(`  一手来源: ${c.sourceUrl}`);
    }
  }
  if (snap.sources?.length) {
    parts.push('\n来源链接:');
    for (const s of snap.sources) parts.push(`- [${s.type}] ${s.title}: ${s.url}`);
  }
  return parts.join('\n');
}

// 沿 parent 指针回溯到根，返回从根 → 父节点的有序节点链
function buildAncestorChain(session: PipelineSession, parentId: string | null): PipelineNode[] {
  if (!parentId) return [];
  const byId = new Map(session.nodes.map(n => [n.id, n]));
  const chain: PipelineNode[] = [];
  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const n = byId.get(cursor);
    if (!n) break;
    chain.unshift(n);
    cursor = n.parent;
  }
  return chain;
}

// 把父节点链格式化进 user prompt
// 只渲染 question/answer 节点；input/parse 节点已在初始上下文中呈现，这里跳过
function renderParentContext(session: PipelineSession, parentId: string | null): string {
  if (!parentId) return '';
  const chain = buildAncestorChain(session, parentId).filter(
    n => n.type === 'question' || n.type === 'answer',
  );
  if (chain.length === 0) return '';
  const parts: string[] = [];
  parts.push(`[[parent context: ${parentId}]]`);
  parts.push('以下是这条分支从根到父节点的问答链（最旧 → 最新）：');
  parts.push('');
  for (const node of chain) {
    const tag = node.type === 'question' ? `Q[${node.id}]` : `A[${node.id}]`;
    parts.push(`── ${tag} ──`);
    parts.push(node.text.trim());
    parts.push('');
  }
  parts.push('── 下面是针对父节点的新一轮追问 ──');
  return parts.join('\n');
}

// 生成下一个节点 id（n1 / n2 / ...）
function nextNodeId(session: PipelineSession): string {
  let max = 0;
  for (const n of session.nodes) {
    const m = n.id.match(/^n(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `n${max + 1}`;
}

// 简单的时间字符串
function nowClock(): string {
  return new Date().toTimeString().slice(0, 8);
}

export interface AskArgs {
  session: PipelineSession;
  parentId: string | null;    // 挂在哪个节点下（null = 画布新根）
  question: string;
  model?: TriageModel;
  branchLabel?: string;        // 新开分支的标签（可选）
  questionPos?: { x: number; y: number; w?: number };
  answerPos?: { x: number; y: number; w?: number };
}

// 运行一次分支提问：创建 question + answer 节点，流式生成答复，done 后落库
export async function runPipelineAsk(
  args: AskArgs,
  send: EventSender,
): Promise<void> {
  const { session, parentId, question } = args;
  const model = args.model || session.model || 'sonnet';

  if (!question.trim()) {
    send('error', { message: '请输入问题' });
    return;
  }

  // ── 1. 分配 id + 建节点
  const parentNode = parentId ? session.nodes.find(n => n.id === parentId) : null;
  const branchIdx = parentNode?.branchIdx ?? 0;
  const questionId = nextNodeId(session);
  const questionNode: PipelineNode = {
    id: questionId,
    type: 'question',
    state: 'done',
    text: question.trim(),
    parent: parentId,
    branchIdx,
    branchLabel: args.branchLabel,
    x: args.questionPos?.x,
    y: args.questionPos?.y,
    w: args.questionPos?.w,
    createdAt: nowClock(),
    model,
  };
  session.nodes.push(questionNode);
  const answerId = nextNodeId(session);
  const answerNode: PipelineNode = {
    id: answerId,
    type: 'answer',
    state: 'streaming',
    text: '',
    parent: questionId,
    branchIdx,
    x: args.answerPos?.x,
    y: args.answerPos?.y,
    w: args.answerPos?.w,
    createdAt: nowClock(),
    model,
  };
  session.nodes.push(answerNode);

  await savePipelineSession(session);
  send('nodes_created', { question: questionNode, answer: answerNode });

  // ── 2. 组 prompt
  const parentContext = renderParentContext(session, parentId);
  const isFirstTurn = !session.sdkSessionId;
  let userPrompt: string;
  if (isFirstTurn) {
    userPrompt = [
      '## 初步解析',
      buildInitialContext(session, parentId),
      '',
      parentContext || '（这是这一 session 的第一个问题，没有父节点）',
      '',
      `Q[${questionId}]: ${question.trim()}`,
    ].join('\n');
  } else {
    userPrompt = [
      parentContext || `[[parent context: none]] 这是挂在画布根上的新问题。`,
      '',
      `Q[${questionId}]: ${question.trim()}`,
    ].join('\n');
  }

  // ── 3. 跑 agent
  const abortController = new AbortController();
  const t0 = Date.now();
  let lastText = '';
  let capturedSdkId: string | null = session.sdkSessionId || null;
  let turnCount = 0;
  let totalOutputTokens = 0;

  try {
    const queryOptions: Record<string, unknown> = {
      systemPrompt: SYSTEM_PROMPT,
      model: resolveModelId(model),
      cwd: process.cwd(),
      allowedTools: ['WebFetch', 'WebSearch'],
      disallowedTools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      maxTurns: 8,
      abortController,
      persistSession: true,
    };
    if (session.sdkSessionId) {
      queryOptions.resume = session.sdkSessionId;
    }

    console.log(`[pipeline-log] ask pipeline=${session.id} parent=${parentId ?? 'root'} resume=${!isFirstTurn} model=${resolveModelId(model)} prompt_chars=${userPrompt.length}`);

    const q = query({
      prompt: userPrompt,
      options: queryOptions as Parameters<typeof query>[0]['options'],
    });

    for await (const message of q) {
      reportFromSDKMessage('aidigest', message);
      activePipelines.set(session.id, { lastAccess: Date.now() });

      if (!capturedSdkId) {
        const sid = (message as { session_id?: string }).session_id;
        if (sid) {
          capturedSdkId = sid;
          session.sdkSessionId = sid;
          send('session_id', { sdkSessionId: sid });
        }
      }

      if (message.type === 'assistant') {
        turnCount++;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const usage = (message.message as any)?.usage;
        if (usage?.output_tokens) totalOutputTokens += usage.output_tokens;
        const blocks = message.message?.content || [];
        if (Array.isArray(blocks)) {
          const text = blocks
            .filter((b: { type: string }) => b.type === 'text')
            .map((b: { type: string; text?: string }) => b.text ?? '')
            .join('');
          const hasToolUse = blocks.some((b: { type: string }) => b.type === 'tool_use');

          if (hasToolUse) {
            for (const block of blocks) {
              if (block.type === 'tool_use' && typeof block.name === 'string') {
                const labels: Record<string, string> = {
                  WebSearch: '正在搜索...',
                  WebFetch: '正在抓取...',
                };
                if (labels[block.name]) {
                  send('tool_status', { nodeId: answerId, label: labels[block.name] });
                }
              }
            }
          }

          if (text) {
            lastText = text;
            if (!hasToolUse) {
              send('replace', { nodeId: answerId, content: text });
            }
          }
        }
      }

      if (message.type === 'result') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg = message as any;
        if (msg.subtype === 'success' && msg.result) {
          lastText = msg.result;
          send('replace', { nodeId: answerId, content: msg.result });
        } else if (msg.subtype === 'error_max_turns') {
          const fallback = msg.result || lastText;
          if (fallback) {
            lastText = fallback;
            send('replace', { nodeId: answerId, content: fallback });
          } else {
            lastText = '回答生成超时，请重试或换一个问题。';
            send('replace', { nodeId: answerId, content: lastText });
          }
        }
      }
    }

    // ── 4. 落库
    const duration = `${((Date.now() - t0) / 1000).toFixed(1)}s`;
    const finalText = lastText || '（未生成内容）';
    const idx = session.nodes.findIndex(n => n.id === answerId);
    if (idx >= 0) {
      session.nodes[idx] = {
        ...session.nodes[idx],
        text: finalText,
        state: 'done',
        duration,
        tokens: totalOutputTokens || undefined,
      };
    }
    await savePipelineSession(session);
    send('done', { nodeId: answerId, duration, tokens: totalOutputTokens, text: finalText, turns: turnCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const idx = session.nodes.findIndex(n => n.id === answerId);
    if (idx >= 0) {
      session.nodes[idx] = { ...session.nodes[idx], state: 'error', error: msg };
    }
    await savePipelineSession(session).catch(() => {});
    send('error', { nodeId: answerId, message: msg });
  }
}

export function touchPipeline(id: string): void {
  activePipelines.set(id, { lastAccess: Date.now() });
}
