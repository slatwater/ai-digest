---
{
  "id": "design-md-format",
  "name": "DESIGN.md",
  "aliases": [
    "Design.md",
    "DESIGN.md Format",
    "设计规范 Markdown"
  ],
  "domain": "AI Agent / Design System / UI Generation",
  "summary": "一种纯 Markdown 格式的设计系统描述文件，由 Google Stitch 引入，让 AI 编码代理直接读取并生成风格一致的 UI。九段标准结构涵盖从视觉氛围到组件状态到 Agent 提示指南的完整设计语言。",
  "relations": [
    {
      "conceptId": "agent-skills-standard",
      "conceptName": "Agent Skills / SKILL.md",
      "type": "related",
      "description": "共享「Markdown 文件驱动 Agent 行为」的元模式——SKILL.md 定义程序性技能，DESIGN.md 定义视觉设计语言"
    },
    {
      "conceptId": "context-governance",
      "conceptName": "Context Governance",
      "type": "related",
      "description": "DESIGN.md 与 CLAUDE.md 类似，都是通过项目级文件向 Agent 注入约束，属于上下文治理的设计系统维度"
    },
    {
      "conceptId": "google-stitch",
      "conceptName": "Google Stitch",
      "type": "part-of",
      "description": "DESIGN.md 格式由 Google Stitch 定义并首次引入"
    },
    {
      "conceptId": "harness-engineering",
      "conceptName": "Harness Engineering",
      "type": "related",
      "description": "DESIGN.md 是 Harness Engineering 控制面（约束注入层）在 UI 设计领域的具体实例化，与 CLAUDE.md 同构但专注于视觉规范约束"
    }
  ],
  "sources": [
    {
      "entryId": "7bdf383d-9463-4c87-9927-21d7ce08a7cb",
      "entryTitle": "DESIGN.md：用 Markdown 文件让 AI 编码代理告别「AI 味」UI",
      "date": "2026-04-07T13:48:17.358Z",
      "contribution": "Google Stitch 提出 DESIGN.md 纯文本设计系统格式，awesome-design-md 项目收集 58+ 顶级产品的设计规范供 AI 编码代理直接消费，一周获 23k Star。"
    }
  ],
  "tags": [],
  "createdAt": "2026-04-07T13:48:17.363Z",
  "updatedAt": "2026-04-07T13:49:19.619Z"
}
---

## 是什么

DESIGN.md 是放在项目根目录的纯文本 Markdown 文件，包含九个标准段落：Visual Theme & Atmosphere、Color Palette & Roles、Typography Rules、Component Stylings、Layout Principles、Depth & Elevation、Do's and Don'ts、Responsive Behavior、Agent Prompt Guide。

核心设计原则是「Markdown 是 LLM 的母语」——不需要 JSON schema、不需要解析库、不需要 Figma 插件，纯文本直接被 Agent 消费。文件同时承载设计数值（hex 色值、字号）和设计意图（氛围描述、护栏规则），弥补了传统 design token 只有值没有语义的缺陷。

## 能做什么

- AI 编码代理（Claude Code、Cursor、Copilot 等）无需额外配置即可读取设计规范生成一致 UI
- 设计系统可通过 Git 版本控制，与代码同步演进
- 跨工具可移植：同一个 DESIGN.md 可用于 Google Stitch、Claude Code、Cursor 等任何支持 Markdown 的 Agent
- 独立开发者可直接复用顶级产品的视觉语言

## 现状与局限

- 无法描述复杂动效、micro-interaction 等非静态设计元素
- 缺乏自动化验证机制——无法检查生成的 UI 是否真的符合规范
- 从公开 CSS 逆向提取的规范是近似值，不等于原始设计系统
- 设计系统的微妙之处（如品牌调性的场景化变体）难以用文本完全表达