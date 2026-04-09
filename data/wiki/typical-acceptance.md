---
{
  "id": "typical-acceptance",
  "name": "Typical Acceptance",
  "aliases": [
    "Typical Acceptance Scheme",
    "典型接受方案",
    "Entropy-based Acceptance"
  ],
  "domain": "LLM Decoding / Sampling Strategy",
  "summary": "一种基于信息论的候选 token 验证策略，用目标模型分布的熵动态调整接受阈值，替代推测解码中的拒绝采样。",
  "relations": [
    {
      "conceptId": "medusa-decoding",
      "conceptName": "Medusa",
      "type": "part-of",
      "description": "Typical Acceptance 是 Medusa 框架中的验证策略组件"
    },
    {
      "conceptId": "precision-exploration-conflict",
      "conceptName": "Precision-Exploration Conflict",
      "type": "related",
      "description": "Typical Acceptance 的熵自适应阈值是精确-探索冲突在推理验证阶段的直接解法：低熵（lock position）时收紧接受条件保精确，高熵（fork position）时放宽接受条件容探索"
    },
    {
      "conceptId": "simple-self-distillation",
      "conceptName": "Simple Self-Distillation (SSD)",
      "type": "related",
      "description": "两者都实现上下文相关的 token 分布重塑以应对精确-探索冲突，但作用层面互补：SSD 在后训练权重层面重塑（产生 spike/plateau 效应），Typical Acceptance 在推理验证阶段通过熵阈值重塑接受标准"
    },
    {
      "conceptId": "tree-attention-verification",
      "conceptName": "Tree Attention Verification",
      "type": "related",
      "description": "Typical Acceptance 是 Tree Attention Verification 框架中可插拔的接受策略，用熵自适应阈值替代拒绝采样，提升候选接受率从而放大树验证的加速效果"
    }
  ],
  "sources": [
    {
      "entryId": "eba1c770-5651-4547-a7e5-0e0b92462484",
      "entryTitle": "Medusa: 用多解码头并行预测实现 LLM 推理加速的完整技术分析",
      "date": "2026-04-08T14:49:45.812Z",
      "contribution": "补充了阈值参数的实验结论：ε=0.01 获得最大加速（~3.0 tokens/step），ε=0.25 为质量/速度平衡点；在高温度下与拒绝采样质量可比但接受率更高。"
    }
  ],
  "tags": [],
  "createdAt": "2026-04-08T14:45:30.000Z",
  "updatedAt": "2026-04-09T05:11:16.025Z"
}
---

## 是什么

接受条件：$p_{\text{original}}(x) > \min(\epsilon, \delta \cdot \exp(-H(p)))$，其中 $H$ 是原模型概率分布的熵。当模型对下一个 token 高度确定（低熵）时，只接受高概率候选；当模型本身犹豫（高熵）时，放宽阈值接受更多候选。第一个 token 无条件接受（贪心解码）。$\epsilon$ 为全局阈值上界，可调节质量-速度权衡。

## 能做什么

- 比拒绝采样更高的候选接受率，提升加速效果
- 自适应验证强度：确定性位置严格、不确定性位置宽松
- 可用于任何非精确推测解码场景的验证

## 现状与局限

- 不保证输出分布与原模型完全一致（非无损）
- 阈值 $\epsilon$ 需要根据应用场景手动调节
- 在高温度采样下可能接受过多低质量候选