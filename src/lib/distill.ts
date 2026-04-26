import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { ChatMessage, TriageModel, resolveModelId, DistillFile } from './types';
import { reportFromSDKMessage } from './token-report';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// 经验沉淀 agent：根据导入的文档 + 多轮对话，整理出可沉淀为「经验」的产物
// 与 experiment.ts 区别：不调 coze、不需要 sandbox 执行；只做"读资料 + 对话整理 + 写 markdown"

type EventSender = (type: string, data: unknown) => void;

interface DistillSession {
  id: string;
  workDir: string;                 // 临时目录：用于把文件落地，方便 agent Read
  sdkSessionId: string | null;
  model: string;
  filesIndex: { name: string; size: number; mime?: string; localPath: string }[];
  currentAbort: AbortController | null;
}

const sessions = new Map<string, { session: DistillSession; lastAccess: number }>();
const SESSION_TTL = 60 * 60 * 1000; // 沉淀会话保活时间长一点（用户可能慢慢聊）
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.lastAccess > SESSION_TTL) {
      cleanupSession(entry.session);
      sessions.delete(id);
    }
  }
}, 60 * 1000);

async function cleanupSession(session: DistillSession): Promise<void> {
  await fs.rm(session.workDir, { recursive: true, force: true }).catch(() => {});
  if (session.sdkSessionId) {
    try {
      const homeDir = os.homedir();
      const projectsDir = path.join(homeDir, '.claude', 'projects');
      const dirName = session.workDir.replace(/\//g, '-').replace(/^-/, '');
      await fs.rm(path.join(projectsDir, dirName), { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}

export async function destroyDistillSession(sessionId: string): Promise<boolean> {
  const entry = sessions.get(sessionId);
  if (!entry) return false;
  entry.session.currentAbort?.abort();
  await cleanupSession(entry.session);
  sessions.delete(sessionId);
  return true;
}

// 中止当前运行（保留会话，可继续对话）
export async function abortDistillRun(sessionId: string): Promise<boolean> {
  const entry = sessions.get(sessionId);
  if (!entry) return false;
  entry.session.currentAbort?.abort();
  entry.session.currentAbort = null;
  return true;
}

function extractText(message: SDKMessage): string | null {
  if (message.type === 'assistant') {
    const blocks = message.message?.content;
    if (Array.isArray(blocks)) {
      return blocks
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { type: string; text?: string }) => b.text ?? '')
        .join('');
    }
  }
  return null;
}

function formatHistory(history: ChatMessage[]): string {
  if (history.length === 0) return '';
  const lines = history.map(m =>
    m.role === 'user' ? `用户: ${m.content}` : `助手: ${m.content}`
  );
  return `\n之前的对话:\n${lines.join('\n')}\n`;
}

function buildDistillPrompt(session: DistillSession): string {
  const fileList = session.filesIndex.length === 0
    ? '（用户尚未导入文档，纯对话沉淀）'
    : session.filesIndex.map((f, i) =>
        `${i + 1}. ${f.name}（${f.size} bytes${f.mime ? ' · ' + f.mime : ''}） → ${f.localPath}`,
      ).join('\n');

  return `你是「经验沉淀助手」。用户导入若干文档，希望你结合这些资料 + 多轮对话需求，**把分散的信息整理成一条可复用的"经验"**，最终用户会一键存入"经验区"。

## 用户导入的文档

${fileList}

文件已落地到工作目录，需要时用 \`Read\` 工具读取（Read 接受绝对路径）。文件可能很长，按需 grep / 选择性读，避免一次性吞下。

## 你的工作方式

1. **先读关键资料**：根据用户的对话需求，挑要读的文件用 Read 打开，不要凭文件名瞎猜内容。
2. **理解用户意图**：搞清楚用户想沉淀什么样的经验——方法论？操作步骤？避坑清单？模式总结？不同诉求决定不同结构。
3. **多轮对话推进**：对话过程中可以问用户取舍、确认重点；不要一上来就出大段终稿。先确认方向，再细化。
4. **必要时查一手**：如果文件里出现具体技术名/论文/工具，可以用 WebFetch 抓对应链接补足背景，但**不要凭印象**。
5. **沉淀，而非复述**：经验是"下次遇到类似场景能直接用"的东西——抽象出原则、流程、清单、模式、反例。**不要把文档原文摘抄一遍**。
6. **最终产物输出在对话里**：当用户说"整理一下" / "出最终版"时，用 markdown 输出完整的经验条目，结构清晰（建议含：标题 / 一句话概要 / 适用场景 / 核心要点 / 操作清单 / 注意事项）。**完整输出在对话消息中**，不要写文件。

## 关于"保存为经验"（重要）

**你不负责持久化**。用户在界面上点「保存为经验」按钮时，系统会把你最近一条对话消息（markdown）作为正文存入经验区。

因此：
- **不要** 用 Write 工具把最终产物写进 \`experience.md\` / \`output.md\` / 任何归档文件
- **不要** 说"我已写入 xxx.md，请查看"——那是临时文件，用户拿不到
- **要** 把最终 markdown **完整、自包含地输出在对话消息里**

Write 工具**只用于**：草稿临时记录、整理过程性笔记，**不是**最终交付。

## 工作目录

${session.workDir}（临时沙盒，用户看不到）

## 工具

- **Read**：读取已导入的文档（主力工具）
- **WebFetch**：抓取 URL（补一手链接用）
- **WebSearch**：兜底搜索
- **Grep / Glob**：在工作目录里检索文档片段
- **Write / Edit**：仅做过程性笔记，不是终稿

## 语言

用中文与用户交流。`;
}

interface CreateSessionInput {
  files: DistillFile[];           // 客户端已解析过的文件（含 content）
}

async function getOrCreateSession(
  sessionId: string | null,
  input: CreateSessionInput,
  model: string,
): Promise<DistillSession> {
  if (sessionId && sessions.has(sessionId)) {
    const entry = sessions.get(sessionId)!;
    entry.lastAccess = Date.now();
    // 同步可能新增的文件（按 name 去重）
    await syncFilesToWorkDir(entry.session, input.files);
    return entry.session;
  }

  const id = `distill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(os.tmpdir(), `aidigest-distill-${id}`);
  await fs.mkdir(workDir, { recursive: true });

  const session: DistillSession = {
    id,
    workDir,
    sdkSessionId: null,
    model,
    filesIndex: [],
    currentAbort: null,
  };
  await syncFilesToWorkDir(session, input.files);

  sessions.set(id, { session, lastAccess: Date.now() });
  return session;
}

// 把客户端传来的文件落地到工作目录，构建 filesIndex（供 system prompt 引用绝对路径）
// 已落地的同名文件不重复写
async function syncFilesToWorkDir(session: DistillSession, files: DistillFile[]): Promise<void> {
  const existing = new Set(session.filesIndex.map(f => f.name));
  for (const f of files) {
    if (existing.has(f.name)) continue;
    const safeName = f.name.replace(/[^\w.一-龥-]+/g, '_').slice(0, 200);
    const localPath = path.join(session.workDir, safeName);
    try {
      await fs.writeFile(localPath, f.content, 'utf-8');
      session.filesIndex.push({
        name: f.name,
        size: f.size,
        mime: f.mime,
        localPath,
      });
    } catch { /* 单个文件失败不阻塞会话 */ }
  }
}

export async function runDistill(
  input: CreateSessionInput,
  message: string,
  history: ChatMessage[],
  sessionId: string | null,
  model: string,
  send: EventSender,
): Promise<void> {
  const session = await getOrCreateSession(sessionId, input, model);

  send('session', {
    sessionId: session.id,
    fileCount: session.filesIndex.length,
    model: session.model,
  });

  if (message === '__init__') {
    send('complete', { content: '' });
    return;
  }

  const isResume = !!session.sdkSessionId;
  const prompt = isResume ? message : `${formatHistory(history)}\n${message}`;

  session.currentAbort?.abort();
  const abortController = new AbortController();
  session.currentAbort = abortController;

  let fullReply = '';

  try {
    const queryOptions: Record<string, unknown> = {
      systemPrompt: buildDistillPrompt(session),
      model: resolveModelId(session.model as TriageModel),
      cwd: session.workDir,
      allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      maxTurns: 20,
      abortController,
      persistSession: true,
    };
    if (session.sdkSessionId) {
      queryOptions.resume = session.sdkSessionId;
    }

    const q = query({
      prompt,
      options: queryOptions as Parameters<typeof query>[0]['options'],
    });

    const seenTraceKeys = new Set<string>();
    const toolLabels: Record<string, string> = {
      Read: '读取文档...',
      WebSearch: '搜索中...',
      WebFetch: '抓取网页...',
      Grep: '检索内容...',
      Glob: '查找文件...',
      Write: '记录笔记...',
      Edit: '修改笔记...',
    };

    for await (const msg of q) {
      reportFromSDKMessage('aidigest', msg);

      if (!session.sdkSessionId) {
        const sid = (msg as { session_id?: string }).session_id;
        if (sid) session.sdkSessionId = sid;
      }

      if (msg.type === 'system') {
        const sys = msg as { subtype?: string; model?: string };
        if (sys.subtype === 'init' && typeof sys.model === 'string') {
          send('resolved_model', { model: sys.model });
        }
      }

      if (msg.type === 'assistant') {
        const blocks = msg.message?.content;
        if (Array.isArray(blocks)) {
          for (const block of blocks) {
            if (block.type !== 'tool_use') continue;
            const name = typeof block.name === 'string' ? block.name : '';
            const input = block.input as Record<string, unknown> | undefined;
            const useId = typeof (block as { id?: string }).id === 'string' ? (block as { id: string }).id : '';

            let detail = '';
            if (name === 'Read' && input?.file_path) detail = String(input.file_path);
            else if (name === 'Write' && input?.file_path) detail = String(input.file_path);
            else if (name === 'Edit' && input?.file_path) detail = String(input.file_path);
            else if (name === 'WebSearch' && input?.query) detail = String(input.query);
            else if (name === 'WebFetch' && input?.url) detail = String(input.url);
            else if (name === 'Glob' && input?.pattern) detail = String(input.pattern);
            else if (name === 'Grep' && input?.pattern) detail = String(input.pattern);

            const traceKey = `${name}::${detail}::${useId}`;
            if (detail && !seenTraceKeys.has(traceKey)) {
              seenTraceKeys.add(traceKey);
              if (toolLabels[name]) send('tool_status', { tool: name, label: toolLabels[name] });
              send('tool_trace', { tool: name, detail, timestamp: Date.now() });
            } else if (!detail && toolLabels[name]) {
              send('tool_status', { tool: name, label: toolLabels[name] });
            }
          }
        }
      }

      const text = extractText(msg);
      if (text) {
        fullReply += text;
        send('text', { content: text });
      }
    }

    send('complete', { content: fullReply });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (abortController.signal.aborted || /abort/i.test(errMsg)) {
      send('aborted', { content: fullReply });
    } else {
      send('error', { message: errMsg });
    }
  } finally {
    if (session.currentAbort === abortController) {
      session.currentAbort = null;
    }
  }
}
