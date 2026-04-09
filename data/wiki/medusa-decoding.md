---
{
  "id": "medusa-decoding",
  "name": "Medusa",
  "aliases": [
    "Medusa Decoding",
    "Medusa Heads",
    "Multi-Head Speculative Decoding",
    "Multiple Decoding Heads"
  ],
  "domain": "LLM Inference Acceleration",
  "summary": "一种 LLM 推理加速框架，在模型最后一层隐藏状态上附加多个轻量 FFN 解码头，各头并行预测不同位置的未来 token，再通过树结构注意力一次性验证所有候选，将多步自回归压缩为单步验证。",
  "relations": [
    {
      "conceptId": "tree-attention-verification",
      "conceptName": "Tree Attention Verification",
      "type": "composed-of",
      "description": "Medusa 使用树状注意力机制在单次前向传播中并行验证多条候选路径"
    },
    {
      "conceptId": "precision-exploration-conflict",
      "conceptName": "Precision-Exploration Conflict",
      "type": "related",
      "description": "Medusa 的 Typical Acceptance 机制（高熵放宽、低熵收紧）本质上是在解码验证层面对 Precision-Exploration Conflict 的工程化应对——按位置熵动态调整接受阈值，而非使用全局固定标准"
    },
    {
      "conceptId": "simple-self-distillation",
      "conceptName": "Simple Self-Distillation (SSD)",
      "type": "related",
      "description": "SSD 重塑 backbone 隐藏层的表示分布，可能使 Medusa 的单层 FFN 解码头更容易预测未来 token，缓解其'单层前馈网络预测能力有限'的局限"
    },
    {
      "conceptId": "typical-acceptance",
      "conceptName": "Typical Acceptance",
      "type": "composed-of",
      "description": "Medusa 使用 Typical Acceptance 替代拒绝采样作为候选验证策略"
    }
  ],
  "sources": [
    {
      "entryId": "eba1c770-5651-4547-a7e5-0e0b92462484",
      "entryTitle": "Medusa: 用多解码头并行预测实现 LLM 推理加速的完整技术分析",
      "date": "2026-04-08T14:49:45.812Z",
      "contribution": "本次深入阅读补充了自蒸馏的 KL 散度损失设计细节、LoRA 教师-学生共享内存优化机制、任务级加速差异数据（抽取 3.62× > 代码 3.29× > 写作 2.8×），以及两阶段热身防止 backbone 退化的具体训练策略。"
    }
  ],
  "tags": [],
  "createdAt": "2026-04-08T14:41:42.189Z",
  "updatedAt": "2026-04-09T05:11:16.018Z"
}
---

## 是什么

### 核心架构
在 LLM 最后隐藏层上添加 K 个额外解码头，每个头为单层前馈网络（SiLU 激活 + 残差连接），W₂ 从原始 LM head 初始化，W₁ 初始化为零。

### 两种训练模式
- **Medusa-1**：冻结 backbone，仅训练头，损失权重按 0.8^k 衰减
- **Medusa-2**：联合训练 backbone 和头，使用差异学习率 + 两阶段热身

### Typical Acceptance
替代拒绝采样的温度感知接受方案：接受阈值随预测分布熵动态调整，高熵时放宽、低熵时收紧。

### 树结构优化
基于验证集统计的贪心节点选择，稀疏 64 节点树优于密集 256 节点树。

## 能做什么

- 无需独立草稿模型即可实现 2-3.6× 推理加速
- 单 GPU 即可训练（5 小时/A100/7B 模型）
- 支持量化推理（4-bit/8-bit）
- 已集成 TensorRT-LLM 和 HuggingFace TGI

## 现状与局限

- 每个头独立预测，未建模头间依赖（后续 Hydra 解决）
- 单层前馈网络预测能力有限，EAGLE 通过利用更深层特征获得更好效果
- 需要对每个目标模型单独训练头，无法跨模型迁移
- Typical Acceptance 不保证输出分布严格一致