---
{
  "id": "ai-agent-query-loop",
  "name": "Agent Query Loop",
  "aliases": [
    "Query Loop",
    "Agent 主循环",
    "对话-推理-工具循环"
  ],
  "domain": "Agent Architecture",
  "summary": "AI Agent 的核心执行循环架构模式，驱动「对话→推理→工具调用→结果回传」的迭代流程。不同 Agent 产品对 Query Loop 的设计（同步实时 vs 异步提交、单线程 vs 并行 Rollout）决定了交互体验和工程能力的根本差异。",
  "relations": [
    {
      "conceptId": "harness-engineering",
      "conceptName": "Harness Engineering",
      "type": "part-of",
      "description": "Query Loop 是 Harness Engineering 七大支柱中的核心执行循环"
    },
    {
      "conceptId": "ai-agent-context-governance",
      "conceptName": "Agent 上下文治理",
      "type": "related",
      "description": "Query Loop 每一轮迭代都消耗上下文窗口，上下文治理决定了循环能持续多少轮"
    },
    {
      "conceptId": "production-system-prompt-architecture",
      "conceptName": "生产级系统提示词架构",
      "type": "related",
      "description": "系统提示词为 Query Loop 提供初始指令和行为约束"
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
    "query-loop",
    "agent-runtime",
    "control-plane",
    "tool-calling",
    "claude-code",
    "codex"
  ],
  "createdAt": "2026-04-05T06:39:25.040Z",
  "updatedAt": "2026-04-05T06:39:25.040Z"
}
---

## 是什么

Query Loop 是 AI Coding Agent 的核心执行引擎，定义了 Agent 如何在一次任务中迭代地感知、推理、行动和反馈。其基本流程为：
1. 接收用户输入或上一轮工具结果
2. LLM 推理决策下一步动作
3. 调用工具（编辑文件、执行命令、搜索代码等）
4. 将工具结果回传给 LLM
5. 循环直至任务完成或终止条件触发

在 Claude Code 中，Query Loop 是实时同步执行的——每一步用户可见，关键操作需请求确认，形成紧密的人机协作循环。在 Codex 中，对应的概念是 Rollout——异步提交任务后在云端容器中独立执行，完成后将结果（代码变更）提交回来。

Control Plane（控制面）作为 Query Loop 的上层决策中枢，负责判断每一轮迭代中应该调用哪个工具、是否需要用户确认、何时终止循环。

## 能做什么

- **实时交互模式（Claude Code）**：每步可见可干预，适合需要精细控制的本地开发场景，开发者可随时修正方向
- **异步批处理模式（Codex）**：提交后无需等待，适合大规模并行任务（如同时处理多个 issue），throughput 更高
- **多代理协作**：Query Loop 内部可嵌套子代理循环（如 Explore 子代理用于代码搜索，Bash 子代理用于命令执行），形成 Plan→Work→Review 的验证闭环
- **故障自恢复**：Query Loop 将错误视为常态输入，工具执行失败后自动进入恢复路径而非直接终止

## 现状与局限

- Query Loop 的设计深刻影响用户体验和适用场景，但目前缺乏跨系统的标准化定义
- 实时模式的延迟感知和异步模式的结果延迟各有优劣，尚无统一的最优实践
- 循环终止条件的设计（何时判断任务完成）仍是开放问题，过早终止导致任务不完整，过晚终止浪费 token
- 嵌套子代理循环的深度和复杂度管理缺乏成熟方法论