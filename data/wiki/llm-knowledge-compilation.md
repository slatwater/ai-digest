---
{
  "id": "llm-knowledge-compilation",
  "name": "LLM 知识编译",
  "aliases": [
    "LLM Knowledge Compilation",
    "LLM Knowledge Bases",
    "知识编译范式"
  ],
  "domain": "Knowledge Management",
  "summary": "由 Karpathy 提出的知识管理范式，将 LLM 类比为编译器，自动将原始研究资料（论文、文章、代码等）增量编译为结构化 Markdown Wiki。人退出编辑角色，只负责提问和验收，所有知识组织、摘要生成、反向链接和持续维护均由 LLM 完成。",
  "relations": [
    {
      "conceptId": "llm-self-indexing",
      "conceptName": "LLM 自索引",
      "type": "enables",
      "description": "知识编译产出的结构化 wiki 通过 LLM 自维护索引实现检索，替代传统 RAG"
    },
    {
      "conceptId": "retrieval-augmented-generation",
      "conceptName": "检索增强生成 (RAG)",
      "type": "contrasts",
      "description": "LLM 知识编译在中等规模下可替代 RAG 管线，避免向量数据库的复杂性"
    }
  ],
  "sources": [
    {
      "entryId": "c3f96737-8b2b-49a1-bc7d-58ac7bebc61b",
      "entryTitle": "Karpathy 提出 LLM Knowledge Bases：用 LLM 编译和维护个人知识库",
      "date": "2026-04-04T03:09:20.875Z",
      "contribution": "Andrej Karpathy 提出用 LLM 将原始研究资料「编译」为 Markdown Wiki 知识库，通过 Obsidian 浏览、LLM 代理查询和维护，实现个人知识的自动化管理与增量增强。"
    }
  ],
  "tags": [
    "PKM",
    "Karpathy",
    "知识管理",
    "LLM应用",
    "Obsidian",
    "Markdown",
    "编译范式"
  ],
  "createdAt": "2026-04-04T03:10:25.367Z",
  "updatedAt": "2026-04-04T03:10:25.367Z"
}
---

## 是什么

LLM 知识编译是 Andrej Karpathy 于 2026 年提出的个人知识管理（PKM）方法论。其核心比喻是将知识管理类比为代码编译：`raw/` 目录存放原始资料（论文、文章、代码、图片等）作为「源码」，LLM 作为「编译器」将其增量编译为结构化的 Markdown Wiki「产物」。

系统架构为流水线式：原始数据 → LLM 编译 → 结构化 Wiki → 查询/增强循环。每次只处理新增或变更的原始数据，避免全量重编译。LLM 自动生成摘要、反向链接、概念分类和文章互联，并维护索引文件（`_index.md`）。

工具链以 Obsidian 为前端（纯 Markdown 文件系统天然兼容 LLM 读写），配合 Web Clipper 采集数据、Marp 生成幻灯片、matplotlib 做可视化，LLM Agent 驱动编译/Q&A/Lint 全流程。

## 能做什么

- **自动知识组织**：将散乱的原始资料自动编译为结构化、互联的 wiki 文章
- **复杂问答**：wiki 达到约 100 篇文章/40 万词规模后，LLM 可直接在上面执行复杂 Q&A，无需传统 RAG 管线
- **多样化输出**：结果可渲染为 Markdown、幻灯片、图表，输出回归 wiki 形成知识积累
- **自动 Linting**：LLM 定期健康检查，发现数据不一致、补充缺失信息、建议新文章主题
- **降低个人知识管理门槛**：人只负责提问和验收，极大降低维护成本

## 现状与局限

- **规模瓶颈**：目前仅在约 40 万词的小规模下验证，更大规模可能仍需 RAG
- **幻觉风险**：LLM 自动编译可能产生错误总结或虚假关联，缺乏系统性事实验证
- **Token 成本**：全链路 LLM 调用（编译+查询+Linting+输出）长期费用可观
- **可复现性差**：Karpathy 自称是「a hacky collection of scripts」，未开源具体实现，但社区已有 llm-knowledge-bases、Notemd 等实现
- **单人适用**：多人协作场景未涉及
- **LLM 强依赖**：wiki 质量完全取决于 LLM 能力，模型不同产出差异大