import fs from 'fs/promises';
import path from 'path';
import { DigestEntry, ChatMessage, TriageBatch, WikiEntry, WikiIndexEntry } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');

// 获取条目的目录路径（按日期组织）
function getDateDir(date: string): string {
  return path.join(DATA_DIR, date.slice(0, 10)); // YYYY-MM-DD
}

// 保存一条分析记录
export async function saveEntry(entry: DigestEntry): Promise<void> {
  const dateDir = getDateDir(entry.date);
  await fs.mkdir(dateDir, { recursive: true });

  // 保存 JSON
  const jsonPath = path.join(dateDir, `${entry.id}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(entry, null, 2), 'utf-8');

  // 保存完整 Markdown 报告
  const mdPath = path.join(dateDir, `${entry.id}.md`);
  await fs.writeFile(mdPath, entry.fullMarkdown, 'utf-8');

  // 更新索引
  await updateIndex(entry);
}

// 更新全局索引
async function updateIndex(entry: DigestEntry): Promise<void> {
  const indexPath = path.join(DATA_DIR, 'index.json');
  let index: DigestEntry[] = [];

  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    index = JSON.parse(raw);
  } catch {
    // 文件不存在，用空数组
  }

  // 去重后添加
  index = index.filter(e => e.id !== entry.id);
  index.unshift(entry);

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

// 获取所有条目（按日期倒序）
export async function getEntries(): Promise<DigestEntry[]> {
  const indexPath = path.join(DATA_DIR, 'index.json');
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// 获取单个条目
export async function getEntry(id: string): Promise<DigestEntry | null> {
  const entries = await getEntries();
  return entries.find(e => e.id === id) ?? null;
}

// 删除一条记录
export async function deleteEntry(id: string): Promise<boolean> {
  const indexPath = path.join(DATA_DIR, 'index.json');
  let index: DigestEntry[] = [];

  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    index = JSON.parse(raw);
  } catch {
    return false;
  }

  const entry = index.find(e => e.id === id);
  if (!entry) return false;

  // 从索引中移除
  index = index.filter(e => e.id !== id);
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');

  // 删除文件
  const dateDir = getDateDir(entry.date);
  try { await fs.unlink(path.join(dateDir, `${id}.json`)); } catch { /* 忽略 */ }
  try { await fs.unlink(path.join(dateDir, `${id}.md`)); } catch { /* 忽略 */ }

  // 清理 Wiki 中对该条目的来源引用
  await cleanWikiSources(id);

  return true;
}

// 保存 chat 历史
export async function saveChatHistory(entryId: string, messages: ChatMessage[]): Promise<boolean> {
  const indexPath = path.join(DATA_DIR, 'index.json');
  let index: DigestEntry[] = [];

  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    index = JSON.parse(raw);
  } catch {
    return false;
  }

  const entry = index.find(e => e.id === entryId);
  if (!entry) return false;

  entry.chatHistory = messages;
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');

  // 同步更新 JSON 文件
  const dateDir = getDateDir(entry.date);
  const jsonPath = path.join(dateDir, `${entryId}.json`);
  try {
    const raw = await fs.readFile(jsonPath, 'utf-8');
    const data = JSON.parse(raw);
    data.chatHistory = messages;
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
  } catch { /* 日期目录文件可能不存在 */ }

  return true;
}

// === Triage 存储 ===

const TRIAGE_PATH = path.join(DATA_DIR, 'triage.json');

// 保存/更新 triage batch
export async function saveTriageBatch(batch: TriageBatch): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let batches: TriageBatch[] = [];

  try {
    const raw = await fs.readFile(TRIAGE_PATH, 'utf-8');
    batches = JSON.parse(raw);
  } catch { /* 文件不存在 */ }

  // 更新或追加
  const idx = batches.findIndex(b => b.id === batch.id);
  if (idx >= 0) {
    batches[idx] = batch;
  } else {
    batches.unshift(batch);
  }

  // 只保留最近 20 个 batch
  batches = batches.slice(0, 20);
  await fs.writeFile(TRIAGE_PATH, JSON.stringify(batches, null, 2), 'utf-8');
}

// 读取所有 triage batch
export async function getTriageBatches(): Promise<TriageBatch[]> {
  try {
    const raw = await fs.readFile(TRIAGE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// 删除 triage batch
export async function deleteTriageBatch(id: string): Promise<boolean> {
  let batches: TriageBatch[] = [];
  try {
    const raw = await fs.readFile(TRIAGE_PATH, 'utf-8');
    batches = JSON.parse(raw);
  } catch {
    return false;
  }

  const before = batches.length;
  batches = batches.filter(b => b.id !== id);
  if (batches.length === before) return false;

  await fs.writeFile(TRIAGE_PATH, JSON.stringify(batches, null, 2), 'utf-8');
  return true;
}

// === Wiki 存储 ===

const WIKI_DIR = path.join(DATA_DIR, 'wiki');
const WIKI_INDEX_PATH = path.join(WIKI_DIR, 'index.json');

function wikiToFrontmatter(c: WikiEntry): string {
  const meta = {
    id: c.id, name: c.name, aliases: c.aliases, domain: c.domain,
    summary: c.summary, relations: c.relations, sources: c.sources,
    tags: c.tags, createdAt: c.createdAt, updatedAt: c.updatedAt,
  };
  return `---\n${JSON.stringify(meta, null, 2)}\n---\n\n${c.content}`;
}

function parseFrontmatter(raw: string): WikiEntry | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) return null;
  try {
    const meta = JSON.parse(match[1]);
    return { ...meta, content: match[2] };
  } catch {
    return null;
  }
}

function toIndexEntry(c: WikiEntry): WikiIndexEntry {
  return {
    id: c.id, name: c.name, domain: c.domain, summary: c.summary,
    relationCount: c.relations.length, sourceCount: c.sources.length,
    updatedAt: c.updatedAt,
  };
}

export async function saveWikiEntry(entry: WikiEntry): Promise<void> {
  await fs.mkdir(WIKI_DIR, { recursive: true });
  await fs.writeFile(
    path.join(WIKI_DIR, `${entry.id}.md`),
    wikiToFrontmatter(entry), 'utf-8',
  );
  // 更新索引
  let index: WikiIndexEntry[] = [];
  try {
    index = JSON.parse(await fs.readFile(WIKI_INDEX_PATH, 'utf-8'));
  } catch { /* 文件不存在 */ }
  index = index.filter(c => c.id !== entry.id);
  index.unshift(toIndexEntry(entry));
  await fs.writeFile(WIKI_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

export async function getWikiEntries(): Promise<WikiIndexEntry[]> {
  try {
    return JSON.parse(await fs.readFile(WIKI_INDEX_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

export async function getWikiEntry(id: string): Promise<WikiEntry | null> {
  try {
    const raw = await fs.readFile(path.join(WIKI_DIR, `${id}.md`), 'utf-8');
    return parseFrontmatter(raw);
  } catch {
    return null;
  }
}

export async function getWikiEntriesByIds(ids: string[]): Promise<WikiEntry[]> {
  const results = await Promise.all(ids.map(id => getWikiEntry(id)));
  return results.filter((c): c is WikiEntry => c !== null);
}

// 清理 Wiki 中对已删除条目的来源引用；来源清空的词条一并删除
async function cleanWikiSources(entryId: string): Promise<void> {
  let index: WikiIndexEntry[];
  try {
    index = JSON.parse(await fs.readFile(WIKI_INDEX_PATH, 'utf-8'));
  } catch { return; }

  const toRemove: string[] = [];

  for (const item of index) {
    const wiki = await getWikiEntry(item.id);
    if (!wiki) continue;

    const hadSource = wiki.sources.some(s => s.entryId === entryId);
    if (!hadSource) continue;

    wiki.sources = wiki.sources.filter(s => s.entryId !== entryId);

    if (wiki.sources.length === 0) {
      // 无来源，删除整个词条
      toRemove.push(wiki.id);
      try { await fs.unlink(path.join(WIKI_DIR, `${wiki.id}.md`)); } catch { /* 忽略 */ }
    } else {
      wiki.updatedAt = new Date().toISOString();
      await saveWikiEntry(wiki);
    }
  }

  if (toRemove.length > 0) {
    const removeSet = new Set(toRemove);
    index = index.filter(c => !removeSet.has(c.id));
    await fs.writeFile(WIKI_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');

    // 清理其他词条中指向已删除词条的 relations
    for (const item of index) {
      const wiki = await getWikiEntry(item.id);
      if (!wiki) continue;
      const before = wiki.relations.length;
      wiki.relations = wiki.relations.filter(r => !removeSet.has(r.conceptId));
      if (wiki.relations.length < before) {
        wiki.updatedAt = new Date().toISOString();
        await saveWikiEntry(wiki);
      }
    }
  }
}

// 保存 demo 文件
export async function saveDemo(entryId: string, date: string, filename: string, code: string): Promise<string> {
  const demoDir = path.join(getDateDir(date), 'demos', entryId);
  await fs.mkdir(demoDir, { recursive: true });
  const filePath = path.join(demoDir, filename);
  await fs.writeFile(filePath, code, 'utf-8');
  return filePath;
}
