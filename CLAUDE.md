# AI Digest

AI 前沿技术研究助手 —— 批量解析 + 深度研究，让知识复利而非堆积。

## 技术栈
- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) — Agent 引擎，复用本地 Max 订阅
- Scrapling (Python) — 网页抓取
- SSE（深度研究）+ 轮询（批量解析）— 前后端通信

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
│   ├── page.tsx              # 主页面（五种视图：triage / digest / entry / blueprint / wiki-detail）
│   ├── globals.css           # OKLCH 色彩系统 + 设计 tokens
│   ├── api/triage/route.ts   # 解析 API（POST 创建 / GET 轮询 / DELETE）
│   ├── api/triage-chat/route.ts # 解析卡片内置聊天 API（轻量 SSE）
│   ├── api/digest/route.ts   # Agent SSE 流（深度研究）
│   ├── api/chat/route.ts     # Agent SSE 流（追问对话）
│   ├── api/wiki/route.ts     # Wiki 词条 API（GET 列表/详情/邻域/按来源查询）
│   ├── api/blueprint/route.ts # 返回系统提示词（原理页）
│   ├── api/respond/route.ts  # 用户交互回复
│   └── api/entries/route.ts  # 知识库条目 API（GET + PUT 留底 + PATCH + DELETE）
├── lib/
│   ├── triage.ts             # 解析 Agent（具名技术识别 + Wiki 匹配 + 组合分析 + 增量统计）
│   ├── agent.ts              # 深研 Agent（采集→溯源→识别→叙事报告+概念拆解→归档）
│   ├── chat.ts               # 追问对话 Agent（研究报告全文为上下文）
│   ├── compiler.ts           # Wiki 存储（从深研已提取的概念直接存入，无独立 LLM 调用）
│   ├── storage.ts            # 数据读写（JSON + MD 持久化 + triage batch + wiki）
│   └── types.ts              # 类型定义（DigestEntry + NarrativeReport + WikiEntry + AnalysisConcept）
├── components/
│   ├── TriageView.tsx        # 解析视图（单条深研 + 批量解析 + 卡片列表 + 确认栏）
│   ├── TriageCard.tsx        # 解析卡片（叙述模式 + 概念弹窗 + 内置聊天 + 增量统计）
│   ├── WikiDetail.tsx        # Wiki 词条详情（原子/组合自动标签 + 组成树 + 被引用 + 来源溯源）
│   ├── Sidebar.tsx           # 侧边栏（[+ 解析] 入口 + [条目|Wiki] tab + 原理链接）
│   ├── AnalysisView.tsx      # 叙事研究报告（渐进式：一句话→矛盾→洞察→机制→效果→启发→概念索引）
│   ├── ChatPanel.tsx         # 追问对话面板（流式渲染 + 持久化历史）
│   ├── BlueprintView.tsx     # 运行原理页
│   ├── PhaseIndicator.tsx    # 5 阶段进度指示器（采集→溯源→识别→叙事→归档）
│   └── StreamView.tsx        # 流式输出展示
├── hooks/
│   ├── useTriage.ts          # 前端研判状态管理（提交 + 轮询 + 改判 + 确认）
│   ├── useDigest.ts          # 前端 digest 状态管理
│   ├── useChat.ts            # 前端 chat 状态管理
│   └── useWiki.ts            # 前端 Wiki 状态管理
data/                         # 知识库存储（index.json + 按日期目录 + triage.json + wiki/）
scripts/scrape.py             # Scrapling 抓取脚本
.impeccable.md                # 设计上下文（impeccable 套件）
```

## 产品流程
```
批量链接 → 解析（具名技术识别+溯源+Wiki匹配+组合分析）→ 叙述卡片 → 用户挑选
                                                               ↓
           跳过(丢弃) / 留底(存入知识库) / 深入 → 深度研究 → 知识库 + Wiki
                                  ↓                                    ↑
                             知识库条目 ──── 一键深入（复用 ID 覆盖）───┘

深研报告：问题驱动叙事（一句话→现状与矛盾→核心洞察→方案机制→效果与边界→启发→概念索引）
概念拆解：具名技术 + composed-of 关系 → Wiki 积累
增量判断：基于 Wiki 已有词条客观统计（newCount/knownCount），非主观打分
```

## 代码规范
- 中文注释，英文变量名
- 色彩用 OKLCH，暖色调中性色 + 墨绿强调色
- 深度研究通过 SSE 推送事件，批量解析通过 3s 轮询
