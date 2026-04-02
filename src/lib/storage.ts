import fs from 'fs/promises';
import path from 'path';
import { DigestEntry, ChatMessage, TriageBatch } from './types';

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

// 保存 demo 文件
export async function saveDemo(entryId: string, date: string, filename: string, code: string): Promise<string> {
  const demoDir = path.join(getDateDir(date), 'demos', entryId);
  await fs.mkdir(demoDir, { recursive: true });
  const filePath = path.join(demoDir, filename);
  await fs.writeFile(filePath, code, 'utf-8');
  return filePath;
}
