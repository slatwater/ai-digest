---
{
  "id": "ai-agent-context-governance",
  "name": "Agent 上下文治理",
  "aliases": [
    "Context Governance",
    "Self-Healing Memory",
    "上下文窗口管理",
    "自愈记忆"
  ],
  "domain": "Agent Architecture",
  "summary": "AI Agent 管理有限上下文窗口的工程策略集合，包括上下文压缩、按话题索引的自愈记忆、对话历史裁剪等机制。解决 Agent 在长任务中上下文溢出导致性能退化的核心问题，不同产品采用截然不同的策略（话题索引 vs 全量重放）。",
  "relations": [
    {
      "conceptId": "harness-engineering",
      "conceptName": "Harness Engineering",
      "type": "part-of",
      "description": "上下文治理是 Harness Engineering 七大支柱之一"
    },
    {
      "conceptId": "ai-agent-query-loop",
      "conceptName": "Agent Query Loop",
      "type": "related",
      "description": "Query Loop 每轮迭代消耗上下文，上下文治理决定循环可持续性"
    },
    {
      "conceptId": "llm-self-indexing",
      "conceptName": "LLM 自索引",
      "type": "related",
      "description": "自索引关注静态知识库的组织，上下文治理关注运行时会话状态的动态管理，两者在上下文窗口利用上有交叉"
    },
    {
      "conceptId": "retrieval-augmented-generation",
      "conceptName": "检索增强生成",
      "type": "contrasts",
      "description": "RAG 通过外部检索注入上下文，上下文治理通过压缩和索引管理已有上下文，是互补的两种策略"
    }
  ],
  "sources": [
    {
      "entryId": "f93c8ffa-0d66-43a3-bb17-d424be92b911",
      "entryTitle": "Harness Engineering 双书深度研究：Claude Code 设计指南 & Claude Code 与 Codex 设计哲学对比",
      "date": "2026-04-05T06:37:35.246Z",
      "contribution": "两本系统性拆解 AI Coding Agent「Harness 工程」的技术书籍，分别深度剖析 Claude Code 的运行时架构，以及 Claude Code 与 Codex 在 Harness 设计哲学上的根本性差异。"
    }
  ],
  "tags": [
    "context-governance",
    "self-healing-memory",
    "context-window",
    "token-optimization",
    "claude-code",
    "codex"
  ],
  "createdAt": "2026-04-05T06:39:25.040Z",
  "updatedAt": "2026-04-05T06:39:25.040Z"
}
---

## 是什么

上下文治理是 AI Agent 在有限上下文窗口内维持长任务连贯性的工程技术集合。LLM 的上下文窗口是稀缺资源——每轮工具调用的输入输出都会消耗 token，长任务很快会耗尽窗口容量。

Claude Code 采用**按话题索引的自愈记忆（Self-Healing Memory）**策略：
- 对话历史按话题分段索引，而非线性存储
- 当上下文接近上限时自动压缩，保留关键决策节点
- 压缩后如果发现遗漏关键信息，可自动恢复（自愈）
- 通过 CLAUDE.md 等外部文件持久化项目级上下文

Codex 采用**全量对话历史重放（Full History Replay）**策略：
- 每次推理都重放完整对话历史
- 实现更简单，不会丢失信息
- 但 token 消耗更高，成本随任务长度线性增长

## 能做什么

- **延长 Agent 有效工作时长**：通过压缩和索引，让 Agent 在单次会话中处理更大规模的任务
- **降低 token 成本**：智能压缩可显著减少重复信息的 token 消耗
- **保持任务连贯性**：话题索引确保 Agent 在长对话中不会「忘记」早期的关键决策
- **项目级知识持久化**：通过 CLAUDE.md 等机制实现跨会话的上下文延续

## 现状与局限

- 自愈记忆的压缩策略可能丢失对后续推理至关重要的细节，「自愈」成功率缺乏公开数据
- 全量重放简单可靠但成本高，随着上下文窗口扩大（如百万 token）这一劣势可能减弱
- 两种策略各有适用场景，尚无统一的最优方案
- 上下文治理的效果难以量化评估——如何衡量「Agent 记住了多少该记住的、忘掉了多少该忘的」仍是开放问题
- 与 LLM 自索引等技术有交叉，但上下文治理更侧重运行时动态管理而非静态知识组织