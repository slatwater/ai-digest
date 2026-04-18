# 代码入口

## 仓库
本地路径：`/Users/sevenstars/Projects/aidigest`
（如已 push GitHub，把链接补这里）

## 主题 / Token 文件
- **`src/app/globals.css`**（401 行）—— 唯一的 token 源头
  - L3-52：`:root` 自定义属性（颜色 / 字号 / 间距 / 动效曲线）
  - L88-160：`.prose` 样式（ReactMarkdown 渲染）
  - L161+：组件级辅助类
- **`tailwind.config`**：无（Tailwind CSS 4 使用 `@theme inline` 直接在 globals.css 里声明）

### 关键 Token 摘要
```css
/* 色彩 */
--bg: #ffffff;
--bg-elevated: oklch(98.5% 0.002 260);
--bg-subtle: oklch(96% 0.003 260);
--text-primary: oklch(12% 0.005 260);
--text-secondary: oklch(35% 0.005 260);
--text-tertiary: oklch(52% 0.004 260);
--text-quaternary: oklch(68% 0.003 260);
--border: oklch(86% 0.003 260);
--border-subtle: oklch(92% 0.002 260);
--accent: oklch(55% 0.15 192);          /* 墨绿青 */
--accent-text: oklch(40% 0.12 192);
--accent-subtle: oklch(96% 0.02 192);
--text-new: oklch(55% 0.15 192);        /* 新知识信号色，与 accent 同色 */
--error: oklch(55% 0.2 25);

/* 字号 */
--text-xs: 0.75rem;     /* 12px — 元数据 */
--text-sm: 0.8125rem;   /* 13px — 正文小号 */
--text-base: 0.9375rem; /* 15px — 正文 */
--text-lg: 1.25rem;     /* 20px — 区段标题 */
--text-xl: 1.75rem;     /* 28px — 页面标题 */

/* 间距（4pt 网格） */
--space-1/2/3/4/6/8/12  /* 4 / 8 / 12 / 16 / 24 / 32 / 48 */

/* 动效 */
--ease-out: cubic-bezier(0.25, 1, 0.5, 1);
--duration-fast: 100ms;
--duration-normal: 180ms;
```

### 字体
- **sans**：Geist Sans（`var(--font-geist-sans)`）—— 正文 / 标题
- **mono**：Geist Mono（`var(--font-geist-mono)`）—— 元数据、URL 域名、token 计数、状态标签

## 核心组件目录
`src/components/`

| 文件 | 职责 |
|------|------|
| `TopNav.tsx` | 顶部导航（5 个 view 切换） |
| `TriageView.tsx` | 解析空态 + 批量解析容器 |
| `TriageSection.tsx` | 解析后展开式叙述视图（含深入入口） |
| `TriageCard.tsx` | 解析卡片（含内置聊天） |
| `PipelineView.tsx` | 深入提问对话（多轮 Q&A） |
| `WikiBrowseView.tsx` | Wiki 三级钻取浏览 |
| `WikiSaveInline.tsx` | 解析后存入 Wiki 的内联对话 |
| `SandboxView.tsx` | Skill 沙盒选择 + 运行 |
| `ExperimentView.tsx` | 实验研究员对话 + Coze 进程 |
| `ExperienceView.tsx` | 经验列表（手风琴折叠） |
| `BlueprintView.tsx` | 运行原理静态页 |
| `StreamView.tsx` / `PhaseIndicator.tsx` / `PhaseSummaryView.tsx` | 流式状态辅助组件 |

## 完整页面样本（建议作为风格基线）
**`src/components/TriageCard.tsx`** —— 这是项目里最复杂的卡片组件，含：
- 折叠/展开
- 概念 chip 列表
- 带 [[]] 内嵌跳转的 narrative 文本
- 来源链接 grid
- 内置聊天（流式 SSE）
- 多种状态：pending / processing / done / error

读这一个文件足以理解项目的视觉语言、状态系统、交互节奏。

## 入口路由
**`src/app/page.tsx`** —— 单页应用，根据 view 状态切换组件

## 后端不需要看
- `src/app/api/`（21 条 API 路由）
- `src/lib/`（agent、storage、token-report 等）

设计师只需要前端三层：`app/page.tsx` 路由 → `components/*` 组件 → `globals.css` token。
