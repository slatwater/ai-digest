---
{
  "id": "production-system-prompt-architecture",
  "name": "生产级系统提示词架构",
  "aliases": [
    "Production System Prompt Architecture",
    "LLM System Prompt Engineering"
  ],
  "domain": "Agent Architecture",
  "summary": "AI 厂商为生产环境 LLM 产品设计的系统提示词工程体系，涵盖记忆系统、工具调用编排、安全护栏、输出格式控制、多智能体协调等模块化架构。通过泄露的提示词可观察到各厂商已形成高度复杂的分层架构（如 Claude Opus 4.6 提示词达 212KB），代表了当前 LLM 应用工程的最高水准。",
  "relations": [
    {
      "conceptId": "llm-system-prompt-leakage",
      "conceptName": "LLM 系统提示词泄露",
      "type": "related",
      "description": "生产级系统提示词的具体内容通过泄露事件被研究社区获取"
    },
    {
      "conceptId": "llm-jailbreaking-techniques",
      "conceptName": "LLM 越狱技术",
      "type": "contrasts",
      "description": "系统提示中的安全护栏持续被越狱技术突破"
    },
    {
      "conceptId": "llm-as-knowledge-worker",
      "conceptName": "LLM 知识工人范式",
      "type": "related",
      "description": "系统提示词架构是实现 LLM 知识工人角色定义和行为约束的工程载体"
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
    "系统提示词",
    "提示工程",
    "Agent架构",
    "工具调用",
    "安全护栏",
    "多智能体",
    "MCP"
  ],
  "createdAt": "2026-04-04T04:28:41.169Z",
  "updatedAt": "2026-04-04T04:28:41.169Z"
}
---

## 是什么

生产级系统提示词架构是 AI 厂商用于控制和编排 LLM 产品行为的系统级指令工程体系。它已从早期简单的行为指引演变为包含数十个模块的复杂架构，本质上是一种用自然语言编写的「运行时配置与行为规范」。

通过系统提示词泄露仓库揭示的典型架构模块包括：

**Anthropic Claude（最复杂，212KB）：**
- 四层记忆系统：conversation_search → recent_chats → userMemories → userStyle
- MCP 服务器集成：Slack（14个API函数）、Gmail、Calendar、Drive 等外部工具
- Artifacts 输出系统：6种结构化输出格式（.md/.html/.jsx/.svg/.pdf/.mermaid）
- 多智能体协调：TeamCreate / SendMessage 实现 Agent 间通信
- Claude Code 专属：Plan Mode 审批流程、Git 安全协议

**OpenAI GPT：**
- 频道架构：API/Web/Mobile 不同部署渠道使用不同提示配置
- 性格变体系统：Listener/Nerdy/Cynic/Robot 等预设人格模板
- 工具提示分离：Web搜索、Python执行、DALL-E、文件检索各有独立系统提示

**Google Gemini：**
- 多模态生成管线：Veo（视频）、Lyria（音乐）、Imagen（图像）深度集成
- Google 生态工具链原生集成

**跨厂商共性模式：**
- 版权合规硬编码（单次引用≤15词）
- 注入防御指令
- 工具调用权限控制与沙箱隔离

## 能做什么

- **应用开发参考：** 为开发者设计自己的 AI 应用系统提示词提供工程最佳实践模板
- **安全护栏设计：** 学习顶级团队如何在提示层面实现内容安全、版权合规、注入防御
- **多智能体编排：** 参考 Claude 的 TeamCreate/SendMessage 模式设计 Agent 间协作
- **工具调用设计：** 学习如何在系统提示中定义工具的调用规范、权限边界和错误处理
- **产品差异化分析：** 通过对比各厂商架构理解市场竞争格局和技术路线选择

## 现状与局限

- **提示层安全的根本脆弱性：** 纯自然语言指令无法提供硬安全保证，越狱成功率 97-99% 证明提示级安全机制本质上是「软约束」
- **复杂度爆炸：** 212KB 的系统提示词已接近人类可维护的极限，暗示未来可能需要更结构化的配置方式
- **与模型权重的融合趋势：** 业界正探索将安全策略从提示层下沉到模型训练层面，以获得更强的鲁棒性
- **版本管理挑战：** 厂商频繁迭代提示词，多环境（API/Web/Mobile）的一致性维护成本高
- **透明度压力：** 泄露事件倒逼厂商重新考虑系统提示的公开策略，部分厂商可能转向主动披露