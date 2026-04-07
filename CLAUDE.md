# AI Digest

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
│   ├── page.tsx              # 主页面（六种视图：triage/digest/entry/blueprint/wiki-detail/wiki-chat）
│   ├── globals.css           # OKLCH 色彩系统 + 设计 tokens
│   ├── api/triage/route.ts   # 解析 API（POST 创建 / GET 轮询 / DELETE）
│   ├── api/triage-chat/route.ts # 解析卡片内置聊天 API（轻量 SSE）
│   ├── api/digest/route.ts   # Agent SSE 流（深度研究）
│   ├── api/chat/route.ts     # Agent SSE 流（条目追问）
│   ├── api/wiki-chat/route.ts # Agent SSE 流（Wiki 对话，知识库级别问答）
│   ├── api/wiki/route.ts     # Wiki 词条 API（GET + POST 重编译）
│   ├── api/blueprint/route.ts # 返回系统提示词（原理页）
│   ├── api/respond/route.ts  # 用户交互回复
│   └── api/entries/route.ts  # 知识库条目 API（GET + PUT 留底 + PATCH + DELETE）
├── lib/
│   ├── triage.ts             # 解析 Agent（具名技术识别 + Wiki 匹配 + 组合分析 + 增量统计）
│   ├── agent.ts              # 深研 Agent（采集→溯源→识别→叙事报告+概念拆解→归档）
│   ├── chat.ts               # 条目追问 Agent（研究报告全文为上下文）
│   ├── wiki-chat.ts          # Wiki 对话 Agent（索引路由+按需读取词条全文+WebSearch）
│   ├── compiler.ts           # Wiki 编译（概念存入+多来源重编译+跨概念关联发现）
│   ├── storage.ts            # 数据读写（JSON + MD 持久化 + triage batch + wiki）
│   └── types.ts              # 类型定义（DigestEntry + NarrativeReport + WikiEntry + AnalysisConcept）
├── components/
│   ├── TriageView.tsx        # 解析视图（单条深研 + 批量解析 + 卡片列表 + 确认栏）
│   ├── TriageCard.tsx        # 解析卡片（叙述模式 + 概念弹窗 + 内置聊天 + 增量统计）
│   ├── WikiDetail.tsx        # Wiki 词条详情（原子/组合标签 + 关系 + 来源 + 综合编译按钮）
│   ├── WikiChatView.tsx      # Wiki 对话视图（知识库级问答 + 预设问题引导）
│   ├── Sidebar.tsx           # 侧边栏（[+ 解析] + [条目|Wiki] tab + Wiki对话 + 原理）
│   ├── AnalysisView.tsx      # 叙事研究报告（渐进式：一句话→矛盾→洞察→机制→效果→启发→概念索引）
│   ├── ChatPanel.tsx         # 条目追问（右侧抽屉面板）
│   ├── BlueprintView.tsx     # 运行原理页
│   ├── PhaseIndicator.tsx    # 5 阶段进度指示器（采集→溯源→识别→叙事→归档）
│   └── StreamView.tsx        # 流式输出展示
├── hooks/
│   ├── useTriage.ts          # 前端研判状态管理（提交 + 轮询 + 改判 + 确认）
│   ├── useDigest.ts          # 前端 digest 状态管理
│   ├── useChat.ts            # 前端条目追问状态管理
│   ├── useWikiChat.ts        # 前端 Wiki 对话状态管理（顶层持久化）
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

Wiki 编译流程：
  概念入库 → 多来源词条自动重编译（LLM通读所有来源综合重写）
           → 跨概念关联发现（LLM扫描新旧概念，自动写入双向relations）

Wiki 对话：索引路由 → 按需读取词条全文 → 跨概念推理回答
```

## 代码规范
- 中文注释，英文变量名
- 色彩用 OKLCH，暖色调中性色 + 墨绿强调色
- 深度研究/Wiki对话通过 SSE 推送事件，批量解析通过 3s 轮询
