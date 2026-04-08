---
{
  "id": "gepa-prompt-evolution",
  "name": "GEPA (Genetic-Pareto Prompt Evolution)",
  "aliases": [
    "Genetic-Pareto Prompt Evolution",
    "GEPA",
    "hermes-agent-self-evolution"
  ],
  "domain": "Prompt Optimization / Evolutionary Computation",
  "summary": "一种基于遗传算法和 Pareto 优化的提示词/技能进化方法，通过 API 调用（无需 GPU）读取执行轨迹和错误日志，诊断失败原因，生成候选变体并自动选择最优版本。",
  "relations": [
    {
      "conceptId": "agent-skills-standard",
      "conceptName": "Agent Skills",
      "type": "related",
      "description": "GEPA 的主要优化对象是 Agent Skills 格式的技能文件"
    },
    {
      "conceptId": "simple-self-distillation",
      "conceptName": "Simple Self-Distillation",
      "type": "related",
      "description": "SSD 通过采样+SFT 改进模型权重，GEPA 通过进化搜索改进提示词/技能文本，两者在不同层面提升 Agent 能力"
    },
    {
      "conceptId": "hermes-agent-loop",
      "conceptName": "Hermes Agent Loop",
      "type": "related",
      "description": "Hermes 的执行轨迹（错误日志、profiling 数据、推理日志）正是 GEPA 诊断失败根因所需的输入数据源"
    },
    {
      "conceptId": "harness-engineering",
      "conceptName": "Harness Engineering",
      "type": "related",
      "description": "GEPA 为 Harness Engineering 的文本制品（提示词、工具描述、技能文件）提供自动化进化优化能力，使 harness 调优从手工走向系统化"
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

GEPA 的工作流程是一个闭环进化循环：
1. **读取**当前技能/提示词及其执行轨迹（包括错误消息、profiling 数据、推理日志）
2. **诊断**具体失败原因——不只是「失败了」，而是「为什么失败」
3. **生成**针对失败点的候选变体
4. **评估**每个变体的表现
5. **选择**最优者并自动提交 PR

与其他优化方法的关键区别：GEPA 读取完整的执行轨迹来理解失败的根因，而非仅依赖 pass/fail 信号。基于 DSPy 框架实现，使用 Pareto 前沿进行多目标优化。

成本极低：全程通过 API 调用完成，每次优化 ~$2-10，无需 GPU。

## 能做什么

- 自动优化 Agent 技能文件的质量
- 优化工具描述以提升工具选择准确性
- 优化系统提示词和 Agent 配置
- 低成本的 Agent 行为改进（无需重新训练模型）

## 现状与局限

- 优化效果受限于候选变体的搜索空间（文本层面的变异）
- 评估需要可度量的任务指标，不适用于开放式任务
- Pareto 前沿的多目标权衡需要人工定义优化维度
- 作为独立项目运行，与主 Agent 的集成程度有待提高