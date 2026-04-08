---
{
  "id": "awesome-design-md",
  "name": "awesome-design-md",
  "aliases": [
    "VoltAgent/awesome-design-md"
  ],
  "domain": "Open Source / Design System Collection",
  "summary": "一个开源的 DESIGN.md 文件集合，收录 58+ 顶级产品（Stripe、Notion、Apple 等）的设计规范，从公开 CSS 中提取并标准化为 DESIGN.md 格式，供 AI 编码代理直接使用。",
  "relations": [
    {
      "conceptId": "design-md-format",
      "conceptName": "DESIGN.md",
      "type": "related",
      "description": "awesome-design-md 是 DESIGN.md 格式的大规模实践应用"
    },
    {
      "conceptId": "agent-skills-standard",
      "conceptName": "Agent Skills",
      "type": "related",
      "description": "两者遵循相同模式：社区驱动的结构化 Markdown 规范集合供 AI Agent 消费——一个面向 UI 设计系统，一个面向程序性技能"
    },
    {
      "conceptId": "google-stitch",
      "conceptName": "Google Stitch",
      "type": "related",
      "description": "Stitch 定义了 DESIGN.md 格式标准，awesome-design-md 据此将 58+ 产品的公开 CSS 批量转化为该格式，放大了格式的生态覆盖"
    },
    {
      "conceptId": "context-governance",
      "conceptName": "Context Governance",
      "type": "related",
      "description": "awesome-design-md 提供即用型设计约束文件库，直接充当 Context Governance 第一层（约束注入）的预制内容源"
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

awesome-design-md 是 VoltAgent 组织在 GitHub 上维护的资源仓库，将 58+ 知名产品的公开 CSS 样式逆向提取为标准化的 DESIGN.md 文件。每个产品包含三个文件：DESIGN.md（规范）、preview.html（视觉预览）、preview-dark.html（暗色预览）。覆盖 AI/ML、开发者工具、设计工具、基础设施、金融科技、企业/消费者、汽车品牌等 7 大类别。MIT 许可证发布。

## 能做什么

- 一键复用 Stripe/Notion/Apple 等产品的视觉风格
- 为 AI Agent 提供即用型设计约束，消除「AI 味」UI
- 降低独立开发者和小团队的设计成本
- 作为社区贡献平台持续扩展设计系统覆盖范围

## 现状与局限

- 设计规范来自公开 CSS 逆向工程，精度有限
- 不包含原始品牌的动效、交互细节
- 品牌方可能对其设计语言被大规模复用持保留态度（虽然 MIT 许可声明不主张品牌所有权）
- 维护依赖社区贡献，规范的时效性和准确性需持续更新