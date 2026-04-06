---
{
  "id": "simple-self-distillation",
  "name": "简单自蒸馏",
  "aliases": [
    "Simple Self-Distillation",
    "SSD",
    "Apple SSD"
  ],
  "domain": "LLM Training",
  "summary": "Apple Research 提出的极简后训练方法：仅用模型自身高温采样输出做标准 SFT，无需验证器、教师模型或 RL，即可大幅提升代码生成能力（Qwen3-30B pass@1 +30.4%）。其核心洞察是模型能力已编码在权重中但被贪婪解码锁住，通过自蒸馏改变输出分布本身来释放隐藏实力。",
  "relations": [
    {
      "conceptId": "llm-self-distillation",
      "conceptName": "LLM 自蒸馏",
      "type": "part-of",
      "description": "SSD 是自蒸馏范式下的一个极简实例"
    },
    {
      "conceptId": "llm-post-training-paradigm",
      "conceptName": "LLM 后训练范式",
      "type": "contrasts",
      "description": "SSD 以极简 SFT 挑战主流的 RL+验证器后训练复杂度"
    },
    {
      "conceptId": "greedy-decoding-capability-gap",
      "conceptName": "贪婪解码能力鸿沟",
      "type": "builds-on",
      "description": "SSD 的核心洞察——模型能力被贪婪解码锁住——是其方法论基础"
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
    "self-distillation",
    "code-generation",
    "SFT",
    "post-training",
    "Apple Research",
    "distribution-reshaping"
  ],
  "createdAt": "2026-04-05T08:38:13.404Z",
  "updatedAt": "2026-04-05T08:38:13.404Z"
}
---

## 是什么

Simple Self-Distillation (SSD) 是 Apple Research 于 2026 年提出的 LLM 后训练方法（arXiv:2604.01193）。其操作极简三步：
1. 用当前冻结模型以高温度（T=2.0）+ top-k=10 截断采样生成输出
2. 不做任何正确性过滤（即使 62% 的输出不含可提取代码也无妨）
3. 在这些「原始」输出上做标准交叉熵 SFT

### 数学分解

SSD 损失函数可分解为三个正交分量：
- **支撑集压缩（Support Compression）**：移除低概率尾部噪声
- **支撑集内重塑（Within-Support Reshaping）**：通过 Rényi 熵重塑保留的头部分布
- **对齐项（Alignment Term）**：通过 KL 散度锚定于原始模型偏好

### 精确-探索冲突（Precision-Exploration Conflict）

代码生成存在两类根本矛盾的上下文：
- **Locks（锁定点）**：语法确定、几乎无歧义，需要极度精确
- **Forks（分支点）**：多个合理续写路径，需要保留多样性

温度缩放是全局操作，无法同时解决两者。SSD 通过训练改变分布本身，实现上下文依赖的自适应重塑——在 Locks 处压缩尾部，在 Forks 处保留头部多样性。

### 关键参数
- 最优有效温度：T_eff = T_train × T_eval ≈ 1.2
- 最佳配置：T_train=2.0, T_eval=1.1, top-k=10
- 每 prompt 仅需采样 1 次

## 能做什么

- **大幅提升代码生成**：Qwen3-30B-Instruct 在 LiveCodeBench v6 上 pass@1 从 42.4% → 55.3%，难题 pass@5 从 31.1% → 54.1%
- **广泛适用**：在 Qwen 和 Llama 系列 4B/8B/30B 规模上均有效，包括 instruct 和 thinking 变体
- **大幅降低后训练门槛**：任何具备 SFT 能力的团队甚至个人开发者都可使用，无需 RL 基础设施或代码执行环境
- **与现有方法正交组合**：可作为 RL 训练前的预处理步骤，或与 rejection sampling 等方法叠加
- **释放已有模型隐藏潜力**：弥合模型「能力」与「表现」之间的鸿沟

## 现状与局限

- 仅在代码生成任务上验证，数学推理、通用 NLP 等领域效果未知
- 评估主要依赖 LiveCodeBench v6，缺乏多基准交叉验证
- 仅展示单轮 SSD，多轮迭代是否持续提升或出现 mode collapse 未被讨论
- 缺乏与 GRPO、PPO+verifier 等当前最强 RL 后训练方法的直接公平对比
- 持续在自身输出上训练是否会导致能力退化尚不明确
- Apple 已开源 ml-ssd 仓库，但模型 checkpoint 尚未发布，社区独立验证处早期阶段