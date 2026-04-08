---
{
  "id": "agent-skills-standard",
  "name": "Agent Skills",
  "aliases": [
    "agentskills.io",
    "Agent Skills Standard",
    "SKILL.md"
  ],
  "domain": "AI Agent / Interoperability Standard",
  "summary": "一种开放的 Agent 技能描述格式，用文件夹 + SKILL.md（YAML frontmatter + Markdown 指令）定义可移植的程序性知识。已被 VS Code Copilot、OpenAI Codex、Gemini CLI 等 20+ 平台采纳。",
  "relations": [
    {
      "conceptId": "context-governance",
      "conceptName": "Context Governance",
      "type": "related",
      "description": "Agent Skills 与 CLAUDE.md 等上下文治理文件共享类似的设计理念——用结构化文本文件约束 Agent 行为"
    },
    {
      "conceptId": "gepa-prompt-evolution",
      "conceptName": "GEPA",
      "type": "related",
      "description": "GEPA 可以自动优化 Skill Document 的内容，提升技能质量"
    },
    {
      "conceptId": "hermes-agent-loop",
      "conceptName": "Hermes Agent Loop",
      "type": "related",
      "description": "Hermes 将 Agent Skills 标准扩展为完整的三阶段生命周期管理（自主创建→运行时改进→进化优化），是该标准最深度的运行时集成"
    },
    {
      "conceptId": "harness-engineering",
      "conceptName": "Harness Engineering",
      "type": "related",
      "description": "Agent Skills 是 Harness Engineering 控制面（提示词分层与组装）的可移植载体，将硬编码的控制逻辑外化为标准化的程序性知识文件"
    },
    {
      "conceptId": "awesome-design-md",
      "conceptName": "awesome-design-md",
      "type": "related",
      "description": "两者遵循相同模式：社区驱动的结构化 Markdown 规范集合供 AI Agent 消费——一个面向 UI 设计系统，一个面向程序性技能"
    }
  ],
  "sources": [
    {
      "entryId": "e0f218cc-13c0-4f26-b074-f5da47d07365",
      "entryTitle": "Hermes Agent：一个能自我学习和改进的开源 AI Agent 框架",
      "date": "2026-04-07T09:20:31.262Z",
      "contribution": "Hermes Agent 是 Nous Research 开发的自我改进 AI Agent 框架，通过自主技能创建、辩证用户建模和集成 RL 训练管道，实现 Agent 能力的持续积累和模型训练的闭环。"
    }
  ],
  "tags": [],
  "createdAt": "2026-04-07T09:20:31.265Z",
  "updatedAt": "2026-04-07T13:49:19.619Z"
}
---

## 是什么

Agent Skills 是一个开放标准格式，核心是包含 `SKILL.md` 文件的文件夹。`SKILL.md` 由 YAML frontmatter（name、description、version、所需环境变量）和结构化 Markdown 正文（When to Use、Quick Reference、Procedure、Pitfalls、Verification）组成。

在 Hermes Agent 中，技能的生命周期被扩展为三个阶段：
1. **自主创建**：Agent 完成复杂任务（5+ 工具调用）后自动提炼为 Skill Document
2. **运行时改进**：技能被调用时根据新执行经验更新内容
3. **进化优化**：通过 GEPA 演化搜索自动产生更优变体

## 能做什么

- 跨 Agent 平台的技能复用（同一技能在 Claude、Codex、Copilot 中通用）
- Agent 的程序性记忆积累（不依赖模型权重更新）
- 社区驱动的技能共享生态（Skills Hub）
- 自动化的技能质量优化管道

## 现状与局限

- 技能质量依赖 LLM 的提炼能力，小模型可能产生低质量技能
- 纯文本格式无法表达复杂的条件逻辑和动态决策树
- 自主创建的技能缺乏自动化的正确性验证
- 标准仍在演进中，跨平台兼容性可能存在细微差异