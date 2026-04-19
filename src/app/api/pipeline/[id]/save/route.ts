import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
  getPipelineSession,
  savePipelineSession,
  saveWikiItem,
  getWikiCategories,
  saveWikiCategories,
  getWikiItem,
} from '@/lib/storage';
import type {
  PipelineDraft,
  PipelineSession,
  WikiCategory,
  WikiItem,
  WikiSection,
} from '@/lib/types';

export const runtime = 'nodejs';

// 按 sedimentIds 从 session 查原文 → 拼成无损 markdown
// 每段前加小标签 "> ↳ 来自 Q<父问题 node id> @ HH:MM:SS"
function buildSectionContent(
  sedimentIds: string[],
  session: PipelineSession,
): string {
  const sedimentById = new Map(session.sediment.map(s => [s.id, s]));
  const nodeById = new Map(session.nodes.map(n => [n.id, n]));

  const blocks: string[] = [];
  for (const sid of sedimentIds) {
    const s = sedimentById.get(sid);
    if (!s) continue;
    // 定位父问题 id：如果 fromNode 是 answer，取其 parent；否则自身就是 Q
    const fromNode = nodeById.get(s.fromNode);
    const qNodeId =
      fromNode?.type === 'answer' ? fromNode.parent || s.fromNode : s.fromNode;
    const label = `> ↳ 来自 Q${qNodeId} @ ${s.markedAt}`;
    const body = s.excerpts.join('\n\n');
    blocks.push(`${label}\n\n${body}`);
  }
  return blocks.join('\n\n---\n\n');
}

// 组装最终 WikiSection[]：按 AI 的分组 + 漏分兜底到「其他」段
function assembleSections(
  draft: PipelineDraft,
  session: PipelineSession,
): { sections: WikiSection[]; error?: string } {
  const assigned = new Set<string>();
  const out: WikiSection[] = [];

  for (const sec of draft.sections) {
    if (!Array.isArray(sec.sedimentIds)) continue;
    const ids = sec.sedimentIds.filter(id => !assigned.has(id));
    for (const id of ids) assigned.add(id);
    const content = buildSectionContent(ids, session);
    if (!content.trim()) continue;
    out.push({ heading: sec.heading?.trim() || '未命名段落', content });
  }

  // 漏分的 sediment 塞"其他"段
  const missing = session.sediment.filter(s => !assigned.has(s.id));
  if (missing.length > 0) {
    const content = buildSectionContent(
      missing.map(s => s.id),
      session,
    );
    if (content.trim()) out.push({ heading: '其他', content });
  }

  if (out.length === 0) {
    return { sections: out, error: '未能拼出任何段落内容（sedimentIds 可能全部无效）' };
  }
  return { sections: out };
}

// 把 pipeline session 的 draft 落入 Wiki
// mode=new: 新建 WikiItem
// mode=append: 合并到现有 WikiItem（同名 heading 替换，新 heading 追加）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as { draft?: PipelineDraft };
  const session = await getPipelineSession(id);
  if (!session) return Response.json({ error: 'session 不存在' }, { status: 404 });

  const draft = body.draft ?? session.draft;
  if (!draft || !draft.name?.trim()) {
    return Response.json({ error: '缺少草稿或条目名称' }, { status: 400 });
  }

  // ── 分类处理（可能新建）
  let finalCategoryId = draft.categoryId;
  if (draft.newCategory?.name) {
    const categories = await getWikiCategories();
    const catId = draft.newCategory.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!categories.some(c => c.id === catId)) {
      const cat: WikiCategory = {
        id: catId,
        name: draft.newCategory.name.trim(),
        order: categories.length,
        createdAt: new Date().toISOString(),
      };
      categories.push(cat);
      await saveWikiCategories(categories);
    }
    finalCategoryId = catId;
  }
  if (!finalCategoryId) {
    return Response.json({ error: '缺少分类 id' }, { status: 400 });
  }

  // ── 按 sedimentIds 无损拼接 content
  const { sections: wikiSections, error: assembleError } = assembleSections(draft, session);
  if (assembleError) {
    return Response.json({ error: assembleError }, { status: 400 });
  }

  const now = new Date().toISOString();
  const pipelineBackLink = {
    url: `pipeline://${session.id}`,
    title: `深入追问 session · ${session.entrySnapshot.title}`,
    type: 'related' as const,
  };

  let item: WikiItem;

  if (draft.appendToItemId) {
    // ── 追加模式
    const existing = await getWikiItem(draft.appendToItemId);
    if (!existing) return Response.json({ error: '追加目标不存在' }, { status: 404 });

    // 合并 sections：同名 heading 追加正文，新 heading 追加到末尾
    const mergedSections = [...existing.sections];
    for (const s of wikiSections) {
      const idx = mergedSections.findIndex(x => x.heading === s.heading);
      if (idx >= 0) {
        mergedSections[idx] = {
          heading: mergedSections[idx].heading,
          content: `${mergedSections[idx].content}\n\n---\n\n${s.content}`,
        };
      } else {
        mergedSections.push(s);
      }
    }
    const mergedLinks = [...existing.sourceLinks];
    for (const l of draft.sourceLinks) {
      if (!mergedLinks.some(x => x.url === l.url)) mergedLinks.push(l);
    }
    if (!mergedLinks.some(x => x.url === pipelineBackLink.url)) {
      mergedLinks.push(pipelineBackLink);
    }

    item = {
      ...existing,
      sections: mergedSections,
      sourceLinks: mergedLinks,
      updatedAt: now,
    };
  } else {
    // ── 新建模式
    const sourceLinks = [...draft.sourceLinks];
    if (!sourceLinks.some(x => x.url === pipelineBackLink.url)) {
      sourceLinks.push(pipelineBackLink);
    }
    item = {
      id: uuidv4(),
      name: draft.name.trim(),
      categoryId: finalCategoryId,
      sections: wikiSections,
      sourceLinks,
      createdAt: now,
      updatedAt: now,
    };
  }

  await saveWikiItem(item);

  // 归档到 session
  session.savedWikiItemId = item.id;
  session.draft = { ...draft, categoryId: finalCategoryId, appendToItemId: draft.appendToItemId };
  await savePipelineSession(session);

  return Response.json({ ok: true, itemId: item.id, item });
}
