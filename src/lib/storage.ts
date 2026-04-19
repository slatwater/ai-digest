import fs from 'fs/promises';
import path from 'path';
import { DigestEntry, ChatMessage, TriageBatch, WikiCategory, WikiItem, WikiItemSummary, WikiSection, ExperienceEntry, ExperienceSummary, PipelineSession, PipelineSessionSummary, SedimentPoint } from './types';

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

// === Wiki 存储 ===

const WIKI_DIR = path.join(DATA_DIR, 'wiki');
const WIKI_CATEGORIES_PATH = path.join(WIKI_DIR, 'categories.json');
const WIKI_INDEX_PATH = path.join(WIKI_DIR, 'index.json');
const WIKI_ITEMS_DIR = path.join(WIKI_DIR, 'items');

function toWikiSummary(item: WikiItem): WikiItemSummary {
  return {
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    sectionHeadings: item.sections.map(s => s.heading),
    sourceCount: item.sourceLinks.length,
    skillFileCount: item.skillFiles?.length || 0,
    updatedAt: item.updatedAt,
  };
}

function buildWikiItemMarkdown(item: WikiItem): string {
  const lines: string[] = [`# ${item.name}`, ''];
  for (const section of item.sections) {
    lines.push(`## ${section.heading}`, '', section.content, '');
  }
  if (item.sourceLinks.length > 0) {
    lines.push('## 来源', '');
    for (const link of item.sourceLinks) {
      lines.push(`- [${link.title || link.url}](${link.url})`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ── 分类 ──

export async function getWikiCategories(): Promise<WikiCategory[]> {
  try {
    return JSON.parse(await fs.readFile(WIKI_CATEGORIES_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

export async function saveWikiCategories(categories: WikiCategory[]): Promise<void> {
  await fs.mkdir(WIKI_DIR, { recursive: true });
  await fs.writeFile(WIKI_CATEGORIES_PATH, JSON.stringify(categories, null, 2), 'utf-8');
}

// ── 条目 ──

export async function getWikiIndex(): Promise<WikiItemSummary[]> {
  try {
    return JSON.parse(await fs.readFile(WIKI_INDEX_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

export async function getWikiItemsByCategory(categoryId: string): Promise<WikiItemSummary[]> {
  const index = await getWikiIndex();
  return index.filter(i => i.categoryId === categoryId);
}

export async function saveWikiItem(item: WikiItem): Promise<void> {
  await fs.mkdir(WIKI_ITEMS_DIR, { recursive: true });
  // 写 JSON
  await fs.writeFile(path.join(WIKI_ITEMS_DIR, `${item.id}.json`), JSON.stringify(item, null, 2), 'utf-8');
  // 写派生 MD（给 wiki-chat agent 读取）
  await fs.writeFile(path.join(WIKI_ITEMS_DIR, `${item.id}.md`), buildWikiItemMarkdown(item), 'utf-8');
  // 更新索引
  let index: WikiItemSummary[] = [];
  try { index = JSON.parse(await fs.readFile(WIKI_INDEX_PATH, 'utf-8')); } catch { /* */ }
  index = index.filter(i => i.id !== item.id);
  index.unshift(toWikiSummary(item));
  await fs.writeFile(WIKI_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

export async function getWikiItem(id: string): Promise<WikiItem | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(WIKI_ITEMS_DIR, `${id}.json`), 'utf-8'));
  } catch {
    return null;
  }
}

export async function deleteWikiItem(id: string): Promise<boolean> {
  let index: WikiItemSummary[] = [];
  try { index = JSON.parse(await fs.readFile(WIKI_INDEX_PATH, 'utf-8')); } catch { return false; }
  const before = index.length;
  index = index.filter(i => i.id !== id);
  if (index.length === before) return false;
  await fs.writeFile(WIKI_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
  try { await fs.unlink(path.join(WIKI_ITEMS_DIR, `${id}.json`)); } catch { /* */ }
  try { await fs.unlink(path.join(WIKI_ITEMS_DIR, `${id}.md`)); } catch { /* */ }
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

// === 经验（Experience）存储 ===

const EXPERIENCE_DIR = path.join(DATA_DIR, 'experiences');
const EXPERIENCE_INDEX_PATH = path.join(EXPERIENCE_DIR, 'index.json');
const EXPERIENCE_ITEMS_DIR = path.join(EXPERIENCE_DIR, 'items');

function toExperienceSummary(item: ExperienceEntry): ExperienceSummary {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    wikiItemNames: item.wikiItemNames,
    cozeRunCount: item.cozeRuns.length,
    updatedAt: item.updatedAt,
  };
}

function buildExperienceMarkdown(item: ExperienceEntry): string {
  const lines: string[] = [`# ${item.title}`, '', item.summary, ''];
  if (item.wikiItemNames.length > 0) {
    lines.push(`**来源 Wiki**：${item.wikiItemNames.join(' · ')}`, '');
  }
  lines.push(item.content, '');
  if (item.cozeRuns.length > 0) {
    lines.push('## 验证过的 Coze 调用', '');
    for (const run of item.cozeRuns) {
      lines.push(`- \`${run.command}\` → ${run.status}${typeof run.exitCode === 'number' ? ` (exit ${run.exitCode})` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function getExperienceIndex(): Promise<ExperienceSummary[]> {
  try {
    return JSON.parse(await fs.readFile(EXPERIENCE_INDEX_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

export async function getExperience(id: string): Promise<ExperienceEntry | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(EXPERIENCE_ITEMS_DIR, `${id}.json`), 'utf-8'));
  } catch {
    return null;
  }
}

export async function saveExperience(item: ExperienceEntry): Promise<void> {
  await fs.mkdir(EXPERIENCE_ITEMS_DIR, { recursive: true });
  await fs.writeFile(path.join(EXPERIENCE_ITEMS_DIR, `${item.id}.json`), JSON.stringify(item, null, 2), 'utf-8');
  await fs.writeFile(path.join(EXPERIENCE_ITEMS_DIR, `${item.id}.md`), buildExperienceMarkdown(item), 'utf-8');
  let index: ExperienceSummary[] = [];
  try { index = JSON.parse(await fs.readFile(EXPERIENCE_INDEX_PATH, 'utf-8')); } catch { /* */ }
  index = index.filter(i => i.id !== item.id);
  index.unshift(toExperienceSummary(item));
  await fs.writeFile(EXPERIENCE_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

export async function deleteExperience(id: string): Promise<boolean> {
  let index: ExperienceSummary[] = [];
  try { index = JSON.parse(await fs.readFile(EXPERIENCE_INDEX_PATH, 'utf-8')); } catch { return false; }
  const before = index.length;
  index = index.filter(i => i.id !== id);
  if (index.length === before) return false;
  await fs.writeFile(EXPERIENCE_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
  try { await fs.unlink(path.join(EXPERIENCE_ITEMS_DIR, `${id}.json`)); } catch { /* */ }
  try { await fs.unlink(path.join(EXPERIENCE_ITEMS_DIR, `${id}.md`)); } catch { /* */ }
  return true;
}

// === Pipeline Session 存储（深入追问分支画布） ===

const PIPELINE_DIR = path.join(DATA_DIR, 'pipelines');
const PIPELINE_INDEX_PATH = path.join(PIPELINE_DIR, 'index.json');
const PIPELINE_ITEMS_DIR = path.join(PIPELINE_DIR, 'items');

function toPipelineSummary(s: PipelineSession): PipelineSessionSummary {
  return {
    id: s.id,
    entryId: s.entryId,
    title: s.entrySnapshot.title,
    nodeCount: s.nodes.length,
    sedimentCount: s.sediment.length,
    savedWikiItemId: s.savedWikiItemId,
    updatedAt: s.updatedAt,
  };
}

export async function getPipelineIndex(): Promise<PipelineSessionSummary[]> {
  try {
    return JSON.parse(await fs.readFile(PIPELINE_INDEX_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

export async function getPipelineSession(id: string): Promise<PipelineSession | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(PIPELINE_ITEMS_DIR, `${id}.json`), 'utf-8')) as PipelineSession;
    // 老数据迁移：把 detail: string 升级为 mode='full' + excerpts=[detail]
    if (Array.isArray(raw.sediment)) {
      raw.sediment = raw.sediment.map(s => {
        const legacy = s as SedimentPoint & { detail?: string };
        if (!legacy.mode || !Array.isArray(legacy.excerpts)) {
          return {
            id: legacy.id,
            fromNode: legacy.fromNode,
            mode: 'full',
            text: legacy.text,
            excerpts: legacy.detail ? [legacy.detail] : [],
            markedAt: legacy.markedAt,
            suggestedSection: legacy.suggestedSection,
            order: legacy.order,
          };
        }
        return legacy;
      });
    }
    return raw;
  } catch {
    return null;
  }
}

export async function savePipelineSession(session: PipelineSession): Promise<void> {
  await fs.mkdir(PIPELINE_ITEMS_DIR, { recursive: true });
  session.updatedAt = new Date().toISOString();
  await fs.writeFile(
    path.join(PIPELINE_ITEMS_DIR, `${session.id}.json`),
    JSON.stringify(session, null, 2),
    'utf-8',
  );
  let index: PipelineSessionSummary[] = [];
  try { index = JSON.parse(await fs.readFile(PIPELINE_INDEX_PATH, 'utf-8')); } catch { /* */ }
  index = index.filter(i => i.id !== session.id);
  index.unshift(toPipelineSummary(session));
  await fs.writeFile(PIPELINE_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

export async function deletePipelineSession(id: string): Promise<boolean> {
  let index: PipelineSessionSummary[] = [];
  try { index = JSON.parse(await fs.readFile(PIPELINE_INDEX_PATH, 'utf-8')); } catch { return false; }
  const before = index.length;
  index = index.filter(i => i.id !== id);
  if (index.length === before) return false;
  await fs.writeFile(PIPELINE_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
  try { await fs.unlink(path.join(PIPELINE_ITEMS_DIR, `${id}.json`)); } catch { /* */ }
  return true;
}
