---
{
  "id": "context-governance",
  "name": "Context Governance",
  "aliases": [
    "上下文治理",
    "Context Budget Management",
    "上下文预算管理"
  ],
  "domain": "AI Agent Runtime / LLM Context Management",
  "summary": "一套管理 AI Agent 长会话中上下文窗口有限性的工程机制，包括项目级约束文件（CLAUDE.md）、上下文压缩（Compact）和记忆持久化。核心理念是将上下文视为预算而非无限资源，通过制度化的管理防止行为漂移。",
  "relations": [
    {
      "conceptId": "harness-engineering",
      "conceptName": "Harness Engineering",
      "type": "part-of",
      "description": "上下文治理是 Harness 六大器官之一"
    },
    {
      "conceptId": "agent-query-loop",
      "conceptName": "Agent Query Loop",
      "type": "related",
      "description": "每轮循环消耗上下文预算，治理机制决定何时压缩"
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

Context Governance 解决的核心问题是：上下文窗口有限，但代理会话可能持续数小时。它包含三个层次：

1. **约束注入**：CLAUDE.md 文件（项目级/用户级/仓库级）在每轮对话中注入不可遗忘的约束——命名规范、架构决策、安全规则等
2. **预算压缩**：Compact 机制在上下文接近窗口限制时触发，对历史进行压缩摘要，保留关键约束同时释放空间
3. **分层缓存**：静态提示词（永不变化的系统指令）与动态上下文（会话特定数据）之间设置显式缓存边界，确保静态部分命中 prompt cache

与 Codex 的对比：Codex 通过 SQLite 持久化 Thread 实现会话状态管理，不依赖上下文内压缩而是将历史外置到持久存储。

## 能做什么

- 支撑数小时级别的长代理会话而不丧失约束一致性
- 将团队的工程规范编码为代理可读的结构化文件
- 通过缓存优化降低 API 调用成本
- 在组织层面沉淀可复用的代理治理规则

## 现状与局限

- Compact 压缩不可避免地损失信息，可能丢失关键上下文
- CLAUDE.md 的维护成本随项目规模增长
- 缓存边界的设置需要工程经验，设置不当会降低缓存命中率
- 不同团队成员的 CLAUDE.md 可能产生冲突