---
{
  "id": "hermes-agent-loop",
  "name": "Hermes Agent Loop",
  "aliases": [
    "AIAgent Loop",
    "Hermes Agentic Loop"
  ],
  "domain": "AI Agent Runtime",
  "summary": "Hermes 的核心 Agent 循环实现，特点是平台无关的单一 AIAgent 类统一服务 CLI/网关/ACP/批处理，集成双层记忆注入、可插拔提供者、47 工具中央注册表，以及与 RL 训练管道的直接连接。",
  "relations": [
    {
      "conceptId": "agent-query-loop",
      "conceptName": "Agent Query Loop",
      "type": "builds-on",
      "description": "Hermes Agent Loop 是 Agent Query Loop 模式的一个具体实现，增加了记忆预取、RL 训练集成和平台无关抽象"
    },
    {
      "conceptId": "context-governance",
      "conceptName": "Context Governance",
      "type": "composed-of",
      "description": "Hermes 的上下文压缩和记忆注入机制是上下文治理的具体实践"
    },
    {
      "conceptId": "agent-skills-standard",
      "conceptName": "Agent Skills",
      "type": "builds-on",
      "description": "Hermes 将 Agent Skills 标准扩展为完整的三阶段生命周期管理（自主创建→运行时改进→进化优化），是该标准最深度的运行时集成"
    },
    {
      "conceptId": "gepa-prompt-evolution",
      "conceptName": "GEPA (Genetic-Pareto Prompt Evolution)",
      "type": "enables",
      "description": "Hermes 的执行轨迹（错误日志、profiling 数据、推理日志）正是 GEPA 诊断失败根因所需的输入数据源"
    },
    {
      "conceptId": "honcho-dialectic-memory",
      "conceptName": "Honcho Dialectic Memory",
      "type": "enables",
      "description": "Honcho 的辩证推理用户模型可作为 Hermes 记忆预取机制的深层记忆源，提供超越事实存储的用户理解"
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
  "updatedAt": "2026-04-07T09:21:21.908Z"
}
---

## 是什么

核心是 `AIAgent` 类（`run_agent.py`）的同步对话循环：

```
用户输入 → process_input() → run_conversation() → build_system_prompt() → resolve_runtime_provider() → API 调用 → handle_function_call() → 结果注入 → 下一轮
```

**本文的新贡献**相较于通用 Agent Loop 设计：
- **平台无关核心**：同一个 `AIAgent` 类服务所有入口（CLI、消息网关、ACP 协议、批量处理、API 服务器），平台特定逻辑只在入口层
- **双模式 RL 集成**：Phase 1 使用原生工具调用（评估/SFT），Phase 2 获取原始 token+logprobs 并客户端解析（GRPO/PPO 训练），128 线程池执行工具调用
- **记忆预取与注入**：每轮推理前自动从多个记忆源预取相关内容注入 system prompt
- **上下文压缩**：超过阈值时自动摘要中间轮次

## 能做什么

- 一套代码服务多种部署模式（CLI、消息平台、API、RL 训练）
- Agent 的使用数据直接转化为 RL 训练轨迹
- 跨平台的会话连续性（记忆层统一）

## 现状与局限

- 同步循环设计可能在高并发场景下成为瓶颈
- 47 个工具的中央注册表在模型上下文窗口中的 schema 开销较大
- 跨平台统一意味着无法针对特定平台深度优化交互体验