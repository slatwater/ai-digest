# AIDigest

AI 前沿技术研究助手 —— 批量解析 + 深度研究，让知识复利而非堆积。

## 技术栈
- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) — Agent 引擎，复用本地 Max 订阅
- Scrapling (Python) — 网页抓取
- SSE（深度研究/Wiki对话）+ 轮询（批量解析）— 前后端通信

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
│   ├── page.tsx              # 主页面（triage/library/wiki/wiki-chat/blueprint）
│   ├── globals.css           # OKLCH 色彩系统 + 设计 tokens
│   ├── api/triage/route.ts   # 解析 API（POST 创建 / GET 轮询 / DELETE）
│   ├── api/triage-chat/route.ts # 解析卡片内置聊天 API（轻量 SSE）
│   ├── api/expand/route.ts   # 定向扩展 SSE 流（轻量 agent）
│   ├── api/wiki/route.ts     # Wiki 条目 API（GET + PUT + DELETE）
│   ├── api/wiki/categories/route.ts # Wiki 分类 API（CRUD）
│   ├── api/wiki-save/route.ts # Wiki 存入对话 SSE 流
│   ├── api/wiki-save/confirm/route.ts # Wiki 存入确认（POST）
│   ├── api/chat/route.ts     # 条目追问 SSE 流
│   ├── api/wiki-chat/route.ts # Wiki 对话 SSE 流
│   ├── api/entries/route.ts  # 知识库条目 API（GET + PUT + PATCH + DELETE）
│   └── api/export/route.ts   # 导出 Markdown（→ ~/Desktop/研究/）
├── lib/
│   ├── triage.ts             # 解析 Agent（溯源 + 具名技术识别 + 方向提炼 + 保留原文）
│   ├── expand.ts             # 定向扩展 Agent（接收解析原料 + 方向，聚焦输出 markdown）
│   ├── agent.ts              # 深研 Agent（遗留，UI 入口已移除）
│   ├── chat.ts               # 条目追问 Agent（研究报告全文为上下文）
│   ├── wiki-chat.ts          # Wiki 对话 Agent（索引路由+按需读取词条全文+WebSearch）
│   ├── wiki-save.ts          # Wiki 存入 Agent（多轮对话提议→确认→保存）
│   ├── storage.ts            # 数据读写（JSON + MD 持久化 + triage batch + wiki）
│   └── types.ts              # 类型定义（DigestEntry + WikiItem + TriageEntry + AnalysisConcept）
├── components/
│   ├── TriageView.tsx        # 解析视图（批量解析 + 卡片列表 + 确认栏）
│   ├── TriageCard.tsx        # 解析卡片（叙述 + 方向扩展 + 聊天）
│   ├── WikiBrowseView.tsx    # Wiki 浏览（三级钻取：分类→条目列表→详情+编辑）
│   ├── WikiSaveInline.tsx    # Wiki 存入内联对话（PipelineView 内）
│   ├── WikiChatView.tsx      # Wiki 对话视图（知识库级问答 + 预设问题引导）
│   ├── Sidebar.tsx           # 侧边栏（遗留，未使用）
│   ├── AnalysisView.tsx      # 叙事研究报告（渐进式深度展示）
│   ├── ChatPanel.tsx         # 条目追问（右侧抽屉面板）
│   ├── BlueprintView.tsx     # 运行原理页
│   ├── PhaseIndicator.tsx    # 5 阶段进度指示器（采集→溯源→识别→叙事→归档）
│   └── StreamView.tsx        # 流式输出展示
├── hooks/
│   ├── useTriage.ts          # 前端研判状态管理（提交 + 轮询 + 改判 + 确认）
│   ├── useDigest.ts          # 前端 digest 状态管理
│   ├── useChat.ts            # 前端条目追问状态管理
│   ├── useWikiChat.ts        # 前端 Wiki 对话状态管理（顶层持久化）
│   └── useWikiSave.ts        # 前端 Wiki 存入状态管理
data/                         # 知识库存储（index.json + 按日期目录 + triage.json + wiki/items/）
scripts/scrape.py             # Scrapling 抓取脚本
```

## 产品流程
```
批量链接 → 解析（溯源+具名技术识别+方向提炼）→ 解析卡片
                                                    ↓
                              用户深入提问 → PipelineView 多轮对话
                                                    ↓
                              存入 Wiki → agent 多轮对话提议方案 → 用户确认 → 保存

Wiki 浏览：分类 → 条目列表 → 详情（可编辑）
Wiki 对话：索引路由 → 按需读取词条全文 → 跨概念推理回答
```
## 代码规范
- 中文注释，英文变量名
- 色彩用 OKLCH，暖色调中性色 + 墨绿强调色
- 定向扩展/Wiki存入/Wiki对话通过 SSE 推送事件，批量解析通过 3s 轮询
