// Agent 流程阶段
export type DigestPhase = 'capture' | 'trace' | 'analyze' | 'practice' | 'archive' | 'complete' | 'error';

// SSE 事件类型
export type SSEEventType =
  | 'phase'        // 阶段切换
  | 'text'         // 文本输出（流式）
  | 'question'     // 向用户提问
  | 'sources'      // 发现的相关来源
  | 'analysis'     // 结构化分析结果
  | 'demo'         // Demo 代码
  | 'complete'     // 完成
  | 'error';       // 错误

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  sessionId: string;
}

export interface PhaseEvent {
  phase: DigestPhase;
  label: string;
}

export interface TextEvent {
  content: string;
  phase: DigestPhase;
}

export interface QuestionEvent {
  questionId: string;
  question: string;
  options?: string[];      // 可选的选项
  defaultAnswer?: string;  // 默认回答
}

export interface SourcesEvent {
  sources: SourceInfo[];
}

export interface SourceInfo {
  url: string;
  title: string;
  type: 'original' | 'related' | 'github' | 'paper' | 'docs';
  snippet?: string;
}

export interface AnalysisResult {
  tldr: string;
  keyPoints: string[];
  technical: string;
  significance: string;
  limitations: string;
  comparison: string;
  tags: string[];
}

export interface DemoInfo {
  language: string;
  filename: string;
  code: string;
  instructions: string;
}

// ============================================================
// DigestData — 通用结构化数据 schema
// AI Agent 分析完文章/项目后填充，前端根据有值字段自动渲染对应区块
// 所有字段均可选，没填就不渲染
// ============================================================

/** 完整的结构化分析数据，覆盖所有内容类型 */
export interface DigestData {
  // ---- 基础元信息 ----
  /** 内容类型，决定前端使用哪套渲染侧重 */
  contentType?: 'github' | 'paper' | 'blog' | 'news' | 'model' | 'tool' | 'other';
  /** 一句话摘要（pull-quote 样式） */
  tldr?: string;
  /** 分类标签 */
  tags?: string[];

  // ---- 核心文本区块（支持 Markdown） ----
  /** 核心要点，每条一句话 */
  keyPoints?: string[];
  /** 技术原理/方法/架构 */
  technical?: string;
  /** 行业意义 / 应用场景 */
  significance?: string;
  /** 局限、争议、风险 */
  limitations?: string;

  // ---- 结构化可视化数据 ----

  /** 架构图 — 节点 + 连线，前端渲染为有向图 */
  architecture?: {
    nodes: ArchNode[];
    edges: ArchEdge[];
  };

  /** 流程/管线图 — 有序步骤 */
  pipeline?: PipelineStep[];

  /** 对比表 — 自由列，前端渲染为表格 */
  comparisonTable?: {
    columns: string[];              // 列头，第一列通常是"维度"
    rows: Record<string, string>[]; // 每行一个对象，key 对应 columns
  };

  /** 指标卡片 — 关键数字 / KPI */
  metrics?: MetricItem[];

  /** 时间线 — 重要事件时间轴 */
  timeline?: TimelineEvent[];

  /** 优劣对比 — 简洁的正反面列表 */
  prosAndCons?: {
    pros: string[];
    cons: string[];
  };

  /** 相关项目/技术的简明对比列 */
  alternatives?: AlternativeItem[];

  /** 代码片段 — 多个代码块，各有用途说明 */
  codeSnippets?: CodeSnippet[];

  /** 关键术语表 — 术语 → 一句话解释 */
  glossary?: GlossaryItem[];

  /** 引用/参考文献 */
  references?: ReferenceItem[];

  // ---- GitHub 项目特有 ----
  /** GitHub 仓库信息 */
  repo?: {
    owner?: string;
    name?: string;
    stars?: number;
    forks?: number;
    language?: string;
    license?: string;
    lastUpdated?: string;         // ISO date
  };

  /** 安装/使用命令（快速上手区块） */
  quickStart?: {
    install?: string;             // 安装命令
    usage?: string;               // 基本用法
    requirements?: string[];      // 前置依赖
  };

  // ---- 学术论文特有 ----
  /** 论文元信息 */
  paper?: {
    authors?: string[];
    venue?: string;               // 发表场所（Nature, ICLR, arXiv...）
    year?: number;
    doi?: string;
    arxivId?: string;
    citations?: number;
  };

  /** 实验结果 — 模型/方法在各指标上的得分 */
  benchmarks?: BenchmarkResult[];

  // ---- AI 模型特有 ----
  /** 模型基本信息 */
  modelInfo?: {
    name?: string;
    type?: string;                // transformer, diffusion, GAN...
    parameterCount?: string;      // "7B", "70B", "1.5B"
    trainingData?: string;
    inputModality?: string;       // text, image, audio, multimodal
    outputModality?: string;
    inferenceSpeed?: string;
  };

  // ---- 新闻报道特有 ----
  /** 多方观点 */
  perspectives?: PerspectiveItem[];
}

// ---- 子类型定义 ----

/** 架构图节点 */
export interface ArchNode {
  id: string;
  label: string;
  /** 节点类型，影响渲染样式 */
  type?: 'input' | 'process' | 'output' | 'storage' | 'external' | 'model';
  description?: string;
}

/** 架构图连线 */
export interface ArchEdge {
  from: string;                   // 源节点 id
  to: string;                     // 目标节点 id
  label?: string;                 // 连线上的文字
}

