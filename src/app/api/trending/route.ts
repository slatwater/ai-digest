import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import { getTrendingByDate, saveTrending } from '@/lib/storage';
import type { GithubTrendingPayload } from '@/lib/types';

// 当前本地日期 YYYY-MM-DD（与 fetch 脚本对齐：都用本地时区）
function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// spawn python3 fetch-github-trending.py，解析 stdout 的 JSON
function spawnFetcher(): Promise<GithubTrendingPayload> {
  const scriptPath = path.join(process.cwd(), 'scripts', 'fetch-github-trending.py');
  return new Promise((resolve, reject) => {
    const child = execFile(
      'python3',
      [scriptPath],
      { timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error && !stdout) {
          reject(error);
          return;
        }
        try {
          const parsed = JSON.parse(stdout) as GithubTrendingPayload;
          if (!parsed.items || parsed.items.length === 0) {
            reject(new Error('trending 抓取返回空列表'));
            return;
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error(`解析 trending stdout 失败：${(e as Error).message}`));
        }
      },
    );
    child.stdin?.end();
  });
}

// GET /api/trending
//   - ?force=1 强制重抓
//   - 否则：今日缓存存在则返回缓存；不存在则触发抓取并落盘
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1';
  const today = todayLocal();

  if (!force) {
    const cached = await getTrendingByDate(today);
    if (cached) {
      return NextResponse.json({ payload: cached, source: 'cache' });
    }
  }

  try {
    const payload = await spawnFetcher();
    await saveTrending(payload);
    return NextResponse.json({ payload, source: 'fresh' });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || '抓取失败' },
      { status: 500 },
    );
  }
}
