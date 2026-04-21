import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { ChatMessage, TriageModel, resolveModelId } from './types';
import { getWikiItem } from './storage';
import { reportFromSDKMessage } from './token-report';
import { killProcessesByWorkDir, cleanupOrphanWorkDirs } from './process-cleanup';
import { COZE_CLI_GUIDE } from './coze-cli-guide';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

type EventSender = (type: string, data: unknown) => void;

// 实验素材：仅存 wiki 条目的"名字 + 原链接"，不加载正文
interface ExperimentMaterial {
  itemId: string;
  name: string;
  sourceLinks: { url: string; title: string; type?: string }[];
}

// 种子文本：从画布 answer 节点直接起实验，不走 wiki
interface ExperimentSeed {
  title?: string;
  text: string;
}

// 实验会话
interface ExperimentSession {
  id: string;
  materials: ExperimentMaterial[];
  seed: ExperimentSeed | null;     // 与 materials 二选一；非 null 即 seed 模式
  workDir: string;
  sdkSessionId: string | null;
  model: string;
  currentAbort: AbortController | null; // 当前运行的 abort 引用（用于中止）
}

const sessions = new Map<string, { session: ExperimentSession; lastAccess: number }>();
const SESSION_TTL = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.lastAccess > SESSION_TTL) {
      cleanupSession(entry.session);
      sessions.delete(id);
    }
  }
}, 60 * 1000);

// 模块加载时清理上次遗留的孤儿目录（服务器重启 / dev hot-reload 后）
// sessions Map 此时为空，扫到的 aidigest-experiment-* 目录都是孤儿
cleanupOrphanWorkDirs('aidigest-experiment-').catch(() => {});

