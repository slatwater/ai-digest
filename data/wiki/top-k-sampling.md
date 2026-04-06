---
{
  "id": "top-k-sampling",
  "name": "Top-k Sampling",
  "aliases": [
    "Top-k 截断采样"
  ],
  "domain": "LLM Inference / Decoding",
  "summary": "仅保留概率最高的 k 个 token，将其余 token 的概率置零并重新归一化，从而限制采样的候选集。",
  "relations": [
    {
      "conceptId": "temperature-sampling",
      "conceptName": "Temperature Sampling",
      "type": "related",
      "description": "通常与 temperature 配合使用，SSD 中两者共同定义采样策略"
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

在采样前截断 token 分布，只保留 top-k 个候选。在 SSD 中使用 k=10，理论分析表明这实现了 support compression——移除长尾干扰项。

## 能做什么

- 防止采样到低概率噪声 token
- 在 SSD 中，top-k 截断是实现 Locks 位置干扰项压制的关键机制

## 现状与局限

- 固定 k 值可能不适应不同上下文（有些位置只有 2-3 个合理选项，有些有更多）