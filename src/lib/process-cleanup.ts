import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// 按工作目录路径清理相关进程（包括已切换 cwd / 临时目录被删的情况）
// 策略：
// 1. pgrep -f <workDir>：匹配命令行中含工作目录路径的根进程（父 shell / 带路径参数的命令）
// 2. lsof +D <workDir>：如果目录还在，补充 cwd 在目录下的进程
// 3. 对每个根进程 BFS 递归收集后代（pgrep -P）
// 4. 统一 kill -9
export async function killProcessesByWorkDir(workDir: string): Promise<void> {
  if (!workDir || workDir === '/') return;

  const roots = new Set<string>();

  // 1. pgrep -f：命令行 grep
  try {
    const out = execSync(`pgrep -f ${shellQuote(workDir)} 2>/dev/null || true`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    for (const p of parsePids(out)) roots.add(p);
  } catch { /* ignore */ }

  // 2. lsof +D：若目录仍存在，找 cwd/fd 在该目录下的进程
  try {
    const out = execSync(`lsof +D ${shellQuote(workDir)} 2>/dev/null | awk 'NR>1{print $2}' | sort -u`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    for (const p of parsePids(out)) roots.add(p);
  } catch { /* ignore */ }

  if (roots.size === 0) return;

  // 3. BFS 收集所有后代 pid
  const all = new Set<string>(roots);
  let frontier = [...roots];
  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const pid of frontier) {
      try {
        const out = execSync(`pgrep -P ${pid} 2>/dev/null || true`, {
          encoding: 'utf-8',
          timeout: 2000,
        });
        for (const c of parsePids(out)) {
          if (!all.has(c)) { all.add(c); next.push(c); }
        }
      } catch { /* ignore */ }
    }
    frontier = next;
  }

  // 4. kill -9
  try {
    execSync(`kill -9 ${[...all].join(' ')} 2>/dev/null || true`, { timeout: 5000 });
  } catch { /* ignore */ }
}

function parsePids(out: string): string[] {
  return out.split('\n').map(s => s.trim()).filter(s => /^\d+$/.test(s));
}

function shellQuote(s: string): string {
  // 用单引号包裹，转义内部单引号
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// 进程启动时扫描并清理孤儿临时目录 + SDK 会话文件（上次 server 崩溃或 dev hot-reload 遗留）
// prefix 为目录前缀，例如 "aidigest-experiment-" / "aidigest-sandbox-"
export async function cleanupOrphanWorkDirs(prefix: string): Promise<void> {
  const tmp = os.tmpdir();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(tmp);
  } catch { return; }

  const matched = entries.filter(name => name.startsWith(prefix));
  for (const name of matched) {
    const full = path.join(tmp, name);
    try {
      await killProcessesByWorkDir(full);
      await fs.rm(full, { recursive: true, force: true });
    } catch { /* ignore */ }
  }

  // 同步清理 SDK 会话目录（~/.claude/projects/ 下名字含 aidigest-<kind>- 的遗留）
  try {
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const sdkEntries = await fs.readdir(projectsDir);
    for (const name of sdkEntries) {
      if (name.includes(prefix)) {
        await fs.rm(path.join(projectsDir, name), { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch { /* ignore */ }
}
