---
{
  "id": "supervised-fine-tuning",
  "name": "Supervised Fine-Tuning (SFT)",
  "aliases": [
    "SFT",
    "监督微调",
    "指令微调"
  ],
  "domain": "LLM Training",
  "summary": "在预训练模型基础上，使用有标签数据（如指令-回复对）通过交叉熵损失进行微调，使模型学会遵循指令或提升特定任务性能。",
  "relations": [],
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

使用交叉熵损失在 (input, output) 对上训练，调整模型权重使其生成更符合目标分布的输出。在 LLM 对齐流程中通常是 RLHF 之前的第一步。

### 本文角色

SSD 的训练阶段直接复用标准 SFT pipeline，唯一区别是训练数据来源——不是人工标注，而是模型自身的采样输出。

## 能做什么

- LLM 指令遵循能力的基础训练手段
- 任务特定性能提升
- 在 SSD 中作为将采样分布"固化"到模型权重的机制

## 现状与局限

- 需要高质量标注数据（SSD 论文表明在自生成数据上也有效）
- 可能导致灾难性遗忘
- 单独使用时效果受限于数据质量