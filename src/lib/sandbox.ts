import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { ChatMessage } from './types';
import { getWikiItem } from './storage';
import { reportFromSDKMessage } from './token-report';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

type EventSender = (type: string, data: unknown) => void;

// 子指令（从 skill 内容中提取）
interface SubCommand {
  command: string;
  description: string;
}

// Skill 元数据（轻量，不存完整内容）
interface SkillMeta {
  name: string;
  command: string;        // /command 名称
  description: string;
  filePath: string;       // 临时目录中的 SKILL.md 路径（agent 用 Read 按需读取）
  subCommands: SubCommand[];
}

// 沙盒会话
interface SandboxSession {
  id: string;
  skills: SkillMeta[];
  activeSkill: string | null;
  workDir: string;
  sdkSessionId: string | null;
  model: string;               // 'sonnet' | 'opus'
  wikiContext: string;          // wiki 条目内容（工具试用模式用）
  githubUrl: string | null;    // original 类型的 GitHub 链接（工具试用模式用）
}

// 活跃会话缓存（30 分钟过期）
const sessions = new Map<string, { session: SandboxSession; lastAccess: number }>();
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

// 清理会话：kill 子进程 + 删除临时目录 + 删除 SDK 会话文件
async function cleanupSession(session: SandboxSession): Promise<void> {
  // 1. kill 临时目录下的所有子进程（通过 lsof 找到使用该目录的进程）
  try {
    const { execSync } = await import('child_process');
    // 找到 cwd 在临时目录下的所有进程并 kill
    execSync(`lsof +D "${session.workDir}" 2>/dev/null | awk 'NR>1{print $2}' | sort -u | xargs -r kill -9 2>/dev/null`, { timeout: 5000 });
  } catch { /* 没有进程或 lsof 失败，忽略 */ }

  // 2. 删除临时目录
  await fs.rm(session.workDir, { recursive: true, force: true }).catch(() => {});

  // 3. 删除 SDK 会话文件（~/.claude/projects/ 下对应的目录）
  if (session.sdkSessionId) {
    try {
      const homeDir = os.homedir();
      const projectsDir = path.join(homeDir, '.claude', 'projects');
      // SDK 用 workDir 路径生成目录名（把 / 替换为 -）
      const dirName = session.workDir.replace(/\//g, '-').replace(/^-/, '');
      const sdkDir = path.join(projectsDir, dirName);
      await fs.rm(sdkDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}

// 主动销毁会话（退出沙盒时调用）
export async function destroySession(sessionId: string): Promise<boolean> {
  const entry = sessions.get(sessionId);
  if (!entry) return false;
  await cleanupSession(entry.session);
  sessions.delete(sessionId);
  return true;
}

// 解析 YAML frontmatter（简易实现，不引入依赖）
function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*["']?(.*?)["']?\s*$/);
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, body: match[2] };
}

// 从 skill 全文中提取 /command 子指令
function extractSubCommands(allText: string): SubCommand[] {
  const found = new Map<string, string>();

  // 匹配模式：`/command` 或 /command 后跟描述（表格行、列表项、行内）
  // 表格行：| `/dbs-content` | 内容质量诊断 | ...
  // 列表项：- `/dbs-content` — 内容质量诊断
  // 行内：/dbs-content（内容质量诊断）
  const patterns = [
    // markdown 表格：| `/cmd` | 描述 | 或 | /cmd | 描述 |
    /\|\s*`?\/([\w-]+)`?\s*\|\s*([^|]+)/g,
    // 列表项：- `/cmd` — 描述 或 - /cmd — 描述
    /[-*]\s*`?\/([\w-]+)`?\s*[—\-–:：]\s*(.+)/g,
    // **`/cmd`**（描述）或 `/cmd`（描述）
    /`\/([\w-]+)`[）)]*\s*[—\-–:：（(]\s*([^）)\n]+)/g,
  ];

  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(allText)) !== null) {
      const cmd = m[1].toLowerCase();
      const desc = m[2].trim().replace(/\s*\|.*$/, '').replace(/[`*]/g, '').trim();
      if (cmd.length >= 2 && desc.length >= 2 && !found.has(cmd)) {
        found.set(cmd, desc);
      }
    }
  }

  return [...found.entries()].map(([command, description]) => ({ command, description }));
}

// 从 wiki 条目解析 skill 的原始内容（用于写入磁盘）
interface SkillRaw {
  name: string;
  command: string;
  description: string;
  content: string;        // 完整 SKILL.md 原文
  subCommands: SubCommand[];
}

function parseSkillFromWikiItem(item: { name: string; sections: { heading: string; content: string }[] }): SkillRaw | null {
  // 找 SKILL.md section（约定：第一个 section 的 heading 包含 SKILL）
  const skillSection = item.sections.find(s =>
    s.heading.toLowerCase().includes('skill') || s.heading.toLowerCase().endsWith('.md')
  ) || item.sections[0];

  if (!skillSection?.content) return null;

  const { meta } = parseFrontmatter(skillSection.content);
  const name = meta.name || item.name;
  const command = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');
  const allText = item.sections.map(s => s.content).join('\n');

  return {
    name,
    command,
    description: meta.description || '',
    content: skillSection.content,
    subCommands: extractSubCommands(allText),
  };
}

// 构建路由表 prompt
function buildRouterPrompt(skills: SkillMeta[]): string {
  if (skills.length <= 1) return '';

  const lines = skills.map(s => `- \`/${s.command}\` — ${s.description || s.name}`);
  return `## 可用指令

${lines.join('\n')}

## 路由规则
- 用户输入 \`/xxx\` 时，切换到对应 skill 的工作流程并执行
- 无 / 前缀时，使用当前激活的 skill 继续对话
- 切换 skill 时先告知用户「已切换到 /xxx」
`;
}

// 构建 systemPrompt：根据有无 skill 文件分两种模式
function buildSandboxPrompt(session: SandboxSession): string {
  const parts: string[] = [];
  const hasSkills = session.skills.length > 0;

  if (hasSkills) {
    // ── Skill 运行模式 ──
    parts.push(`你是一个 Skill 沙盒运行时。所有 skill 文件已在工作目录的 skills/ 下。

**工作方式**：用户输入 /command 或描述需求时，用 Read 工具读取对应的 SKILL.md 文件，然后严格按照文件中的指令执行。
**禁止**：不要说"需要安装"、"尚未安装"。如果 skill 文档中提到安装步骤，那是给终端用户看的，不是给你的。`);

    parts.push(`\n工作目录：${session.workDir}`);

    parts.push('\n## 可用 Skill 文件');
    for (const s of session.skills) {
      parts.push(`- \`/${s.command}\` — ${s.description || s.name} → 文件: \`${s.filePath}\``);
    }

    parts.push(`\n## 工作流程
1. 用户输入 /command 时，用 Read 读取对应的 SKILL.md 文件
2. 按照文件中的指令完整执行，不要省略步骤
3. 用户无 /command 前缀时，根据需求描述选择最合适的 skill 读取并执行
4. 可以自由在工作目录中创建文件、执行代码
5. 用中文与用户交流`);
  } else {
    // ── 工具试用模式 ──
    const ghSection = session.githubUrl
      ? `\n**一手来源**：${session.githubUrl}\n首次对话时，先用 WebFetch 读取该 GitHub 仓库的 README，获取准确的安装方式和用法，再开始试用。下面的背景知识仅供参考，以 GitHub README 为准。\n`
      : '';
    parts.push(`你是一个工具试用沙盒。用户想在隔离环境中试用一个技术工具/库。
${ghSection}
以下是关于这个工具的背景知识：

${session.wikiContext}

**工作方式**：
1. ${session.githubUrl ? '先用 WebFetch 读取一手来源的 README 获取准确信息' : '根据上面的背景知识和用户的需求'}
2. 在工作目录中实际安装、编写代码、运行 demo
3. 遇到问题自己调试解决
4. 把运行结果和关键发现告诉用户

**工作目录**：${session.workDir}（临时目录，用完即弃，可以随意操作）

**工具**：Read、Write、Edit、Bash、Glob、Grep、WebFetch、WebSearch 全部可用
**语言**：用中文与用户交流`);
  }

  return parts.join('\n');
}

// 解析用户消息中的 /command
function resolveCommand(input: string, skills: SkillMeta[]): { command: string | null; message: string } {
  const match = input.match(/^\/([\w-]+)\s*([\s\S]*)$/);
  if (!match) return { command: null, message: input };

  const cmd = match[1].toLowerCase();
  const skill = skills.find(s => s.command === cmd);
  if (!skill) return { command: null, message: input };

  return { command: skill.command, message: match[2] || `执行 /${skill.command}` };
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

// 从 wiki 条目构建上下文文本（工具试用模式）
function buildWikiContext(item: { name: string; sections: { heading: string; content: string }[]; sourceLinks: { url: string; title: string; type?: string }[] }): string {
  const parts = [`# ${item.name}`];
  for (const s of item.sections) {
    parts.push(`\n## ${s.heading}\n${s.content}`);
  }
  if (item.sourceLinks.length > 0) {
    parts.push('\n## 相关链接');
    for (const l of item.sourceLinks) {
      parts.push(`- [${l.title || l.url}](${l.url})`);
    }
  }
  return parts.join('\n');
}

// 获取或创建沙盒会话
async function getOrCreateSession(
  sessionId: string | null,
  itemIds: string[],
  model: string,
): Promise<SandboxSession> {
  // 复用现有会话
  if (sessionId && sessions.has(sessionId)) {
    const entry = sessions.get(sessionId)!;
    entry.lastAccess = Date.now();
    return entry.session;
  }

  // 创建新会话
  const id = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 创建临时工作目录
  const workDir = path.join(os.tmpdir(), `aidigest-sandbox-${id}`);
  const skillsDir = path.join(workDir, 'skills');
  await fs.mkdir(skillsDir, { recursive: true });

  // 读取 wiki 条目，解析 skill，写入磁盘
  const rawSkills: SkillRaw[] = [];
  const wikiContextParts: string[] = [];
  let githubUrl: string | null = null;

  for (const itemId of itemIds) {
    const item = await getWikiItem(itemId);
    if (!item) continue;

    // 提取 original 类型的 GitHub 链接
    if (!githubUrl) {
      const ghLink = item.sourceLinks?.find(l =>
        l.type === 'original' && /github\.com/i.test(l.url)
      );
      if (ghLink) githubUrl = ghLink.url;
    }

    // 收集 wiki 上下文（工具试用模式用）
    wikiContextParts.push(buildWikiContext(item));

    if (item.skillFiles && item.skillFiles.length > 0) {
      for (const sf of item.skillFiles) {
        const { meta } = parseFrontmatter(sf.content);
        rawSkills.push({
          name: meta.name || sf.name,
          command: sf.command,
          description: meta.description || '',
          content: sf.content,
          subCommands: extractSubCommands(sf.content),
        });
      }
    }
    // 没有 skillFiles 的条目走工具试用模式（不再从 sections 猜测 skill）
  }

  // 将每个 skill 写入 skills/{command}/SKILL.md，生成轻量 SkillMeta
  // 如果没有 skillFiles 且 sections 也解析不出 skill，skills 为空 → 走工具试用模式
  const skills: SkillMeta[] = [];
  for (const raw of rawSkills) {
    const dir = path.join(skillsDir, raw.command);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'SKILL.md');
    await fs.writeFile(filePath, raw.content, 'utf-8');
    skills.push({
      name: raw.name,
      command: raw.command,
      description: raw.description,
      filePath,
      subCommands: raw.subCommands,
    });
  }

  const defaultSkill = skills.length > 1
    ? skills.reduce((a, b) => a.command.length <= b.command.length ? a : b).command
    : skills[0]?.command || null;

  const session: SandboxSession = {
    id,
    skills,
    activeSkill: defaultSkill,
    workDir,
    sdkSessionId: null,
    model,
    wikiContext: wikiContextParts.join('\n\n---\n\n'),
    githubUrl,
  };

  sessions.set(id, { session, lastAccess: Date.now() });
  return session;
}

// 主执行函数
export async function runSandbox(
  itemIds: string[],
  message: string,
  history: ChatMessage[],
  sessionId: string | null,
  model: string,
  send: EventSender,
): Promise<void> {
  const session = await getOrCreateSession(sessionId, itemIds, model);

  // 汇总所有指令（skill 自身 command + 文本中提取的子指令，去重）
  const allSubCommands: SubCommand[] = [];
  const seenCmds = new Set<string>();
  for (const skill of session.skills) {
    // skill 自身作为一条指令
    if (!seenCmds.has(skill.command)) {
      seenCmds.add(skill.command);
      allSubCommands.push({ command: skill.command, description: skill.description || skill.name });
    }
    // 文本中提取的子指令
    for (const sub of skill.subCommands) {
      if (!seenCmds.has(sub.command)) {
        seenCmds.add(sub.command);
        allSubCommands.push(sub);
      }
    }
  }

  // 发送会话信息（含子指令列表 + 模式标识）
  send('session', {
    sessionId: session.id,
    skills: session.skills.map(s => ({ name: s.name, command: s.command, description: s.description })),
    subCommands: allSubCommands,
    activeSkill: session.activeSkill,
    model: session.model,
    mode: session.skills.length > 0 ? 'skill' : 'tryout',
  });

  // 初始化请求：只创建会话返回元数据，不运行 agent
  if (message === '__init__') {
    send('complete', { content: '' });
    return;
  }

  // 解析 /command
  const { command, message: userMessage } = resolveCommand(message, session.skills);
  if (command && command !== session.activeSkill) {
    session.activeSkill = command;
    const skill = session.skills.find(s => s.command === command);
    send('skill_switch', { command, name: skill?.name });
  }

  // 持久会话：首次用 prompt + systemPrompt，后续用 resume 继续
  const isResume = !!session.sdkSessionId;
  const prompt = isResume ? userMessage : `${formatHistory(history)}\n${userMessage}`;

  const abortController = new AbortController();
  let fullReply = '';
  const seenToolIds = new Set<string>();

  try {
    const queryOptions: Record<string, unknown> = {
      systemPrompt: buildSandboxPrompt(session),
      model: session.model,
      cwd: session.workDir,
      allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      maxTurns: 20,
      abortController,
      persistSession: true,
    };
    // 有已有会话则 resume，否则新建
    if (session.sdkSessionId) {
      queryOptions.resume = session.sdkSessionId;
    }

    const q = query({
      prompt,
      options: queryOptions as Parameters<typeof query>[0]['options'],
    });

    for await (const msg of q) {
      reportFromSDKMessage('aidigest', msg);

      // 捕获 SDK session ID（用于后续 resume）
      // session_id 在 msg 顶层，不在 msg.message 上
      if (!session.sdkSessionId) {
        const sid = (msg as { session_id?: string }).session_id;
        if (sid) session.sdkSessionId = sid;
      }

      // 工具调用状态推送
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
            if (block.type === 'tool_use' && typeof block.name === 'string') {
              const input = block.input as Record<string, unknown> | undefined;
              let detail = '';
              if (block.name === 'Read' && input?.file_path) detail = String(input.file_path);
              else if (block.name === 'Write' && input?.file_path) detail = String(input.file_path);
              else if (block.name === 'Edit' && input?.file_path) detail = String(input.file_path);
              else if (block.name === 'Bash' && input?.command) detail = String(input.command).slice(0, 200);
              else if (block.name === 'WebSearch' && input?.query) detail = String(input.query);
              else if (block.name === 'WebFetch' && input?.url) detail = String(input.url);
              else if (block.name === 'Glob' && input?.pattern) detail = String(input.pattern);
              else if (block.name === 'Grep' && input?.pattern) detail = String(input.pattern);
              // 用 tool+detail 去重（SDK 会重复 emit 同一个 tool_use block）
              const traceKey = `${block.name}::${detail}`;
              if (detail && !seenToolIds.has(traceKey)) {
                seenToolIds.add(traceKey);
                if (toolLabels[block.name]) {
                  send('tool_status', { tool: block.name, label: toolLabels[block.name] });
                }
                send('tool_trace', { tool: block.name, detail, timestamp: Date.now() });
              } else if (!detail && toolLabels[block.name]) {
                // input 还没填充，只推 status 不记 trace
                send('tool_status', { tool: block.name, label: toolLabels[block.name] });
              }
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
    send('error', { message: errMsg });
  }
}
