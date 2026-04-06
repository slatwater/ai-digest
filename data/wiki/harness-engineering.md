---
{
  "id": "harness-engineering",
  "name": "Harness Engineering",
  "aliases": [
    "Harness 工程",
    "AI Agent Harness Engineering",
    "线束工程"
  ],
  "domain": "Agent Architecture",
  "summary": "围绕不稳定 LLM 模型建立工程秩序的独立学科，涵盖控制面、主循环、工具权限、上下文治理、恢复路径、多代理验证与团队制度七大支柱。核心论点是竞争壁垒在 Harness 而非模型本身——同一模型在不同 Harness 下表现差异可达 78% vs 42%。",
  "relations": [
    {
      "conceptId": "production-system-prompt-architecture",
      "conceptName": "生产级系统提示词架构",
      "type": "builds-on",
      "description": "Harness Engineering 将系统提示词架构视为其七大支柱之一（团队制度层），但范围远超 Prompt Engineering，涵盖整个运行时基础设施"
    },
    {
      "conceptId": "ai-agent-query-loop",
      "conceptName": "Agent Query Loop",
      "type": "enables",
      "description": "Query Loop 是 Harness Engineering 七大支柱中的核心执行循环"
    },
    {
      "conceptId": "ai-agent-context-governance",
      "conceptName": "Agent 上下文治理",
      "type": "enables",
      "description": "上下文治理是 Harness Engineering 的关键支柱之一"
    },
    {
      "conceptId": "ai-coding-agent-trust-model",
      "conceptName": "AI Coding Agent 信任模型",
      "type": "enables",
      "description": "信任模型的选择（本地信任 vs 沙箱隔离）是 Harness 架构最根本的设计分歧"
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
    "harness-engineering",
    "agent-architecture",
    "ai-coding",
    "engineering-discipline",
    "claude-code",
    "codex"
  ],
  "createdAt": "2026-04-05T06:39:25.040Z",
  "updatedAt": "2026-04-05T06:39:25.040Z"
}
---

## 是什么

Harness Engineering 是 2026 年正式被定义的独立工程学科，由 OpenAI 于 2026 年 2 月首次提出概念，随后由 wquguru 的 harness-books 双书系统化为完整知识体系。其核心思想是：LLM 模型本身是不稳定的概率引擎，真正决定 AI Coding Agent 工程质量的是围绕模型构建的运行时基础设施（即 Harness）。

该学科明确区别于 Prompt Engineering——后者关注输入文本的优化，而 Harness Engineering 关注的是整个运行时骨架的架构设计，包括七大支柱：
1. **Control Plane（控制面）**：决策中枢，决定何时调用工具、请求确认或终止
2. **Query Loop（主循环）**：对话→推理→工具→回传的核心执行循环
3. **工具权限系统**：分级管控 + hooks 自动审批
4. **上下文治理**：压缩、自愈记忆、窗口管理
5. **恢复路径**：错误视为常态的系统性自恢复机制
6. **多代理验证**：Plan→Work→Review 循环，含 Explore/Bash 等特化子代理
7. **团队制度**：CLAUDE.md、settings.json、hooks 等协作规范

## 能做什么

- **重塑 AI Coding 竞争认知**：将竞争焦点从「哪个模型更聪明」转向「哪套 Harness 让模型发挥更稳定」
- **提供企业选型决策框架**：根据团队场景做架构匹配（本地安全敏感 → Claude Code 的信任+精细权限路线，云端大规模并行 → Codex 的隔离+沙箱路线）
- **指导 Agent 产品的架构设计**：七大支柱为构建新 AI Agent 产品提供了系统化的工程检查清单
- **解释性能差异的根源**：Nate's Newsletter 数据显示同一模型在不同 Harness 下表现差异可达 78% vs 42%，证实 Harness 的工程价值

## 现状与局限

- harness-books 双书是该学科的首批系统化教材（2026-04-01 发布，4 天内 1.1k GitHub stars，24 万+浏览量），但发布时间极短，尚未经广泛 peer review
- Book1 对 Claude Code 的分析基于源码泄露后的逆向工程，具有时效性风险
- Book2 对 Codex 的分析受限于信息不对称（内部实现细节获取渠道有限）
- 定性架构哲学分析充分，但缺少统一基准测试的定量性能数据
- 该学科仍处于定义期，尚未形成标准化的评估方法论和工程规范