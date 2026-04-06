---
{
  "id": "llm-jailbreaking-techniques",
  "name": "LLM 越狱技术",
  "aliases": [
    "LLM Jailbreaking",
    "Prompt Injection Attack",
    "Safety Bypass"
  ],
  "domain": "AI Safety",
  "summary": "通过精心构造的输入绕过 LLM 安全对齐机制和行为限制的攻击技术族群。包括角色扮演绕过、渐进式叙事攻击、编码混淆、Policy Puppetry（伪造策略文档格式的通用绕过）、JBFuzz（基于模糊测试的自动化越狱框架，成功率约 99%）等。Nature Communications 2026 年研究证实大推理模型可自主发现越狱路径。",
  "relations": [
    {
      "conceptId": "llm-system-prompt-leakage",
      "conceptName": "LLM 系统提示词泄露",
      "type": "enables",
      "description": "越狱技术是系统提示词泄露的主要技术手段"
    },
    {
      "conceptId": "production-system-prompt-architecture",
      "conceptName": "生产级系统提示词架构",
      "type": "contrasts",
      "description": "越狱技术不断挑战和突破系统提示词中的安全架构设计"
    }
  ],
  "sources": [
    {
      "entryId": "de336cb2-f002-4471-99f2-5905f02d14b0",
      "entryTitle": "system_prompts_leaks：主流AI模型系统提示词泄露集大成仓库",
      "date": "2026-04-04T04:27:26.670Z",
      "contribution": "一个拥有37.1k Star的社区驱动GitHub仓库，系统性收集并归档了ChatGPT、Claude、Gemini、Grok、Perplexity等主流AI模型的生产环境系统提示词（System Prompts），揭示了各厂商对AI行为的隐藏约束和架构设计。"
    }
  ],
  "tags": [
    "AI安全",
    "对抗攻击",
    "提示注入",
    "红队测试",
    "Policy Puppetry",
    "JBFuzz",
    "安全对齐"
  ],
  "createdAt": "2026-04-04T04:28:41.169Z",
  "updatedAt": "2026-04-04T04:28:41.169Z"
}
---

## 是什么

 LLM 越狱技术是一系列旨在绕过大语言模型安全对齐机制和行为限制的对抗性攻击方法。这些技术利用模型的指令跟随本能、上下文切换漏洞、编码解码能力等特性，诱导模型执行其系统提示词明确禁止的行为。

主流技术路径包括：
- **直接提取：** 明确要求模型输出系统指令（现代模型已基本防御）
- **角色扮演绕过：** 构建虚构场景框架（如 DAN、开发者模式）诱导泄露
- **渐进式叙事攻击：** 多轮对话逐步瓦解模型防线
- **编码混淆：** 使用 Base64/Unicode 等编码隐藏攻击指令
- **Policy Puppetry：** HiddenLayer 发现的通用绕过技术，通过伪造策略文档格式绕过所有主流模型的安全机制，成功率极高
- **JBFuzz 框架：** 基于模糊测试的自动化越狱工具，成功率约 99%
- **大推理模型自主越狱：** Nature Communications 2026 年研究发现，具备推理能力的大模型可以自主发现并执行越狱路径

## 能做什么

**安全研究：**
- 评估 LLM 产品安全对齐的鲁棒性
- 发现并报告安全漏洞，推动防护技术进化
- 为 AI 安全标准制定提供实证基础

**红队测试：**
- 企业部署 LLM 前的安全评估
- 验证自定义安全护栏的有效性
- 持续监控已部署模型的安全态势

**攻防演进催化：**
- 持续的越狱压力催生更强的注入防御技术
- 促进系统提示与模型权重更深层融合的研究方向
- 推动从「提示级安全」向「模型级安全」的范式转移

## 现状与局限

- **防御几乎无效：** 当前主流模型的越狱成功率高达 97-99%，纯粹基于提示的安全机制已被证明不可靠
- **军备竞赛态势：** 厂商的防御更新与攻击技术迭代形成持续博弈
- **自动化趋势：** JBFuzz 等工具使越狱攻击的技术门槛大幅降低
- **自主越狱威胁：** 推理模型自主发现越狱路径的能力意味着安全问题可能随模型能力提升而加剧
- **伦理争议：** 越狱技术的公开发布存在「负责任披露」与「完全公开」之间的路线争论