---
{
  "id": "livecodebench",
  "name": "LiveCodeBench",
  "aliases": [
    "LCB"
  ],
  "domain": "LLM Evaluation / Code Benchmarks",
  "summary": "持续收集 LeetCode、AtCoder、CodeForces 新题目的代码生成评测基准，通过时间分段避免数据污染。SSD 论文使用 v6 版本（截至 2025 年 4 月，1055 题）。",
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

### 核心设计

- 持续从在线编程竞赛收集新题，带时间戳
- 支持按时间段评估，避免训练数据污染
- 覆盖代码生成、自修复、代码执行预测等多维能力
- v6 版本包含 1055 道题，时间跨度 2023.05 - 2025.04

## 能做什么

- 抗污染的 LLM 代码能力评估
- SSD 论文的主要评测基准

## 现状与局限

- 仅覆盖竞赛编程风格的题目，不代表真实软件工程场景