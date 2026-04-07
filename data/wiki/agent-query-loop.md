---
{
  "id": "agent-query-loop",
  "name": "Agent Query Loop",
  "aliases": [
    "Agentic Loop",
    "主循环",
    "Agent Loop",
    "ReAct Loop（扩展版）"
  ],
  "domain": "AI Agent Runtime",
  "summary": "AI Agent 的核心运行时循环，负责接收模型输出、解析 tool call、执行权限检查、调用工具、注入结果、触发下一轮推理。Claude Code 实现为单线程循环+实时转向队列，Codex 实现为 Thread/Rollout/State 三层持久化结构。",
  "relations": [
    {
      "conceptId": "harness-engineering",
      "conceptName": "Harness Engineering",
      "type": "part-of",
      "description": "Query Loop 是 Harness 六大器官之一"
    },
    {
      "conceptId": "context-governance",
      "conceptName": "Context Governance",
      "type": "related",
      "description": "循环的每一轮都消耗和管理上下文预算"
    }
  ],
  "sources": [
    {
      "entryId": "dd3cab03-66c0-478e-ac51-16f959bdb7ce",
      "entryTitle": "Harness Engineering：AI 编码代理的约束工程学——两本开源书籍的深度技术解析",
      "date": "2026-04-07T05:55:52.066Z",
      "contribution": "两本开源书籍通过逆向工程 Claude Code 和 Codex 源码，系统定义了 Harness Engineering 这一新工程学科——研究如何用约束结构（控制面、主循环、权限、上下文治理、恢复、验证）将不稳定的 AI 模型收束进可持续运行的工程秩序。"
    }
  ],
  "tags": [],
  "createdAt": "2026-04-07T05:55:52.069Z",
  "updatedAt": "2026-04-07T09:13:07.189Z"
}
---

## 是什么

Agent Query Loop 是代理系统的心跳机制，定义了「模型思考→决定行动→执行→观察结果→再思考」的完整周期。在不同系统中有截然不同的实现：

**Claude Code 的实现**：单线程主循环（代号 `nO`），配合实时转向队列（`h2A`）。每轮执行链路为：模型输出 → 解析 tool call → 输入验证 → Hook 拦截 → 权限决策 → 工具执行 → PostHook → 结果注入上下文。秩序在运行时逐轮建立。

**Codex 的实现**：Thread（SQLite 持久化对话，可 fork/回滚）+ Rollout（执行轨迹记录）+ State（跨轮状态管理）。会话本身成为可版本控制的工件。

## 能做什么

- 为代理的每次行动提供结构化的检查点
- 支持中断、恢复、回滚等可靠性机制
- 通过 Hook 机制实现可扩展的行为拦截
- 实现生成与执行的解耦

## 现状与局限

- 单线程循环在需要并行工具执行时可能成为瓶颈
- 循环的每一步都增加延迟，影响交互体验
- 持久化方案（如 Codex 的 SQLite）引入存储和一致性开销