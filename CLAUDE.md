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
│   ├── page.tsx              # 主页面（默认进入 PipelineView 统一画布）
│   ├── globals.css           # OKLCH 色彩系统 + 设计 tokens
│   ├── api/triage/route.ts   # 解析 API（POST 创建 / GET 轮询 / DELETE）
│   ├── api/expand/route.ts   # 定向扩展 SSE（轻量 agent）
│   ├── api/wiki/route.ts + categories/route.ts # Wiki 条目 + 分类 CRUD
│   ├── api/pipeline/route.ts + [id]/(ask|save) # 统一画布会话（无 entry 可建） + 追问 SSE + 存 Wiki
│   ├── api/sandbox/route.ts + skill-import/route.ts # 沙盒 SSE + GitHub SKILL.md 导入
│   └── api/experiment/route.ts + experiences/route.ts # 实验 SSE + 经验 CRUD
├── lib/
│   ├── triage.ts             # 解析 Agent（溯源 + 具名技术识别）
│   ├── pipeline.ts           # 追问 Agent（沿 parent 回溯到最近 parse 节点取 context）
│   ├── sandbox.ts            # Skill 沙盒运行时
│   ├── experiment.ts         # 实验运行时（仅读 wiki 源链接 + WebFetch + Bash coze）
│   ├── storage.ts            # 数据读写 + 老数据迁移（entrySnapshot 可空）
│   └── types.ts              # PipelineNode.type = input|parse|question|answer
├── components/
│   ├── PipelineView.tsx      # 统一画布：input→parse→Q→A 水平流 + 多条并排 + ParseDetailSheet
│   ├── TriageCard.tsx        # 解析卡片（保留为弹窗内的渲染片段，主视图已下线）
│   ├── WikiBrowseView.tsx    # Wiki 三级钻取
│   ├── SandboxView.tsx / ExperimentView.tsx / ExperienceView.tsx / BlueprintView.tsx
├── hooks/
│   ├── usePipeline.ts        # 统一生命周期：ensureSession / addInputFlow / submitInput / ask / markNode
│   ├── useTriage.ts / useSandbox.ts / useExperiment.ts
data/                         # JSON+MD 持久化（triage/wiki/pipelines/experiences）
scripts/scrape.py             # Scrapling 抓取
```

## 产品流程
```
统一画布（默认进入，无需切视图）：
  [input 卡] 粘贴 URL → [parse 卡] × N（同 batch 并列，左边条朱砂红）
         连线上实时显示 liveStatus（capture/trace/…）
  双击 parse 卡 → ParseDetailSheet（完整 narrative + 概念 + 溯源） → [深入追问]
  [question]→[answer] 向右延伸；派生分支上下偏移；多条流用「+ 新流程」上下并排
  标记要点（answer 卡）→ 右侧 SedimentTray → 「整理 → 存入 Wiki」
Wiki / Skill 沙盒 / 实验 / 经验 / 运行原理：顶导切换
```
## 代码规范
- 中文注释，英文变量名；色彩 OKLCH；方向 B 视觉：#f4ede0 纸底 + #c94a1a 朱砂红 + #1a1713 墨线 + Fraunces 衬线 + 硬阴影
- 节点左边条区分类型：input=墨黑 / parse=朱砂红 / question=琥珀 / answer=墨灰
- 画布水平流：父节点右边中线 → 子节点左边中线 bezier；input→parse 虚线 + 中点标 liveStatus
- SSE 统一用 buffer + `\n\n` 分割；narrative 标记 `[[技术名]]`
- Triage batch 内 entry 匹配 PipelineNode 按 URL，不依赖后端 UUID
