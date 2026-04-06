---
{
  "id": "llm-system-prompt-leakage",
  "name": "LLM 系统提示词泄露",
  "aliases": [
    "System Prompt Leakage",
    "System Prompt Extraction",
    "OWASP LLM07:2025"
  ],
  "domain": "AI Safety",
  "summary": "LLM 产品中隐藏的系统提示词被用户通过各种技术手段提取并公开的安全风险类别。OWASP 已将其列为 LLM Top 10 安全风险之一（LLM07:2025）。当前研究表明主流模型的系统提示在技术上几乎无法完全保密（越狱成功率 97-99%），引发了 AI 透明度与安全性的根本性辩论。",
  "relations": [
    {
      "conceptId": "llm-jailbreaking-techniques",
      "conceptName": "LLM 越狱技术",
      "type": "related",
      "description": "系统提示词泄露是越狱技术的主要应用场景之一"
    },
    {
      "conceptId": "production-system-prompt-architecture",
      "conceptName": "生产级系统提示词架构",
      "type": "related",
      "description": "泄露事件揭示了各厂商的生产级提示词架构设计"
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
    "OWASP",
    "系统提示词",
    "信息泄露",
    "AI透明度",
    "红队测试"
  ],
  "createdAt": "2026-04-04T04:28:41.169Z",
  "updatedAt": "2026-04-04T04:28:41.169Z"
}
---

## 是什么

LLM 系统提示词泄露是指生产环境中 AI 模型的隐藏系统指令（system prompt）被终端用户通过提示注入、角色扮演绕过、编码混淆、Policy Puppetry 等技术手段提取并公开的安全风险。OWASP 在 2025 年将其正式列为 LLM Top 10 安全风险（LLM07:2025）。

系统提示词是 AI 厂商用于定义模型行为边界、安全策略、工具调用权限、输出格式和价值对齐策略的核心配置，通常包含商业机密级别的架构设计信息。

社区驱动的 GitHub 仓库（如 asgeirtj/system_prompts_leaks 37.1k Stars、x1xhlol/system-prompts-and-models-of-ai-tools 134k Stars）系统性地收集和归档了 ChatGPT、Claude、Gemini、Grok 等主流模型的生产环境提示词。

## 能做什么

**安全研究价值：**
- 为红队测试和安全审计提供生产级真实数据集
- 揭示各厂商实际部署的防护机制和安全策略
- 暴露版权合规机制（如单次引用≤15词的硬限制）、注入防御、内容隔离等具体实现

**竞争情报价值：**
- 透视各厂商差异化策略：Anthropic 的重型工具生态 vs OpenAI 的频道架构 vs Google 的多模态管线 vs xAI 的社交平台整合
- Claude Opus 4.6 的提示词长达 212KB，揭示了四层记忆系统、MCP 服务器集成、多智能体协调等架构细节

**提示工程参考：**
- 顶级 AI 团队在工具调用设计、安全护栏构建、多智能体协调方面的工程最佳实践

## 现状与局限

- **技术上几乎不可防：** 2025-2026 年间研究数据显示主流模型越狱成功率高达 97-99%（Nature Communications, 2026），系统提示的完全保密在技术上近乎不可能
- **真实性存疑：** 无法 100% 确认提取内容的完整性，模型可能仅泄露部分或产生幻觉补充
- **法律灰色地带：** 系统提示词是否构成受保护的商业秘密尚无明确判例
- **安全悖论：** 透明度促进公众监督 vs 暴露防护细节降低攻击门槛，社区对此存在根本性分歧
- **时效性问题：** 厂商频繁更新提示词，归档内容可能迅速过时