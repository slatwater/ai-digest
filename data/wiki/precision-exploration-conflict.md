---
{
  "id": "precision-exploration-conflict",
  "name": "Precision-Exploration Conflict",
  "aliases": [
    "Lock-Fork Duality",
    "精确-探索冲突"
  ],
  "domain": "LLM Decoding Theory",
  "summary": "代码生成中 token 序列存在两类位置：需要精确的「锁定位置」和需要多样性的「分叉位置」。任何全局固定解码温度必须在两者之间妥协，这是温度调优效果有限的根本原因。",
  "relations": [
    {
      "conceptId": "simple-self-distillation",
      "conceptName": "Simple Self-Distillation (SSD)",
      "type": "related",
      "description": "精确-探索冲突是 SSD 有效性的理论解释"
    },
    {
      "conceptId": "medusa-decoding",
      "conceptName": "Medusa",
      "type": "related",
      "description": "Medusa 的 Typical Acceptance 机制（高熵放宽、低熵收紧）本质上是在解码验证层面对 Precision-Exploration Conflict 的工程化应对——按位置熵动态调整接受阈值，而非使用全局固定标准"
    },
    {
      "conceptId": "typical-acceptance",
      "conceptName": "Typical Acceptance",
      "type": "related",
      "description": "Typical Acceptance 的熵自适应阈值是精确-探索冲突在推理验证阶段的直接解法：低熵（lock position）时收紧接受条件保精确，高熵（fork position）时放宽接受条件容探索"
    }
  ],
  "sources": [
    {
      "entryId": "6fa9ae8e-3ac3-4b38-9848-260d7973c303",
      "entryTitle": "Simple Self-Distillation：Apple 发现让代码模型\"自己教自己\"就能大幅提升编程能力",
      "date": "2026-04-07T03:59:04.791Z",
      "contribution": "Apple 提出 Simple Self-Distillation (SSD)：让代码模型在自己的未经验证的采样输出上做标准 SFT，即可大幅提升代码生成能力，无需教师模型、验证器或强化学习。"
    }
  ],
  "tags": [],
  "createdAt": "2026-04-07T03:59:04.797Z",
  "updatedAt": "2026-04-09T05:11:14.068Z"
}
---

## 是什么

论文将 token 位置分为两类：

- **Lock positions**：语法和上下文高度约束，几乎只有一个正确续写（如 `if n ==` 后），但模型分布中仍存在干扰尾巴
- **Fork positions**：多个续写都合理（如函数开头的算法选择），分布应天然分散

低温度可以压制 lock 位置的干扰但饿死 fork 位置的多样性；高温度相反。全局温度策略「can reweight a fixed distribution」但无法「steepen locks and clean up fork heads in a context-dependent way」。SSD 在权重层面实现了上下文相关的重塑，突破了这一限制。

## 能做什么

- 解释了为什么全局温度调优在代码生成上效果有限（2.2pp 范围 vs SSD 12.9pp）
- 提供了理解 LLM 解码瓶颈的新理论框架
- 指导 SSD 超参数选择（高 T_train 暴露分布结构，截断控制支撑集）

## 现状与局限

- 目前主要在代码生成场景验证
- Lock/Fork 位置的定量界定尚缺乏严格标准
- 是否适用于自然语言生成等非结构化任务尚不清楚