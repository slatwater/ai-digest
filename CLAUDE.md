# AIDigest

AI 前沿技术研究助手 —— 批量解析 + 深度研究，让知识复利而非堆积。

## 技术栈
- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) — Agent 引擎，复用本地 Max 订阅
- Scrapling (Python) — 网页抓取
- SSE（深入追问/沙盒/实验）+ 轮询（批量解析）— 前后端通信

## 开发命令
```bash
PORT=3003 npm run dev  # 启动开发服务器（DevDash 托管，端口 3003）
npm run build          # 生产构建
npm run lint           # ESLint 检查
```

## 工程索引
```
src/
├── app/
│   ├── page.tsx              # 主页面（triage/wiki/sandbox/blueprint）
│   ├── globals.css           # OKLCH 色彩系统 + 设计 tokens
│   ├── api/triage/route.ts   # 解析 API（POST 创建 / GET 轮询 / DELETE）
│   ├── api/triage-chat/route.ts # 解析卡片聊天 SSE
│   ├── api/expand/route.ts   # 定向扩展 SSE（轻量 agent）
│   ├── api/wiki/route.ts + categories/route.ts # Wiki 条目 + 分类 CRUD
│   ├── api/pipeline/route.ts + [id]/(ask|save) # 深入追问：建 session / 提问 SSE / 手动分组存 Wiki
│   ├── api/sandbox/route.ts + skill-import/route.ts # 沙盒 SSE + GitHub SKILL.md 导入
│   └── api/experiment/route.ts + experiences/route.ts # 实验 SSE + 经验 CRUD
├── lib/
│   ├── triage.ts             # 解析 Agent（溯源 + 具名技术识别 + 方向提炼）
│   ├── expand.ts             # 定向扩展 Agent
│   ├── pipeline.ts           # 深入追问 Agent（分支画布节点树 + SDK session resume）
│   ├── sandbox.ts            # Skill 沙盒运行时（按需读取 + 会话持久化 + /command 路由）
│   ├── experiment.ts         # 实验运行时（仅读 wiki 源链接 + WebFetch + Bash coze）
│   ├── storage.ts            # 数据读写 + pipeline session 老数据迁移
│   └── types.ts              # 类型（TriageEntry/WikiItem/SkillFile/PipelineSession/SedimentPoint 等）
├── components/
│   ├── TriageView.tsx + TriageCard.tsx    # 解析视图 + 卡片（叙述 + 方向扩展 + 聊天）
│   ├── PipelineView.tsx      # 深入追问画布（分支节点 + 标记要点 + 手动分组存 Wiki）
│   ├── WikiBrowseView.tsx    # Wiki 三级钻取（分类→条目→详情+编辑+skill导入）
│   ├── SandboxView.tsx       # Skill 沙盒（选 skill → 对话执行 + 轨迹）
│   ├── ExperimentView.tsx + ExperienceView.tsx # 实验 + 经验沉淀
│   └── BlueprintView.tsx     # 运行原理页
├── hooks/
│   ├── useTriage.ts / usePipeline.ts / useSandbox.ts / useExperiment.ts
data/                         # JSON+MD 持久化（triage/wiki/pipelines/experiences）
scripts/scrape.py             # Scrapling 抓取
```

## 产品流程
```
批量链接 → 解析（溯源+具名技术识别）→ 解析卡片
                            ↓
        深入追问：画布分支节点（Q/A 对）→ 标记要点为「沉淀」（全量 Q+A 或自定义多段摘录）
                            ↓
        整理存入 Wiki：按 suggestedSection 手动分组 → 编辑段落 → 后端按 sedimentIds 无损拼原文
Wiki 浏览：分类 → 条目列表 → 详情（可编辑 + skill 导入）
Skill 沙盒：选条目 → 导入 SKILL.md → 按需读取 + 会话持久化 → /command 路由
实验：多选 wiki → 研究员仅读源链接 + WebFetch → coze CLI 验证 → 产出「经验」
```
## 代码规范
- 中文注释，英文变量名；色彩 OKLCH；方向 B 视觉：#f4ede0 纸底 + #c94a1a 朱砂红 + #1a1713 墨线 + Fraunces 衬线 + 硬阴影
- SSE 统一用 buffer + `\n\n` 分割；narrative 标记 `[[技术名]]`
- Wiki 条目段落内容=原文无损拼接（每段前 `> ↳ 来自 Q<nodeId> @ HH:MM:SS` 标签），不做 AI 改写
