# AI Digest

AI 前沿技术研究助手 —— 输入链接，自动抓取、溯源、分析、生成 Demo、归档。

## 技术栈
- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) — Agent 引擎，复用本地 Max 订阅
- Scrapling (Python) — 网页抓取
- SSE — 前后端实时通信

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
│   ├── page.tsx              # 主页面（两栏布局：侧边栏 + 内容区）
│   ├── globals.css           # OKLCH 色彩系统 + 设计 tokens
│   ├── api/digest/route.ts   # Agent SSE 流
│   ├── api/respond/route.ts  # 用户交互回复
│   └── api/entries/route.ts  # 知识库条目 API（GET + DELETE）
├── lib/
│   ├── agent.ts              # Agent 管道（采集→溯源→分析→实践→归档）
│   ├── storage.ts            # 数据读写（JSON + MD 持久化 + 删除）
│   └── types.ts              # 类型定义（含 DigestData 可视化 schema）
├── components/
│   ├── Sidebar.tsx           # 知识库侧边栏（含删除功能）
│   ├── AnalysisView.tsx      # 结构化分析报告 + Demo iframe 预览
│   ├── PhaseIndicator.tsx    # 5 阶段进度指示器
│   └── StreamView.tsx        # 流式输出展示
└── hooks/useDigest.ts        # 前端 digest 状态管理
data/                         # 知识库存储
scripts/scrape.py             # Scrapling 抓取脚本
.impeccable.md                # 设计上下文（impeccable 套件）
```

## 代码规范
- 中文注释，英文变量名
- 色彩用 OKLCH，暖色调中性色 + 墨绿强调色
- Agent 流程通过 SSE 推送事件，前端不轮询
- Demo 始终生成纯 HTML/CSS/JS 单文件，通过 iframe 预览，内容必须基于真实采集数据
