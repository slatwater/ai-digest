---
{
  "id": "retrieval-augmented-generation",
  "name": "检索增强生成",
  "aliases": [
    "RAG",
    "Retrieval-Augmented Generation"
  ],
  "domain": "LLM Inference",
  "summary": "通过在生成前从外部知识库检索相关文档片段，将其注入 LLM 上下文以增强回答质量的技术范式。典型架构包括向量数据库、嵌入模型和 LLM 三大组件，是当前企业级知识问答的主流方案。",
  "relations": [
    {
      "conceptId": "llm-knowledge-compilation",
      "conceptName": "LLM 知识编译",
      "type": "contrasts",
      "description": "LLM 知识编译在中等规模下提供了一种比 RAG 更简单的替代方案"
    },
    {
      "conceptId": "llm-self-indexing",
      "conceptName": "LLM 自索引",
      "type": "contrasts",
      "description": "LLM 自索引用自然语言索引替代向量嵌入检索"
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
    "RAG",
    "检索",
    "向量数据库",
    "嵌入模型",
    "知识问答"
  ],
  "createdAt": "2026-04-04T03:10:25.367Z",
  "updatedAt": "2026-04-04T03:10:25.367Z"
}
---

## 是什么

RAG（Retrieval-Augmented Generation）是将信息检索与语言模型生成相结合的技术框架，由 Meta AI 于 2020 年提出。核心流程为：将文档切分为片段并通过嵌入模型转化为向量存入向量数据库；查询时将用户问题同样向量化，通过相似度搜索找到最相关的文档片段；将检索到的片段注入 LLM 上下文中生成回答。

典型技术栈包括：文档处理管线（切分、清洗）、嵌入模型（如 OpenAI Embeddings）、向量数据库（如 Pinecone、Weaviate、Chroma）、以及 LLM 生成层。

## 能做什么

- **大规模知识问答**：可处理数百万文档的企业知识库
- **减少幻觉**：通过提供事实性文档片段约束 LLM 输出
- **知识实时更新**：新增文档只需嵌入入库，无需重新训练模型
- **广泛的行业应用**：客服、法律、医疗、技术文档等场景

## 现状与局限

- **基础设施复杂**：需要维护嵌入管线、向量数据库、检索策略等多个组件
- **检索质量瓶颈**：向量相似度搜索在语义复杂查询上可能不准确
- **切分策略难题**：文档切分粒度直接影响检索质量，缺乏通用最优解
- **在中小规模场景下可能过度工程化**：如 Karpathy 所示，40 万词规模的知识库用 LLM 自索引即可胜任
- **持续演进**：GraphRAG、Agentic RAG 等变体不断涌现，架构仍在快速迭代