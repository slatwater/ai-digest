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
│   ├── api/pipeline/route.ts + [id]/(ask|save) # 统一画布会话 + 追问 SSE + 选区即存 Wiki
│   └── api/experiment/route.ts + experiences/route.ts # 实验 SSE + 经验 CRUD
├── lib/
│   ├── triage.ts             # 解析 Agent（溯源 + 具名技术识别）
│   ├── pipeline.ts           # 追问 Agent（沿 parent 回溯到最近 parse 节点取 context）
│   ├── experiment.ts         # 实验运行时（仅读 wiki 源链接 + WebFetch + Bash coze）
│   ├── storage.ts            # 数据读写 + 老数据迁移（读取时丢弃旧 sediment / marked / skillFiles 字段）
│   └── types.ts              # PipelineNode.type = input|parse|question|answer|experiment
├── components/
│   ├── PipelineView.tsx      # 统一画布 + ParseDetailSheet/AskSheet + SaveExcerptDialog（选区→存入 Wiki）
│   ├── TriageCard.tsx        # 解析卡片（保留为弹窗内的渲染片段，主视图已下线）
│   ├── WikiBrowseView.tsx    # Wiki/经验 双 tab 扁平卡片墙（分类 chip 过滤 + 管理面板，经验 tab 嵌入 ExperienceView）
│   ├── ExperienceView.tsx / BlueprintView.tsx
├── hooks/
│   ├── usePipeline.ts        # 生命周期：ensureSession / addInputFlow / submitInput / ask / saveExcerptToWiki
│   ├── useTriage.ts
data/                         # JSON+MD 持久化（triage/wiki/pipelines/experiences）
scripts/scrape.py             # Scrapling 抓取
```

## 产品流程
```
统一画布（默认进入，无需切视图）：
  [input 卡] 粘贴 URL / 勾「直接深入」/ 粘原文（paste://）→ [parse 卡] × N（同 batch 并列，左边条朱砂红）
         连线上实时显示 liveStatus（capture/trace/…）；direct 模式跳过 triage agent 只抓锚点
  双击 parse 卡 → ParseDetailSheet（完整 narrative + 概念 + 溯源） → [深入追问]
  Q/A 合并为单卡（只显示问题，双击进 AskSheet）；派生分支上下偏移；「+ 新流程」上下并排
  存入 Wiki：在 ParseDetailSheet 的 narrative 或 AskSheet 的 answer 文本上左键拖选 → 右键 §
         → SaveExcerptDialog（项目名称下拉新建/追加 + 分类 + 段落标题 + 内容预览 + 确认存入）
  answer 卡「❦ 实验」→ teal 色 experiment 节点
  右侧栏 Minimap：类型染色 + 视口框拖拽 + 点节点居中 + streaming 涟漪
Wiki（含经验 tab）/ 运行原理：顶导切换（实验已并入画布 answer 卡操作；Skill 沙盒已下线）
```
## 代码规范
- 中文注释，英文变量名；色彩 OKLCH；方向 B 视觉：#f4ede0 纸底 + #c94a1a 朱砂红 + #1a1713 墨线 + Fraunces 衬线 + 硬阴影
- 节点左边条区分类型：input=墨黑 / parse=朱砂红 / question=琥珀 / experiment=青绿 / answer=墨灰
- 渲染层压紧坐标：`effectiveX` DFS 累积左移（每遇 hidden answer 减 NODE_W+COL_GAP）；`effectiveY` 按存活 flowIdx 连续编号（删除中间流下方自动上移），Minimap 同步
- Narrative 检测到 md 表格时整段走 ReactMarkdown + remarkGfm + `.aidigest-md` 暗底样式，否则用轻量 regex parser；所有 md `<a>` 统一 `target="_blank"`
- 画布水平流：父节点右边中线 → 子节点左边中线 bezier；input→parse 虚线 + 中点标 liveStatus
- SSE 统一用 buffer + `\n\n` 分割；narrative 标记 `[[技术名]]`
- Triage batch 内 entry 匹配 PipelineNode 按 URL，不依赖后端 UUID
- 选区右键菜单：`useSelectionMenu` hook + `SelectionContextMenu` 组件，选区为空则放行浏览器默认菜单

## 可靠性红线
- 解析落盘前必过 `validateSourceConsistency`：声明的 original URL 关键词必须在 scrape 原文里出现，否则降级 error 不得留幻觉
- 追问每轮 prompt 必钉 parse 锚点 + "先读锚点→查 sources→WebSearch"三步，禁首次 WebSearch；X 推文必用 `mcp__aidigest__scrape_url`
- SDK session 按 `branchIdx` 隔离（`branchSessionIds`）；派生分支开新 sid；删光分支 Q/A 时级联清孤儿 sid
- 前端 `localStorage[aidigest.lastPipelineId]` 记上次 session；画布 mount 时先 GET 恢复，失败才新建（刷新不丢）
- flex-column 弹窗必须固定高度（非 auto），内部 flex:1 子区要 `minHeight:0`；长列表默认折叠或限高 + overflowY，避免撑破父布局把输入框挤出视口
- 实验弹窗流式 token 只在「用户粘底」时才 scrollTo，否则保持当前位置让用户可上翻查看历史
- SSE 完成/错误分支必须把节点 `state` PATCH 落盘（仅改内存会导致刷新后残留 `streaming`，画布/缩略图持续显示"正在生成/对话中"）
