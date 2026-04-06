---
{
  "id": "llm-self-indexing",
  "name": "LLM 自索引",
  "aliases": [
    "LLM Self-Indexing",
    "自索引替代 RAG"
  ],
  "domain": "LLM Inference",
  "summary": "LLM 自行维护知识库的索引文件和文档摘要，在中等规模（约 40 万词）下实现检索能力，绕过向量数据库和嵌入模型等传统 RAG 基础设施。核心依赖是 LLM 上下文窗口足以容纳索引信息。",
  "relations": [
    {
      "conceptId": "llm-knowledge-compilation",
      "conceptName": "LLM 知识编译",
      "type": "part-of",
      "description": "自索引是知识编译系统中的检索组件"
    },
    {
      "conceptId": "retrieval-augmented-generation",
      "conceptName": "检索增强生成 (RAG)",
      "type": "contrasts",
      "description": "用 LLM 自维护的自然语言索引替代向量嵌入检索"
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
    "检索",
    "索引",
    "RAG替代",
    "上下文窗口",
    "LLM应用"
  ],
  "createdAt": "2026-04-04T03:10:25.367Z",
  "updatedAt": "2026-04-04T03:10:25.367Z"
}
---

## 是什么

 LLM 自索引是一种让 LLM 自己构建并维护知识库索引的检索策略。在 Karpathy 的 LLM Knowledge Bases 系统中，LLM 在编译 wiki 的同时自动生成和更新索引文件（如 `_index.md`），包含每篇文章的摘要、关键词和反向链接。查询时 LLM 先读取索引定位相关文章，再深入阅读具体内容回答问题。

与传统 RAG 系统使用向量嵌入+相似度搜索不同，这种方法完全依赖 LLM 的语言理解能力进行检索和定位，索引本身也是自然语言（Markdown）。

## 能做什么

- **简化基础设施**：无需向量数据库、嵌入模型等组件，只需文件系统 + LLM API
- **语义精确**：LLM 对自然语言索引的理解优于简单的向量相似度匹配
- **零额外运维**：索引随编译过程自动更新，无需单独维护 embedding pipeline
- **适合个人知识库**：中等规模场景下效果好，与 Obsidian 等工具无缝集成

## 现状与局限

- **规模天花板**：受限于 LLM 上下文窗口大小，当索引本身超过上下文窗口时方法失效
- **成本与延迟**：每次查询都需要 LLM 处理索引，比向量搜索慢且贵
- **缺乏精确度量**：没有标准化的检索评估指标（如 recall@k），难以与 RAG 做量化对比
- **依赖 LLM 质量**：索引的组织质量取决于 LLM 的摘要和分类能力