/** 流程步骤 */
export interface PipelineStep {
  label: string;
  description?: string;
  icon?: string;                  // emoji 或图标名
  tech?: string[];                // 涉及的技术/工具
}

/** 指标卡片 */
export interface MetricItem {
  label: string;                  // "Stars", "延迟", "准确率"
  value: string | number;
  unit?: string;                  // "ms", "%", "k"
  trend?: 'up' | 'down' | 'stable'; // 趋势箭头
}

/** 时间线事件 */
export interface TimelineEvent {
  date: string;                   // "2024-03", "2025-01-15"
  title: string;
  description?: string;
}

/** 替代方案/竞品 */
export interface AlternativeItem {
  name: string;
  url?: string;
  description?: string;           // 一句话区别
  similarity?: 'high' | 'medium' | 'low';
}

/** 代码片段 */
export interface CodeSnippet {
  title?: string;                 // "基本用法", "配置示例"
  language: string;
  code: string;
}

/** 术语条目 */
export interface GlossaryItem {
  term: string;
  definition: string;
}

/** 参考文献 */
export interface ReferenceItem {
  title: string;
  url?: string;
  type?: 'paper' | 'blog' | 'docs' | 'github' | 'news' | 'video';
  date?: string;
}

/** Benchmark 结果行 */
export interface BenchmarkResult {
  model: string;                  // 模型/方法名
  scores: Record<string, string | number>; // 指标名 → 得分
  isHighlighted?: boolean;        // 是否是本文主角（高亮行）
}

/** 多方观点（新闻报道用） */
export interface PerspectiveItem {
  source: string;                 // 来源人/机构
  stance?: 'positive' | 'negative' | 'neutral';
  summary: string;
}

// 知识库条目
export interface DigestEntry {
  id: string;
  url: string;
  title: string;
  date: string;           // ISO date string
  tags: string[];
  tldr: string;
  entryType?: 'saved' | 'researched'; // saved=留底, researched=深度研究
  analysis: AnalysisResult;
  sources: SourceInfo[];
  demo?: DemoInfo;
  data?: DigestData;      // 结构化可视化数据
  fullMarkdown: string;   // 完整的分析报告 MD
  chatHistory?: ChatMessage[]; // 追问对话历史
}

// 前端状态
export interface DigestState {
  sessionId: string | null;
  phase: DigestPhase | null;
  messages: StreamMessage[];
  question: QuestionEvent | null;
  isRunning: boolean;
  entry: DigestEntry | null;
}

export interface StreamMessage {
  id: string;
  type: SSEEventType;
  content: string;
  phase?: DigestPhase;
  timestamp: number;
}

// Chat 对话消息
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// === 快速研判 (Triage) ===

export type TriageVerdict = 'skip' | 'save' | 'deep-dive';

export interface TriageRelation {
  id: string;
  title: string;
  overlap: string; // 具体关系描述
}

// 从文章中抽象出的核心知识点
export interface TriageConcept {
  name: string;           // 概念/技术点名称
  root: string;           // 溯源：起源（谁/哪篇论文）+ 核心机制 + 突破点
  whatItEnables: string;   // 拿到它能做什么、造什么
  sourceUrl?: string;      // 一手来源 URL（官方仓库/论文/文档，Agent 通过工具查到的）
}

export interface TriageScores {
  novelty: number;       // 技术新颖度 1-5：1=换皮旧概念 5=范式转换
  usability: number;     // 实用就绪度 1-5：1=纯概念 5=成熟稳定
  leverage: number;      // 生产力杠杆 1-5：1=可有可无 5=颠覆工作方式
  timing: number;        // 时机 1-5：1=太早了 5=再不看就晚了
}

export interface TriageEntry {
  id: string;
  url: string;
  title: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  // 以下字段在 status=done 时填充
  verdict?: TriageVerdict;
  concepts?: TriageConcept[];    // 从文章中抽象出的核心知识点
  explanation?: string;          // 整体理解（串联概念，说清楚意味着什么）
  scores?: TriageScores;         // 四维度评分
  verdictReason?: string;        // verdict 理由（一句话）
  relatedEntries?: TriageRelation[]; // 知识库关联（参考用）
}

export interface TriageBatch {
  id: string;
  createdAt: string;
  status: 'processing' | 'done';
  entries: TriageEntry[];
}

// === Wiki 编译 ===

/** Wiki 词条与来源条目的关系 */
export interface WikiSourceRef {
  entryId: string;
  entryTitle: string;
  date: string;
  contribution: string; // 该条目对此词条贡献了什么
}

/** Wiki 词条间关系 */
export interface WikiRelation {
  conceptId: string;     // slug
  conceptName: string;
  type: 'builds-on' | 'contrasts' | 'related' | 'enables' | 'part-of';
  description: string;
}

/** Wiki 词条 */
export interface WikiEntry {
  id: string;            // slug, e.g. "activation-steering"
  name: string;
  aliases: string[];
  domain: string;        // e.g. "AI Safety", "LLM Inference"
  summary: string;       // 2-3 句概要
  content: string;       // 完整 markdown 正文
  relations: WikiRelation[];
  sources: WikiSourceRef[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** Wiki 索引条目（轻量，列表展示用） */
export interface WikiIndexEntry {
  id: string;
  name: string;
  domain: string;
  summary: string;
  relationCount: number;
  sourceCount: number;
  updatedAt: string;
}
