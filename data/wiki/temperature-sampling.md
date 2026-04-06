---
{
  "id": "temperature-sampling",
  "name": "Temperature Sampling",
  "aliases": [
    "温度采样",
    "Temperature Scaling"
  ],
  "domain": "LLM Inference / Decoding",
  "summary": "通过温度参数 T 缩放 logits 来控制采样分布的尖锐度：T<1 使分布更集中（接近 greedy），T>1 使分布更平坦（增加多样性）。",
  "relations": [
    {
      "conceptId": "greedy-decoding",
      "conceptName": "Greedy Decoding",
      "type": "contrasts",
      "description": "T→0 时退化为 greedy decoding"
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

Softmax 前的 logits 除以温度 T：p(x_i) = exp(z_i/T) / Σ exp(z_j/T)

### 本文角色

SSD 利用 T_train（采样时）和 T_eval（推理时）两个温度参数，发现有效温度 T_eff = T_train × T_eval 是关键控制变量。高 T_train（如 2.0）产生多样但噪声大的训练数据，配合适度 T_eval（如 1.1）达到最佳效果。

## 能做什么

- 控制生成多样性与质量的权衡
- 在 SSD 中，高温采样是产生分布重塑信号的关键

## 现状与局限

- 全局调温无法区分 Locks 和 Forks 位置（这正是 SSD 要解决的问题）