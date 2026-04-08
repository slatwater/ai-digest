---
{
  "id": "google-stitch",
  "name": "Google Stitch",
  "aliases": [
    "Stitch",
    "Google Labs Stitch"
  ],
  "domain": "AI Design Tool / UI Generation",
  "summary": "Google Labs 推出的 AI 原生 UI 设计平台，从文本提示生成 UI 界面。2026 年 3 月更新引入多屏幕生成、无限画布、交互原型，并定义了 DESIGN.md 格式作为设计系统的可移植标准。",
  "relations": [
    {
      "conceptId": "design-md-format",
      "conceptName": "DESIGN.md",
      "type": "related",
      "description": "Google Stitch 是 DESIGN.md 格式的发起者和主要生产工具"
    },
    {
      "conceptId": "awesome-design-md",
      "conceptName": "awesome-design-md",
      "type": "related",
      "description": "Stitch 定义了 DESIGN.md 格式标准，awesome-design-md 据此将 58+ 产品的公开 CSS 批量转化为该格式，放大了格式的生态覆盖"
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

Google Stitch 是 Google Labs 基于收购的 Galileo AI 技术构建的 AI 原生 UI 设计工具。2025 年首发时仅支持单屏幕文本-to-UI 生成。2026 年 3 月重大更新新增：多屏幕生成、AI 原生无限画布、交互原型、以及 **DESIGN.md 导入/导出能力**。后者使其成为设计系统的生产和分发中心——用户可以在 Stitch 中设计，导出 DESIGN.md 到 Claude Code 或 Cursor 中开发。

## 能做什么

- 从文本描述生成完整 UI 界面
- 通过 DESIGN.md 实现设计-开发工具链的无缝衔接
- 降低 UI 设计门槛，支持「vibe design」工作流
- 免费使用（Google Labs 实验项目）

## 现状与局限

- 仍为 Google Labs 实验项目，稳定性和长期支持未知
- 与 Figma 等成熟设计工具相比功能仍有差距
- 生成质量依赖底层模型能力
- DESIGN.md 导出的设计规范精度取决于 Stitch 的解析能力