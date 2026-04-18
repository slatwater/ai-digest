# AIDigest

AI 前沿技术研究助手 —— 批量解析 + 深度研究，让知识复利而非堆积。

## 技术栈
- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) — Agent 引擎，复用本地 Max 订阅
- Scrapling (Python) — 网页抓取
- SSE（深入提问/Wiki存入/沙盒）+ 轮询（批量解析）— 前后端通信

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
│   ├── api/triage-chat/route.ts # 解析卡片内置聊天 API（轻量 SSE）
│   ├── api/expand/route.ts   # 定向扩展 SSE 流（轻量 agent）
│   ├── api/wiki/route.ts     # Wiki 条目 API（GET + PUT + DELETE）
│   ├── api/wiki/categories/route.ts # Wiki 分类 API（CRUD）
│   ├── api/wiki-save/route.ts # Wiki 存入对话 SSE 流
│   ├── api/wiki-save/confirm/route.ts # Wiki 存入确认（POST）
│   ├── api/sandbox/route.ts  # Skill 沙盒 SSE 流（persistSession + resume）
│   ├── api/skill-import/route.ts # GitHub 仓库 SKILL.md 批量导入
│   ├── api/experiment/route.ts # 实验 SSE 流（WebFetch 源链接 + Bash coze）
│   └── api/experiences/route.ts # 经验 CRUD
├── lib/
│   ├── triage.ts             # 解析 Agent（溯源 + 具名技术识别 + 方向提炼 + 保留原文）
│   ├── expand.ts             # 定向扩展 Agent（接收解析原料 + 方向，聚焦输出 markdown）
│   ├── wiki-save.ts          # Wiki 存入 Agent（多轮对话提议→确认→保存）
│   ├── sandbox.ts            # Skill 沙盒运行时（按需读取 + 会话持久化 + /command 路由 + 执行轨迹）
│   ├── experiment.ts         # 实验运行时（仅读 wiki 源链接 + WebFetch + Bash coze 进程事件）
│   ├── storage.ts            # 数据读写（JSON + MD 持久化 + triage batch + wiki + experiences）
│   └── types.ts              # 类型定义（DigestEntry + WikiItem + SkillFile + TriageEntry + ExperienceEntry）
├── components/
│   ├── TriageView.tsx        # 解析视图（批量解析 + 卡片列表 + 确认栏）
│   ├── TriageCard.tsx        # 解析卡片（叙述 + 方向扩展 + 聊天）
│   ├── WikiBrowseView.tsx    # Wiki 浏览（三级钻取：分类→条目列表→详情+编辑+skill导入）
│   ├── WikiSaveInline.tsx    # Wiki 存入内联对话（PipelineView 内）
│   ├── SandboxView.tsx       # Skill 沙盒（选择 skill → 对话执行 + 执行轨迹）
│   ├── ExperimentView.tsx    # 实验（多选 wiki → 研究员对话 → coze 进程可视化 → 存经验）
│   ├── ExperienceView.tsx    # 经验（列表+详情+编辑，沉淀实验产物）
│   └── BlueprintView.tsx     # 运行原理页
├── hooks/
│   ├── useTriage.ts          # 前端研判状态管理（提交 + 轮询 + 改判 + 确认）
│   ├── useWikiSave.ts        # 前端 Wiki 存入状态管理
│   ├── useSandbox.ts         # 前端 Skill 沙盒状态管理
│   └── useExperiment.ts      # 前端实验状态（消息 + coze 进程 + 保存经验）
data/                         # 存储（index.json + 日期目录 + triage.json + wiki/ + experiences/）
scripts/scrape.py             # Scrapling 抓取脚本
```

## 产品流程
```
批量链接 → 解析（溯源+具名技术识别+方向提炼）→ 解析卡片
                                                    ↓
                              用户深入提问 → PipelineView 多轮对话
                                                    ↓
                              存入 Wiki → agent 多轮对话提议方案 → 用户确认 → 保存

Wiki 浏览：分类 → 条目列表 → 详情（可编辑 + skill 导入）
Skill 沙盒：选择条目 → 导入 SKILL.md → 按需读取 + 会话持久化 → /command 路由执行
实验：多选 wiki → 研究员仅读源链接 → 对话+WebFetch → coze CLI 验证（进程可视化）→ 产出「经验」
经验：沉淀实验产物，独立列表视图（可编辑/删除，记录 coze 调用历史）
```
## 代码规范
- 中文注释，英文变量名
- 色彩用 OKLCH；首页/TopNav 采用方向 B 视觉：#f4ede0 纸底 + #c94a1a 朱砂红 + #1a1713 墨线 + Fraunces 衬线 + mono + 硬阴影
- SSE 解析统一用 buffer + `\n\n` 分割，narrative 标记 `[[技术名]]`（兼容旧 `[[name|tag]]`）
