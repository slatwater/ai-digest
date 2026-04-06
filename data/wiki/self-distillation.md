---
{
  "id": "self-distillation",
  "name": "Self-Distillation",
  "aliases": [
    "自蒸馏",
    "Self-Training"
  ],
  "domain": "Machine Learning / Knowledge Distillation",
  "summary": "一种知识蒸馏的变体，模型同时担任教师和学生角色，用自身的输出（或深层特征）来训练自身，无需外部教师模型。",
  "relations": [
    {
      "conceptId": "knowledge-distillation",
      "conceptName": "Knowledge Distillation",
      "type": "builds-on",
      "description": "自蒸馏是知识蒸馏的特例，教师=学生"
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

传统知识蒸馏（Knowledge Distillation）需要一个更大的教师模型来指导学生模型。自蒸馏去掉了外部教师，让模型用自身的预测作为软标签来训练。

常见形式包括：
- **层间蒸馏**：用深层分类器的输出指导浅层分类器
- **迭代自训练**：用当前模型生成伪标签，过滤后重新训练
- **分布匹配**：让模型在新数据上的预测分布匹配其在高置信度数据上的表现

### 本文贡献

SSD 论文展示了自蒸馏的一种极端简化形式：甚至不需要过滤生成质量，直接在原始采样输出上训练即可获得显著提升。

## 能做什么

- 无需大型教师模型即可提升模型性能
- 降低后训练的计算和数据标注成本
- 可用于无法获取外部标注的场景
- 理论上可无限迭代（STaR 范式）

## 现状与局限

- 传统观点认为需要质量过滤才能有效（SSD 论文挑战了这一观点）
- 多轮迭代可能导致模型塌缩（distribution collapse）
- 上界受限于模型自身能力