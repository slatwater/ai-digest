---
{
  "id": "greedy-decoding",
  "name": "Greedy Decoding",
  "aliases": [
    "贪婪解码",
    "Argmax Decoding"
  ],
  "domain": "LLM Inference / Decoding",
  "summary": "每步选择概率最高的 token，确定性但可能陷入次优路径。SSD 论文指出它锁住了模型的潜在能力。",
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

### 本文新贡献

SSD 论文揭示了 greedy decoding 的根本缺陷：它在 Forks 位置（需要探索多种实现路径）过度约束，导致模型无法表达其全部能力。单纯调节 temperature 只能在全局层面权衡，无法做到位置级别的精确控制。论文实验表明，对基座模型的温度调优仅带来 2.2pp 提升，而 SSD 带来 11.8pp 提升。

## 能做什么

- 确定性输出，适合需要可复现性的场景
- 低延迟（无需多次采样）

## 现状与局限

- 本文证明：greedy decoding 系统性地抑制了 coding 模型的潜在能力
- 无法区分 Locks 和 Forks，在需要探索的位置表现差