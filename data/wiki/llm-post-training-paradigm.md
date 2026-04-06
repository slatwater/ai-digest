---
{
  "id": "llm-post-training-paradigm",
  "name": "LLM 后训练范式",
  "aliases": [
    "LLM Post-Training",
    "Post-Training Pipeline"
  ],
  "domain": "LLM Training",
  "summary": "LLM 预训练完成后通过 SFT、RLHF、DPO、自蒸馏等方法进一步提升模型在特定任务上表现的技术体系。当前主流路线依赖 RL+验证器的重型基础设施，但 SSD 等极简方法正在挑战这一复杂度假设。",
  "relations": [
    {
      "conceptId": "simple-self-distillation",
      "conceptName": "简单自蒸馏",
      "type": "related",
      "description": "SSD 是后训练范式中复杂度最低的方法之一，挑战了主流重型路线"
    },
    {
      "conceptId": "greedy-decoding-capability-gap",
      "conceptName": "贪婪解码能力鸿沟",
      "type": "related",
      "description": "能力鸿沟的存在意味着后训练可以是释放能力而非注入能力"
    }
  ],
  "sources": [
    {
      "entryId": "380ca8c9-8068-4f31-b89f-653aa143133c",
      "entryTitle": "Apple SSD：尴尬的简单自蒸馏大幅提升代码生成能力",
      "date": "2026-04-05T08:37:11.149Z",
      "contribution": "Apple Research 提出 Simple Self-Distillation (SSD)：仅用模型自身采样输出做 SFT，无需验证器/教师模型/RL，即可将 Qwen3-30B 代码生成 pass@1 从 42.4% 提升至 55.3%。"
    }
  ],
  "tags": [
    "post-training",
    "SFT",
    "RLHF",
    "DPO",
    "GRPO",
    "reinforcement-learning",
    "alignment"
  ],
  "createdAt": "2026-04-05T08:38:13.404Z",
  "updatedAt": "2026-04-05T08:38:13.404Z"
}
---

## 是什么

LLM 后训练是指在大规模预训练之后，通过额外的训练阶段将模型能力对齐到特定任务或用户偏好的技术集合。主要方法包括：

- **SFT（监督微调）**：在高质量标注数据上做标准交叉熵训练
- **RLHF / RLAIF**：通过人类或 AI 反馈训练奖励模型，再用 PPO 等 RL 算法优化策略
- **DPO / KTO**：直接从偏好数据优化，绕过显式奖励模型
- **GRPO**：DeepSeek 提出的组内相对策略优化
- **Rejection Sampling + SFT**：大量采样后过滤正确输出用于 SFT
- **ReST / STaR**：自我改进框架，迭代生成-过滤-训练
- **SPIN**：自我对弈改进
- **自蒸馏（SSD 等）**：用模型自身输出做训练数据

### 复杂度谱系

从简到繁：SSD（纯 SFT，无过滤） → SPIN（自我对弈 SFT） → ReST/STaR（需验证过滤） → Rejection Sampling（需大量采样+验证） → RLHF/GRPO/PPO（需 RL 框架+奖励模型）

## 能做什么

- **对齐**：使模型输出符合人类偏好和安全规范
- **任务特化**：在代码生成、数学推理等特定领域大幅提升表现
- **能力释放**：SSD 等方法表明，后训练不仅是注入新能力，更是释放预训练已编码的潜在能力
- **成本-效果权衡**：不同方法在实现复杂度、计算成本和效果之间提供了丰富的选择空间

## 现状与局限

- 主流代码模型后训练依赖 verifier + RL + 代码沙箱执行，基础设施门槛高
- SSD（2026）证明极简 SFT 在代码生成领域可接近复杂方法的效果，挑战了「复杂度必要性」假设
- 各方法之间的正交性和可组合性尚未被充分探索
- 多轮迭代训练的稳定性（mode collapse 风险）是共同挑战
- 不同任务领域可能需要不同的最优后训练策略组合