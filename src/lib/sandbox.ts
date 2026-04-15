import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { ChatMessage } from './types';
import { getWikiItem } from './storage';
import { reportFromSDKMessage } from './token-report';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

type EventSender = (type: string, data: unknown) => void;

// Skill 元数据（从 wiki 条目解析）
interface SkillMeta {
  name: string;
  command: string;        // /command 名称
  description: string;
  content: string;        // SKILL.md body（去掉 frontmatter）
  references: { heading: string; content: string }[];
}

// 沙盒会话
interface SandboxSession {
  id: string;
  skills: SkillMeta[];
  activeSkill: string | null;
  workDir: string;
}

// 活跃会话缓存（30 分钟过期）
const sessions = new Map<string, { session: SandboxSession; lastAccess: number }>();
const SESSION_TTL = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.lastAccess > SESSION_TTL) {
      // 清理临时目录
      fs.rm(entry.session.workDir, { recursive: true, force: true }).catch(() => {});
      sessions.delete(id);
    }
  }
}, 60 * 1000);

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

// 从 wiki 条目解析 skill 元数据
function parseSkillFromWikiItem(item: { name: string; sections: { heading: string; content: string }[] }): SkillMeta | null {
  // 找 SKILL.md section（约定：第一个 section 的 heading 包含 SKILL）
  const skillSection = item.sections.find(s =>
    s.heading.toLowerCase().includes('skill') || s.heading.toLowerCase().endsWith('.md')
  ) || item.sections[0];

  if (!skillSection?.content) return null;

  const { meta, body } = parseFrontmatter(skillSection.content);
  const name = meta.name || item.name;
  // command 从 name 推导：小写 + 连字符
  const command = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '');

  // 其余 sections 作为参考文档
  const references = item.sections
    .filter(s => s !== skillSection)
    .map(s => ({ heading: s.heading, content: s.content }));

  return {
    name,
    command,
    description: meta.description || '',
    content: body,
    references,
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

// 构建完整 systemPrompt
function buildSandboxPrompt(session: SandboxSession): string {
  const active = session.skills.find(s => s.command === session.activeSkill) || session.skills[0];
  if (!active) return '没有加载任何 skill。';

  const parts: string[] = [];

  parts.push(`你是一个 Skill 沙盒运行时。用户正在试用 skill，请完整执行 skill 定义的工作流程。`);
  parts.push(`\n工作目录：${session.workDir}（你可以在这里自由读写文件和执行命令）`);

  // 多 skill 路由
  if (session.skills.length > 1) {
    parts.push('\n' + buildRouterPrompt(session.skills));
    parts.push(`\n当前激活：\`/${active.command}\`（${active.name}）`);
  }

  // 当前 skill 内容
  parts.push(`\n## 当前 Skill 内容\n\n${active.content}`);

  // 参考文档
  if (active.references.length > 0) {
    parts.push('\n## 参考文档');
    for (const ref of active.references) {
      parts.push(`\n### ${ref.heading}\n\n${ref.content}`);
    }
  }

  // 工作目录中的文件提示
  parts.push(`\n## 注意
- 你在沙盒临时目录中运行，可以自由创建文件、执行代码
- 所有工具（Read、Write、Edit、Bash、Glob、Grep、WebFetch、WebSearch）均可使用
- 按照 skill 文档的指示完整执行工作流程，不要省略步骤
- 用中文与用户交流`);

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

// 获取或创建沙盒会话
async function getOrCreateSession(
  sessionId: string | null,
  itemIds: string[],
): Promise<SandboxSession> {
  // 复用现有会话
  if (sessionId && sessions.has(sessionId)) {
    const entry = sessions.get(sessionId)!;
    entry.lastAccess = Date.now();
    return entry.session;
  }

  // 创建新会话
  const id = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 读取 wiki 条目，解析 skill
  const skills: SkillMeta[] = [];
  for (const itemId of itemIds) {
    const item = await getWikiItem(itemId);
    if (!item) continue;
    const skill = parseSkillFromWikiItem(item);
    if (skill) skills.push(skill);
  }

  // 创建临时工作目录
  const workDir = path.join(os.tmpdir(), `aidigest-sandbox-${id}`);
  await fs.mkdir(workDir, { recursive: true });

  // 将参考文档写入临时目录供 agent 读取
  for (const skill of skills) {
    if (skill.references.length > 0) {
      const refDir = path.join(workDir, `_refs_${skill.command}`);
      await fs.mkdir(refDir, { recursive: true });
      for (const ref of skill.references) {
        const filename = ref.heading.replace(/[^a-zA-Z0-9\u4e00-\u9fff.-]+/g, '_') + '.md';
        await fs.writeFile(path.join(refDir, filename), ref.content, 'utf-8');
      }
    }
  }

  const session: SandboxSession = {
    id,
    skills,
    activeSkill: skills[0]?.command || null,
    workDir,
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
  send: EventSender,
): Promise<void> {
  const session = await getOrCreateSession(sessionId, itemIds);

  // 发送会话信息
  send('session', {
    sessionId: session.id,
    skills: session.skills.map(s => ({ name: s.name, command: s.command, description: s.description })),
    activeSkill: session.activeSkill,
  });

  if (session.skills.length === 0) {
    send('error', { message: '未能从选中的 wiki 条目中解析出任何 skill' });
    return;
  }

  // 解析 /command
  const { command, message: userMessage } = resolveCommand(message, session.skills);
  if (command && command !== session.activeSkill) {
    session.activeSkill = command;
    const skill = session.skills.find(s => s.command === command);
    send('skill_switch', { command, name: skill?.name });
  }

  const historyText = formatHistory(history);
  const prompt = `${historyText}\n${userMessage}`;

  const abortController = new AbortController();
  let fullReply = '';

  try {
    const q = query({
      prompt,
      options: {
        systemPrompt: buildSandboxPrompt(session),
        cwd: session.workDir,
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch', 'WebSearch'],
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        maxTurns: 20,
        abortController,
        persistSession: false,
      },
    });

    for await (const msg of q) {
      reportFromSDKMessage('aidigest', msg);

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
            if (block.type === 'tool_use' && typeof block.name === 'string' && toolLabels[block.name]) {
              send('tool_status', { tool: block.name, label: toolLabels[block.name] });
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
