import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import path from 'path';
import { getTrendingByDate, saveTrending, getPreviousTrending } from '@/lib/storage';
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

// 跨日去重：磁盘缓存保留原始抓取（便于回溯历史），仅在响应时过滤掉前一份榜里出现过的 repo
async function dedupeAgainstPrevious(payload: GithubTrendingPayload): Promise<GithubTrendingPayload> {
  const prev = await getPreviousTrending(payload.date);
  if (!prev || prev.items.length === 0) return payload;
  const seen = new Set(prev.items.map(i => i.repo));
  const items = payload.items.filter(i => !seen.has(i.repo));
  return { ...payload, items };
}

// GET /api/trending
//   - ?force=1 强制重抓
//   - 否则：今日缓存存在则返回缓存；不存在则触发抓取并落盘
//   - 返回前统一与最近一份历史榜去重（落盘内容不变）
export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1';
  const today = todayLocal();

  if (!force) {
    const cached = await getTrendingByDate(today);
    if (cached) {
      const payload = await dedupeAgainstPrevious(cached);
      return NextResponse.json({ payload, source: 'cache' });
    }
  }

  try {
    const raw = await spawnFetcher();
    await saveTrending(raw);
    const payload = await dedupeAgainstPrevious(raw);
    return NextResponse.json({ payload, source: 'fresh' });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || '抓取失败' },
      { status: 500 },
    );
  }
}