async function cleanupSession(session: ExperimentSession): Promise<void> {
  // 先 kill 所有相关进程（必须在删目录之前调用，以便 lsof 能兜底）
  await killProcessesByWorkDir(session.workDir);
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

export async function destroyExperimentSession(sessionId: string): Promise<boolean> {
  const entry = sessions.get(sessionId);
  if (!entry) return false;
  entry.session.currentAbort?.abort();
  await cleanupSession(entry.session);
  sessions.delete(sessionId);
  return true;
}

// 中止当前运行：停 SDK query + kill 子进程（不销毁会话，可继续对话）
export async function abortExperimentRun(sessionId: string): Promise<boolean> {
  const entry = sessions.get(sessionId);
  if (!entry) return false;
  entry.session.currentAbort?.abort();
  entry.session.currentAbort = null;
  await killProcessesByWorkDir(entry.session.workDir);
  return true;
}

// 判断命令是否是 coze 调用
export function isCozeCommand(cmd: string): boolean {
  // 匹配 coze 作为命令主体（开头、或 && / ; / | 分隔后、或绝对路径形式）
  return /(?:^|[\s;&|])(?:\/[^\s]*\/)?coze(?:\s|$)/.test(cmd.trim());
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

// 构建 system prompt：研究员角色
function buildExperimentPrompt(session: ExperimentSession): string {
  // seed 模式：以画布上的 answer 节点文本为研究起点
  if (session.seed) {
    const title = session.seed.title ? `（节选自：${session.seed.title}）` : '';
    return `你是一个「实验研究员」。用户在研究画布上选中了一段结论/讨论，希望以此为起点做一次小规模的实际验证。

## 你拿到的起点${title}

\`\`\`
${session.seed.text}
\`\`\`

## 工作方式

1. **认真读懂起点**：先理解用户选中的这段文本在说什么、可被验证/落地的点是什么。不要跳过直接开聊。
2. **必要时查一手**：若文本里出现具体技术名/论文/项目，用 WebFetch 抓对应一手链接补足上下文。不凭感觉回答。
3. **讨论方案**：与用户对话，讨论如何把这段结论落地成一个可跑的东西（提示词、脚本、工作流等）。
4. **产出草稿直接输出在对话里**：方案成形后，把最终产物（提示词 / 技能描述 / 调用样例）以 markdown 形式**完整输出在对话消息中**。
5. **调用 coze 验证**：当需要真实跑一下时，用 Bash 调 \`coze\` CLI。**完整用法见下方「Coze CLI 使用手册」**，不要再跑 \`coze --help\` 探路。
6. **分析为主**：不要在工作目录里搭完整项目。只写最小验证脚本或 prompt 文件。

## 关于"经验"的沉淀方式（重要）

**你不负责持久化经验**。经验由用户在界面上点「保存为经验」按钮完成，系统会把你在对话里输出的 markdown 存为经验条目。

因此：
- **不要** 用 Write 工具把最终产物写进 \`EXPERIMENT_LOG.md\` / \`experience.md\` / 任何经验归档文件
- **不要** 说"我已把经验写入 xxx.md，你可以去查看"——那是临时文件，用户拿不到
- **要** 把最终 markdown **完整输出在对话消息里**，让用户直接看到并自行保存

Write 工具**只用于**：写 coze prompt 文件、最小验证脚本等"过程性"临时文件。

## 工作目录

${session.workDir}（临时沙盒，只放验证脚本和 coze prompt，用完即弃，用户看不到）

## 工具

- **WebFetch**：抓取 URL（补一手链接用）
- **WebSearch**：兜底搜索
- **Bash**：调 \`coze\` CLI 或运行验证脚本
- **Read/Write/Edit/Glob/Grep**：在工作目录里写 prompt 草稿、保存 coze 产物

## 语言

用中文与用户交流。

---

${COZE_CLI_GUIDE}`;
  }

  const materialsList = session.materials.map(m => {
    const links = m.sourceLinks.map(l => `  - [${l.type || 'link'}] ${l.title || l.url}: ${l.url}`).join('\n');
    return `### ${m.name}\n${links || '  （无原链接）'}`;
  }).join('\n\n');

  return `你是一个「实验研究员」。职责是：基于用户选中的 Wiki 条目的一手链接做调研，与用户对话讨论方案，必要时调用本地 \`coze\` CLI 做小规模验证，最终沉淀可复用的"经验"。

## 你手里的原料（仅原链接，条目正文未加载）

${materialsList}

## 工作方式

1. **调研优先**：先用 WebFetch 抓取原链接，获取一手信息（README / 论文 / 官方文档）。不要凭感觉回答。
2. **讨论方案**：基于抓到的内容与用户对话，讨论如何把技术落地成一个可用的技能（提示词、工具调用、工作流等）。
3. **产出草稿直接输出在对话里**：方案成形后，把最终产物（提示词 / 技能描述 / 调用样例）以 markdown 形式**完整输出在对话消息中**。
4. **调用 coze 验证**：当需要真实跑一下时，用 Bash 调 \`coze\` CLI。**完整用法见下方「Coze CLI 使用手册」**，不要再跑 \`coze --help\` 探路。
5. **分析为主**：不要在工作目录里搭完整项目。只写最小验证脚本或 prompt 文件。

## 关于"经验"的沉淀方式（重要）

**你不负责持久化经验**。经验由用户在界面上点「保存为经验」按钮完成，系统会把你在对话里输出的 markdown 存为经验条目。

因此：
- **不要** 用 Write 工具把最终产物写进 \`EXPERIMENT_LOG.md\` / \`experience.md\` / 任何经验归档文件
- **不要** 说"我已把经验写入 xxx.md，你可以去查看"——那是临时文件，用户拿不到
- **要** 把最终 markdown **完整输出在对话消息里**，让用户直接看到并自行保存

Write 工具**只用于**：写 coze prompt 文件、最小验证脚本等"过程性"临时文件。

## 工作目录

${session.workDir}（临时沙盒，只放验证脚本和 coze prompt，用完即弃，用户看不到）

## 工具

- **WebFetch**：抓取 URL（主力工具，用于读源链接）
- **WebSearch**：兜底搜索
- **Bash**：调 \`coze\` CLI 或运行验证脚本
- **Read/Write/Edit/Glob/Grep**：在工作目录里写 prompt 草稿、保存 coze 产物

## 语言

用中文与用户交流。

---

${COZE_CLI_GUIDE}`;
}

interface SourceInput {
  itemIds?: string[];
  seedText?: string;
  seedTitle?: string;
}

async function getOrCreateSession(
  sessionId: string | null,
  source: SourceInput,
  model: string,
): Promise<ExperimentSession> {
  if (sessionId && sessions.has(sessionId)) {
    const entry = sessions.get(sessionId)!;
    entry.lastAccess = Date.now();
    return entry.session;
  }

  const id = `experiment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(os.tmpdir(), `aidigest-experiment-${id}`);
  await fs.mkdir(workDir, { recursive: true });

  const materials: ExperimentMaterial[] = [];
  let seed: ExperimentSeed | null = null;

  if (source.seedText && source.seedText.trim()) {
    seed = { title: source.seedTitle, text: source.seedText };
  } else if (source.itemIds && source.itemIds.length) {
    // 只加载 name + sourceLinks，不读 sections
    for (const itemId of source.itemIds) {
      const item = await getWikiItem(itemId);
      if (!item) continue;
      materials.push({
        itemId,
        name: item.name,
        sourceLinks: item.sourceLinks || [],
      });
    }
  }

  const session: ExperimentSession = {
    id,
    materials,
    seed,
    workDir,
    sdkSessionId: null,
    model,
    currentAbort: null,
  };

  sessions.set(id, { session, lastAccess: Date.now() });
  return session;
}

export async function runExperiment(
  source: SourceInput,
  message: string,
  history: ChatMessage[],
  sessionId: string | null,
  model: string,
  send: EventSender,
): Promise<void> {
  const session = await getOrCreateSession(sessionId, source, model);

  send('session', {
    sessionId: session.id,
    materials: session.materials.map(m => ({ itemId: m.itemId, name: m.name, linkCount: m.sourceLinks.length })),
    seed: session.seed ? { title: session.seed.title, length: session.seed.text.length } : null,
    model: session.model,
  });

  if (message === '__init__') {
    send('complete', { content: '' });
    return;
  }

  const isResume = !!session.sdkSessionId;
  const prompt = isResume ? message : `${formatHistory(history)}\n${message}`;

  // 如有上一轮残留的 abort，先清掉
  session.currentAbort?.abort();
  const abortController = new AbortController();
  session.currentAbort = abortController;

  let fullReply = '';
  // 跟踪 coze 运行：tool_use_id → 命令
  const cozeRuns = new Map<string, string>();
  // 去重 tool trace
  const seenTraceKeys = new Set<string>();

  try {
    const queryOptions: Record<string, unknown> = {
      systemPrompt: buildExperimentPrompt(session),
      model: resolveModelId(session.model as TriageModel),
      cwd: session.workDir,
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      maxTurns: 30,
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

    for await (const msg of q) {
      reportFromSDKMessage('aidigest', msg);

      if (!session.sdkSessionId) {
        const sid = (msg as { session_id?: string }).session_id;
        if (sid) session.sdkSessionId = sid;
      }

      // 捕获 SDK system/init 的真实 model ID（别名 'opus' → claude-opus-4-X）
      if (msg.type === 'system') {
        const sys = msg as { subtype?: string; model?: string };
        if (sys.subtype === 'init' && typeof sys.model === 'string') {
          send('resolved_model', { model: sys.model });
        }
      }

      // assistant: 捕获工具调用
      if (msg.type === 'assistant') {
        const blocks = msg.message?.content;
        if (Array.isArray(blocks)) {
          const toolLabels: Record<string, string> = {
            WebSearch: '搜索中...',
            WebFetch: '抓取网页...',
            Read: '读取文件...',
            Write: '写入文件...',
            Edit: '编辑文件...',
            Bash: '执行命令...',
            Glob: '查找文件...',
            Grep: '搜索内容...',
          };
          for (const block of blocks) {
            if (block.type !== 'tool_use') continue;
            const name = typeof block.name === 'string' ? block.name : '';
            const input = block.input as Record<string, unknown> | undefined;
            const useId = typeof (block as { id?: string }).id === 'string' ? (block as { id: string }).id : '';

            let detail = '';
            if (name === 'Read' && input?.file_path) detail = String(input.file_path);
            else if (name === 'Write' && input?.file_path) detail = String(input.file_path);
            else if (name === 'Edit' && input?.file_path) detail = String(input.file_path);
            else if (name === 'Bash' && input?.command) detail = String(input.command).slice(0, 300);
            else if (name === 'WebSearch' && input?.query) detail = String(input.query);
            else if (name === 'WebFetch' && input?.url) detail = String(input.url);
            else if (name === 'Glob' && input?.pattern) detail = String(input.pattern);
            else if (name === 'Grep' && input?.pattern) detail = String(input.pattern);

            // 识别 coze 调用
            if (name === 'Bash' && typeof input?.command === 'string' && isCozeCommand(input.command) && useId) {
              cozeRuns.set(useId, input.command);
              send('coze_run_start', {
                id: useId,
                command: input.command,
                startedAt: Date.now(),
              });
              continue;
            }

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

      // user: 捕获 tool_result（关联 coze run）
      if (msg.type === 'user') {
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          for (const block of content as Array<Record<string, unknown>>) {
            if (block.type !== 'tool_result') continue;
            const useId = typeof block.tool_use_id === 'string' ? block.tool_use_id : '';
            if (!useId || !cozeRuns.has(useId)) continue;

            // 提取 tool_result 文本内容
            let output = '';
            const rc = block.content;
            if (typeof rc === 'string') {
              output = rc;
            } else if (Array.isArray(rc)) {
              output = rc
                .filter((x: { type?: string }) => x.type === 'text')
                .map((x: { text?: string }) => x.text ?? '')
                .join('\n');
            }

            const isError = block.is_error === true;
            send('coze_run_end', {
              id: useId,
              command: cozeRuns.get(useId),
              endedAt: Date.now(),
              status: isError ? 'failed' : 'success',
              output: output.slice(0, 4000),
            });
            cozeRuns.delete(useId);
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
    // abort 不算错误，当正常结束处理
    if (abortController.signal.aborted || /abort/i.test(errMsg)) {
      send('aborted', { content: fullReply });
    } else {
      send('error', { message: errMsg });
    }
  } finally {
    // 清空 abort 引用（若仍是当前这个）
    if (session.currentAbort === abortController) {
      session.currentAbort = null;
    }
  }
}
