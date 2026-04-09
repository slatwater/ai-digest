---
{
  "id": "tree-attention-verification",
  "name": "Tree Attention Verification",
  "aliases": [
    "Tree-based Attention",
    "树状注意力验证",
    "Token Tree Verification"
  ],
  "domain": "LLM Inference Acceleration",
  "summary": "一种在 LLM 推理中并行验证多条候选路径的注意力机制，通过树状 token 结构和自定义注意力掩码在单次前向传播中验证指数级候选。",
  "relations": [
    {
      "conceptId": "medusa-decoding",
      "conceptName": "Medusa",
      "type": "part-of",
      "description": "树状注意力验证是 Medusa 的核心验证组件"
    },
    {
      "conceptId": "typical-acceptance",
      "conceptName": "Typical Acceptance",
      "type": "related",
      "description": "Typical Acceptance 是 Tree Attention Verification 框架中可插拔的接受策略，用熵自适应阈值替代拒绝采样，提升候选接受率从而放大树验证的加速效果"
    }
  ],
  "sources": [
    {
      "entryId": "eba1c770-5651-4547-a7e5-0e0b92462484",
      "entryTitle": "Medusa: 用多解码头并行预测实现 LLM 推理加速的完整技术分析",
      "date": "2026-04-08T14:49:45.812Z",
      "contribution": "补充了贪心稀疏树构造算法的定量结论：基于每头 top-i 准确率 $a_k^{(i)}$ 的贪心节点选择，64 节点稀疏树在期望接受长度上优于 256 节点密集树且计算开销低 4 倍。"
    }
  ],
  "tags": [],
  "createdAt": "2026-04-08T14:41:42.189Z",
  "updatedAt": "2026-04-09T05:11:16.022Z"
}
---

## 是什么

### 树构造
将多个候选 token 组织为树结构，每层对应一个预测位置，每个节点代表一个候选 token。

### 注意力掩码
自定义掩码确保每个 token 只能看到自己所在路径上的祖先节点，而非树中其他分支的 token。这模拟了每条路径独立的自回归解码过程。

### 位置编码
按树的层级（而非线性序列位置）设置位置编码，确保同一层的不同分支共享相同的位置索引。

### 无需扩大 batch
所有候选路径在同一序列维度中处理，无需将不同路径拆分为独立 batch，节省内存。

## 能做什么

- 在单次前向传播中验证指数级数量的候选路径
- 与各种草稿策略兼容（独立草稿模型、解码头、自回归 n-gram 等）

## 现状与局限

- 树越大计算开销越高，存在边际递减效应
- 树结构的最优选择依赖于任务和模型，需要 profiling