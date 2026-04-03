# AI Digest

AI 前沿技术研究助手 —— 批量研判 + 深度研究，让知识复利而非堆积。

## 技术栈
- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) — Agent 引擎，复用本地 Max 订阅
- Scrapling (Python) — 网页抓取
- SSE（深度研究）+ 轮询（快速研判）— 前后端通信

## 开发命令
```bash
PORT=3100 npm run dev  # 启动开发服务器
npm run build          # 生产构建
npm run lint           # ESLint 检查
```

## 工程索引
```
src/
├── app/
│   ├── page.tsx              # 主页面（四种视图：triage / digest / entry / blueprint）
│   ├── globals.css           # OKLCH 色彩系统 + 设计 tokens
│   ├── api/triage/route.ts   # 快速研判 API（POST 创建 / GET 轮询 / DELETE）
│   ├── api/digest/route.ts   # Agent SSE 流（深度研究）
│   ├── api/chat/route.ts     # Agent SSE 流（追问对话）
│   ├── api/blueprint/route.ts # 返回系统提示词（原理页）
│   ├── api/respond/route.ts  # 用户交互回复
│   └── api/entries/route.ts  # 知识库条目 API（GET + PUT 留底 + PATCH + DELETE）
├── lib/
│   ├── triage.ts             # 研判 Agent（知识点提取 + 溯源挖掘 + 四维度评分）
│   ├── agent.ts              # 深度研究 Agent（采集→溯源→分析→实践→归档）
│   ├── chat.ts               # 追问对话 Agent（研究报告全文为上下文）
│   ├── storage.ts            # 数据读写（JSON + MD 持久化 + triage batch）
│   └── types.ts              # 类型定义（DigestEntry + TriageBatch + TriageConcept + DigestData）
├── components/
│   ├── TriageView.tsx        # 每日研判主视图（批量输入 + 卡片列表 + 确认栏）
│   ├── TriageCard.tsx        # 研判卡片（知识点 + 评分条 + 三档选择器）
│   ├── Sidebar.tsx           # 知识库侧边栏（研判入口 + 删除 + 原理按钮）
│   ├── AnalysisView.tsx      # 结构化分析报告 + Demo iframe 预览
│   ├── ChatPanel.tsx         # 追问对话面板（流式渲染 + 持久化历史）
│   ├── BlueprintView.tsx     # 运行原理页
│   ├── PhaseIndicator.tsx    # 5 阶段进度指示器
│   └── StreamView.tsx        # 流式输出展示
├── hooks/
│   ├── useTriage.ts          # 前端研判状态管理（提交 + 轮询 + 改判 + 确认）
│   ├── useDigest.ts          # 前端 digest 状态管理
│   └── useChat.ts            # 前端 chat 状态管理
data/                         # 知识库存储（index.json + 按日期目录 + triage.json）
scripts/scrape.py             # Scrapling 抓取脚本
.impeccable.md                # 设计上下文（impeccable 套件）
```

## 产品流程
```
批量链接 → 研判（知识点提取+溯源，逐条 1-2min）→ 研判卡片 → 用户挑选
                                                          ↓
                  跳过(丢弃) / 留底(知识点+评分存入知识库) / 深入 → 深度研究 → 知识库
                                       ↓                                       ↑
                                  知识库条目 ──── 一键深入（复用 ID 覆盖）──────┘
```

## 代码规范
- 中文注释，英文变量名
- 色彩用 OKLCH，暖色调中性色 + 墨绿强调色
- 深度研究通过 SSE 推送事件，研判通过 3s 轮询
- Demo 始终生成纯 HTML/CSS/JS 单文件，通过 iframe 预览，内容必须基于真实采集数据
