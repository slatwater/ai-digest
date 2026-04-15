import { NextRequest } from 'next/server';
import { getWikiItem, saveWikiItem } from '@/lib/storage';
import { SkillFile } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 解析 GitHub URL → owner/repo
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

// 简易 YAML frontmatter 解析
function parseFrontmatter(raw: string): Record<string, string> {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*["']?(.*?)["']?\s*$/);
    if (kv) meta[kv[1]] = kv[2];
  }
  return meta;
}

export async function POST(req: NextRequest) {
  const { repoUrl, itemId } = await req.json();

  if (!repoUrl || !itemId) {
    return Response.json({ error: '缺少 repoUrl 或 itemId' }, { status: 400 });
  }

  // 读取目标 wiki 条目
  const item = await getWikiItem(itemId);
  if (!item) {
    return Response.json({ error: '条目不存在' }, { status: 404 });
  }

  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    return Response.json({ error: '无法解析 GitHub URL' }, { status: 400 });
  }

  const { owner, repo } = parsed;

  try {
    // 获取仓库文件树（先试 main，再试 master）
    let treeData: { tree?: { path: string; type: string }[] } = {};
    let branch = 'main';

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`,
      { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AIDigest' } }
    );

    if (treeRes.ok) {
      treeData = await treeRes.json();
    } else {
      const masterRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`,
        { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AIDigest' } }
      );
      if (!masterRes.ok) {
        return Response.json({ error: `无法获取仓库文件树: ${treeRes.status}` }, { status: 500 });
      }
      treeData = await masterRes.json();
      branch = 'master';
    }

    // 找到所有 SKILL.md 文件
    const skillPaths = (treeData.tree || [])
      .filter(f => f.type === 'blob' && /skills\/[^/]+\/SKILL\.md$/i.test(f.path))
      .map(f => f.path);

    if (skillPaths.length === 0) {
      return Response.json({ error: '仓库中未找到 skills/*/SKILL.md 文件' }, { status: 404 });
    }

    // 逐个获取 SKILL.md 内容，组装为 SkillFile[]
    const skillFiles: SkillFile[] = [];

    for (const skillPath of skillPaths) {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${skillPath}`;
      const contentRes = await fetch(rawUrl);
      if (!contentRes.ok) continue;

      const content = await contentRes.text();
      const meta = parseFrontmatter(content);
      const dirName = skillPath.split('/').slice(-2, -1)[0];

      skillFiles.push({
        name: meta.name || dirName,
        command: dirName,
        content,
        sourceUrl: `https://github.com/${owner}/${repo}/blob/${branch}/${skillPath}`,
      });
    }

    // 挂载到条目
    item.skillFiles = skillFiles;
    item.updatedAt = new Date().toISOString();
    await saveWikiItem(item);

    return Response.json({
      total: skillFiles.length,
      skills: skillFiles.map(s => ({ name: s.name, command: s.command })),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
