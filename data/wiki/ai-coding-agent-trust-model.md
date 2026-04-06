---
{
  "id": "ai-coding-agent-trust-model",
  "name": "AI Coding Agent 信任模型",
  "aliases": [
    "Agent Trust Model",
    "Agent 安全边界设计",
    "Trust-based vs Sandbox-based Agent Security"
  ],
  "domain": "Agent Architecture",
  "summary": "AI Coding Agent 划分责任边界和安全权限的两种对立设计范式：一是「信任用户环境+精细化权限管控」（Claude Code 路线），二是「隔离一切+沙箱即安全边界」（Codex 路线）。这一根本性架构选择决定了 Agent 的执行环境、交互模式和故障恢复策略。",
  "relations": [
    {
      "conceptId": "harness-engineering",
      "conceptName": "Harness Engineering",
      "type": "part-of",
      "description": "信任模型是 Harness 架构中最根本的设计决策，决定了其他所有支柱的实现方式"
    },
    {
      "conceptId": "llm-jailbreaking-techniques",
      "conceptName": "LLM 越狱技术",
      "type": "related",
      "description": "越狱攻击可能突破 Agent 的权限边界，信任模型的安全性与越狱防御能力直接相关"
    },
    {
      "conceptId": "production-system-prompt-architecture",
      "conceptName": "生产级系统提示词架构",
      "type": "related",
      "description": "系统提示词中的安全护栏是信任模型在 prompt 层的具体实现"
    },
    {
      "conceptId": "ai-agent-query-loop",
      "conceptName": "Agent Query Loop",
      "type": "related",
      "description": "信任模型决定了 Query Loop 的交互模式——同步确认 vs 异步执行"
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
    "trust-model",
    "security-architecture",
    "sandbox",
    "permission-system",
    "claude-code",
    "codex",
    "agent-security"
  ],
  "createdAt": "2026-04-05T06:39:25.040Z",
  "updatedAt": "2026-04-05T06:39:25.040Z"
}
---

## 是什么

AI Coding Agent 信任模型是指 Agent 系统在权限管理和安全边界上的根本性架构抉择，决定了 Agent「能做什么」和「怎么被约束」。harness-books 的核心洞察在于：Claude Code 和 Codex 的功能名词可能相同，但责任边界的划分方式完全不同。

**信任+精细权限路线（Claude Code）**：
- 在用户本地机器上执行，信任用户环境
- 通过分级权限系统（Hooks + 多级审批）精细管控每个操作
- 实时交互，关键操作逐步请求用户确认
- 包含情感检测机制，检测用户挫败后自动调整策略
- 故障恢复：运行时自恢复，错误视为常态

**隔离+沙箱路线（Codex）**：
- 在云端容器中执行，沙箱即安全边界
- 容器级隔离替代精细权限——Agent 在沙箱内拥有完全自由，但无法逃逸
- 异步提交任务，完成后返回结果
- 故障恢复：容器重置，失败后重跑
- 并行 Rollout，可同时处理多个任务

这两种路线的隐喻是「两个城市都修了桥，不代表按同一条河设计」。

## 能做什么

- **指导 Agent 产品的安全架构设计**：明确两种路线的适用场景和权衡
- **企业选型依据**：安全敏感型企业（代码不出本地）适合信任+权限路线；追求并行效率的团队适合沙箱隔离路线
- **解释用户体验差异**：Claude Code 的「每步可见可干预」vs Codex 的「提交后等结果」源于信任模型的根本差异
- **预测架构演进方向**：两种路线可能走向融合——本地执行 + 可选云端沙箱

## 现状与局限

- 信任+权限路线的确认疲劳（confirmation fatigue）问题：频繁请求确认降低效率
- 沙箱路线的调试困难：异步执行时开发者难以实时干预纠正方向
- 两种路线的安全性尚缺乏对抗性评估（如 Agent 在本地环境被恶意 prompt 注入后的破坏力 vs 沙箱逃逸风险）
- OpenAI 开源 codex-plugin-cc（从 Claude Code 调用 Codex）暗示模型层走向互通，信任模型可能成为更重要的差异化因素
- 混合模式（如本地 Agent + 云端验证沙箱）尚处探索期