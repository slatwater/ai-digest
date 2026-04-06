---
{
  "id": "simple-self-distillation",
  "name": "Simple Self-Distillation (SSD)",
  "aliases": [
    "SSD",
    "简单自蒸馏"
  ],
  "domain": "LLM Post-Training / Code Generation",
  "summary": "一种极简的后训练方法：用当前模型在特定 temperature 和 truncation 配置下自行采样生成代码，不做任何正确性过滤，直接用这些原始输出做标准 SFT。核心洞察是通过重塑 token 分布来解决 greedy decoding 中的 precision-exploration 冲突。",
  "relations": [
    {
      "conceptId": "supervised-fine-tuning",
      "conceptName": "Supervised Fine-Tuning (SFT)",
      "type": "composed-of",
      "description": "SSD 的训练阶段直接使用标准 SFT（交叉熵损失），是其核心组成部分"
    },
    {
      "conceptId": "self-distillation",
      "conceptName": "Self-Distillation",
      "type": "builds-on",
      "description": "SSD 是自蒸馏的极简变体，去掉了传统自蒸馏中的质量过滤步骤"
    },
    {
      "conceptId": "temperature-sampling",
      "conceptName": "Temperature Sampling",
      "type": "composed-of",
      "description": "SSD 依赖 temperature 控制采样多样性，T_train 和 T_eval 的乘积决定有效温度"
    },
    {
      "conceptId": "top-k-sampling",
      "conceptName": "Top-k Sampling",
      "type": "composed-of",
      "description": "truncation 配置（top-k=10）是 SSD 实现 support compression 的关键机制"
    },
    {
      "conceptId": "rejection-sampling-fine-tuning",
      "conceptName": "Rejection Sampling Fine-Tuning (RFT)",
      "type": "contrasts",
      "description": "RFT 需要正确性过滤（外部验证器），SSD 完全跳过过滤步骤，效果反而更好"
    },
    {
      "conceptId": "greedy-decoding",
      "conceptName": "Greedy Decoding",
      "type": "contrasts",
      "description": "SSD 的核心动机是解决 greedy decoding 的 precision-exploration 冲突"
    }
  ],
  "sources": [
    {
      "entryId": "02c4ef28-b1e5-49e3-a011-2820462fcf9b",
      "entryTitle": "Simple Self-Distillation (SSD)：用模型自身输出释放代码生成潜力",
      "date": "2026-04-06T16:36:04.102Z",
      "contribution": "Apple Research 提出 Simple Self-Distillation（SSD）：仅用模型自身采样输出做 SFT，无需验证器、教师模型或 RL，即可大幅提升代码生成能力，Qwen3-30B pass@1 从 42.4% 提升至 55.3%。"
    }
  ],
  "tags": [],
  "createdAt": "2026-04-06T16:36:04.104Z",
  "updatedAt": "2026-04-06T16:36:04.104Z"
}
---

## 是什么

### 核心原理

SSD 分三步：
1. **数据合成**：用冻结的基座模型，以训练时 temperature（T_train）和 truncation 配置（如 top-k）采样 N 个解法/prompt，不做任何验证或过滤
2. **训练**：用标准 SFT（交叉熵损失）在这些原始输出上微调模型
3. **推理**：以评估时 decoding 配置（T_eval, ρ_eval）部署

### 关键发现：Precision-Exploration 冲突

论文识别出代码生成中两类上下文位置：
- **Locks（锁定位置）**：分布尖锐、有明显主导 token，但存在长尾干扰项（如关键字、语法结构）
- **Forks（分叉位置）**：概率分散在多个合理 token 上，对应不同有效实现路径

Greedy decoding 在 Locks 处表现好但在 Forks 处过度约束；提高 temperature 可改善 Forks 但在 Locks 处引入噪声。SSD 通过 **上下文依赖地** 重塑 token 分布解决此冲突。

### 理论分解

训练信号可分解为三个分量：
1. **Support compression**：通过 truncation 移除尾部概率质量
2. **Within-support reshaping**：在保留的支持集内平滑分布（当 T>1 时，最小化损失等价于最大化 Rényi 熵 H_{1/T}）
3. **KL anchor**：保持与原始偏好的对齐

### 关键超参数

- 有效温度 T_eff = T_train × T_eval 控制总体性能
- 最佳配置：T_train = 2.0, T_eval = 1.1, top-k = 10
- 训练设置：LR 5×10⁻⁶, batch size 32, 2500 iterations
- 每个 prompt 仅需采样 1 次即可有效

## 能做什么

- 无需外部信号（无教师模型、无验证器、无 RL、无代码执行环境）即可提升代码生成能力
- Qwen3-30B-Instruct 在 LiveCodeBench v6 上 pass@1 从 42.4% → 55.3%（+30.4%）
- 困难问题提升最大：pass@5 从 31.1% → 54.1%
- 跨模型族泛化：Qwen 和 Llama 系列的 4B/8B/30B 规模均有效
- 同时适用于 instruct 和 thinking 变体
- 即使 62% 的训练数据不含可提取代码，仍能提升性能（说明机制不依赖数据正确性）
- 极低成本的后训练方案，适合资源受限场景

## 现状与局限

- 目前仅在代码生成任务上验证，对通用推理、数学等任务的泛化性未知
- 依赖于模型已有"潜在能力"——如果基座模型本身能力不足，SSD 可能无法奏效
- 多轮迭代 SSD 的效果尚未充分探索（是否存在饱和或退化）
- 与 RFT/RL 方法的组合使用尚未研究
- 理论分析基于简化假设，实际分布动态更复杂