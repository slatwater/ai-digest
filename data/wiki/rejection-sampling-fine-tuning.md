---
{
  "id": "rejection-sampling-fine-tuning",
  "name": "Rejection Sampling Fine-Tuning (RFT)",
  "aliases": [
    "RFT",
    "拒绝采样微调",
    "RSFT",
    "STaR"
  ],
  "domain": "LLM Post-Training",
  "summary": "用模型自身生成多个候选输出，通过外部验证器过滤出正确的，再用正确输出做 SFT。SSD 论文表明跳过过滤步骤反而可能更好。",
  "relations": [
    {
      "conceptId": "supervised-fine-tuning",
      "conceptName": "Supervised Fine-Tuning (SFT)",
      "type": "composed-of",
      "description": "RFT 的训练阶段使用 SFT"
    },
    {
      "conceptId": "simple-self-distillation",
      "conceptName": "Simple Self-Distillation (SSD)",
      "type": "contrasts",
      "description": "SSD 去掉了 RFT 中的过滤步骤"
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

1. 模型采样生成多个候选答案
2. 用外部验证器（如代码执行、数学证明检查）过滤出正确答案
3. 仅在正确答案上做 SFT

### 与 SSD 的关键对比

SSD 完全跳过了步骤 2（过滤），这在直觉上违反常理——在噪声数据上训练怎么会更好？SSD 论文的理论分析给出了解释：关键信号不在于数据的正确性，而在于 temperature+truncation 采样导致的分布重塑效应。

## 能做什么

- 利用模型自身能力进行自我提升
- 在有可靠验证器的领域（代码、数学）效果显著

## 现状与局限

- 需要外部验证器（代码执行环境、单元测试等）
- 验证器本身可能有偏差或覆盖不全
- SSD 论文表明在某些情况下过滤反而不必要