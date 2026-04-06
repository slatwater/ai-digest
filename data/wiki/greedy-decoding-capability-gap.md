---
{
  "id": "greedy-decoding-capability-gap",
  "name": "贪婪解码能力鸿沟",
  "aliases": [
    "Greedy Decoding Capability Gap",
    "Precision-Exploration Conflict"
  ],
  "domain": "LLM Inference",
  "summary": "LLM 权重中已编码的能力与贪婪/低温解码策略实际表现之间存在的巨大鸿沟。代码生成中尤为突出，因为存在「锁定点需要精确」与「分支点需要探索」的根本冲突，全局温度缩放无法同时满足两者。",
  "relations": [
    {
      "conceptId": "simple-self-distillation",
      "conceptName": "简单自蒸馏",
      "type": "enables",
      "description": "SSD 方法的理论基础正是这一能力鸿沟的存在"
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
    "decoding-strategy",
    "temperature-scaling",
    "pass@k",
    "code-generation",
    "inference"
  ],
  "createdAt": "2026-04-05T08:38:13.404Z",
  "updatedAt": "2026-04-05T08:38:13.404Z"
}
---

## 是什么

贪婪解码能力鸿沟是指 LLM 的权重中实际编码的问题求解能力，与其在标准贪婪解码（或低温采样）下展现的 pass@1 表现之间存在显著差距的现象。Apple SSD 论文（2026）通过实验清晰揭示了这一鸿沟：同一模型在不同解码策略下表现差异巨大。

### 精确-探索冲突

代码生成中存在两类根本矛盾的上下文：
- **Locks（锁定点）**：语法关键词、API 名称等确定性极高的 token 位置，需要模型在极窄的分布上输出正确答案，尾部噪声是主要干扰
- **Forks（分支点）**：算法选择、数据结构设计等存在多个合理续写的位置，需要保留多样性以探索正确路径

温度是全局标量，降温可压缩 Locks 处尾部但扼杀 Forks 处探索，升温反之。这是一个结构性矛盾，无法通过单一温度参数解决。

## 能做什么

理解这一鸿沟具有重要的方法论意义：
- **解释 pass@k 与 pass@1 的差距**：高 pass@k 低 pass@1 的模型正是能力被解码策略锁住的典型表现
- **指导后训练策略**：与其训练新能力，不如释放已有能力——这是 SSD、自蒸馏等方法的理论基础
- **启发解码策略研究**：上下文依赖的自适应采样（而非全局温度）可能是更根本的解决方向
- **重新评估模型能力**：单一 pass@1 指标可能严重低估模型的真实能力

## 现状与局限

- 该现象在代码生成领域被充分验证，但在其他任务（数学推理、开放文本生成）中的表现形态和程度尚不清楚
- 精确-探索冲突框架虽然优雅，但是否为唯一解释机制仍有待研究
- 目前缺乏系统性度量「能力鸿沟」大小的标准方法
- token 级别的自适应解码策略（非全局温度）是一个活跃研究方向