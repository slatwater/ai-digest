---
{
  "id": "simple-self-distillation",
  "name": "Simple Self-Distillation (SSD)",
  "aliases": [
    "SSD",
    "Embarrassingly Simple Self-Distillation"
  ],
  "domain": "LLM Post-Training / Code Generation",
  "summary": "一种极简的后训练方法：从冻结模型采样输出（高温度+截断），不做任何正确性过滤，直接用标准 SFT 训练。通过上下文相关的 token 分布重塑，释放模型已有但被贪婪解码锁住的能力。",
  "relations": [
    {
      "conceptId": "self-distillation",
      "conceptName": "Self-Distillation",
      "type": "builds-on",
      "description": "SSD 是自蒸馏在 LLM 代码生成场景下的极简实现，去掉了验证和过滤步骤"
    },
    {
      "conceptId": "precision-exploration-conflict",
      "conceptName": "Precision-Exploration Conflict",
      "type": "related",
      "description": "SSD 的理论解释基础——解释了为什么无需正确性信号也能提升性能"
    },
    {
      "conceptId": "grpo",
      "conceptName": "Group Relative Policy Optimization (GRPO)",
      "type": "contrasts",
      "description": "GRPO 需要奖励信号和 RL 训练，SSD 完全不需要外部信号，但两者可互补"
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
  "updatedAt": "2026-04-07T09:07:58.154Z"
}
---

## 是什么

SSD 的完整流程：(1) 从冻结模型以高训练温度 T_train 和 top-k/top-p 截断采样生成代码，每个 prompt 采样 N=1 次；(2) 不做正确性过滤，直接以标准交叉熵损失微调；(3) 以单独调优的推理温度 T_eval 解码。

其数学机制可分解为三个效应：支撑集压缩（suppressing low-probability tokens）、支撑集内重塑（redistributing mass according to Rényi entropy）、与采样分布对齐（KL alignment）。在锁定位置产生 spike 效应，在分叉位置产生 plateau 效应。

有效温度 T_eff = T_train × T_eval 在无截断时以 R²=0.75 预测性能，最优值约 1.2。

## 能做什么

- 以极低工程复杂度提升代码模型 pass@1（Qwen3-30B-Instruct: +12.9pp）
- 无需代码执行环境、验证器、教师模型或强化学习
- 可作为 RL 流水线前的预处理步骤
- 在 4B-30B 规模、Instruct 和 Thinking 变体上均有效

## 现状与局限

- 在已经很强的 Thinking 模型上提升有限（+2.1pp）
- 目前仅在代码生成任务上充分验证
- 需要针对具体模型调优 T_train/top-k/T_eval 超参数
- 依赖模型已有的隐含能力——如果模型本身能力不足，SSD 无法创造新能力