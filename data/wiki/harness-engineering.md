---
{
  "id": "harness-engineering",
  "name": "Harness Engineering",
  "aliases": [
    "线束工程",
    "驾驭工程",
    "Agent Harness Engineering"
  ],
  "domain": "AI Agent Architecture / Software Engineering",
  "summary": "一种新兴工程学科，研究如何设计约束结构（提示词、工具、权限、状态、恢复、验证、制度）使 AI 编码代理在真实工程环境中可靠运行。核心主张是：一旦能写代码的模型进入真实工程环境，主要问题不再是回答质量而是行为后果。",
  "relations": [
    {
      "conceptId": "agent-query-loop",
      "conceptName": "Agent Query Loop",
      "type": "composed-of",
      "description": "主循环是 Harness 的心跳器官"
    },
    {
      "conceptId": "context-governance",
      "conceptName": "Context Governance",
      "type": "composed-of",
      "description": "上下文治理是 Harness 的记忆与预算管理器官"
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
  "updatedAt": "2026-04-07T05:55:52.069Z"
}
---

## 是什么

**Harness Engineering** 将 AI Agent 的运行时基础设施定义为一个由六大器官组成的控制体：

1. **控制面**（Control Plane）：提示词分层与组装策略
2. **主循环**（Query Loop）：代理的心跳节奏和执行调度
3. **工具权限**（Tool Governance）：权限决策链路和沙箱隔离
4. **上下文治理**（Context Governance）：长会话中的记忆与预算管理
5. **错误恢复**（Error Recovery）：将模型错误视为运行时常态的恢复路径
6. **多代理验证**（Multi-Agent Verification）：生成与验证的结构性分离

关键区分：Harness Engineering ≠ Prompt Engineering 的放大版。Prompt Engineering 关注「说什么让模型回答更好」；Harness Engineering 关注「当模型的回答被执行后，系统如何承担后果」。

## 能做什么

- 使 AI 编码代理从「演示级玩具」升级为「生产级工具」
- 为团队选择或自建 AI 代理系统提供结构化的判断框架
- 将个人 prompt 技巧沉淀为可复用的组织制度（CLAUDE.md、.codex/rules）
- 支撑大规模 AI 辅助开发（如 OpenAI 的百万行零人工编码实验）

## 现状与局限

- 学科仍处于早期形成阶段，术语和边界尚未完全稳定
- 高度依赖具体产品实现（Claude Code、Codex），通用理论框架尚未成熟
- 书籍分析基于特定时间点的源码快照，产品迭代可能导致分析过时
- 缺乏量化的效果评估框架——目前更多是定性的架构分析