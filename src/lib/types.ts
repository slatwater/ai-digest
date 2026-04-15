// Agent 流程阶段
export type DigestPhase = 'capture' | 'trace' | 'decompose' | 'compose' | 'analyze' | 'archive' | 'complete' | 'error';

// SSE 事件类型
export type SSEEventType =
  | 'phase'        // 阶段切换
  | 'text'         // 文本输出（流式）
  | 'question'     // 向用户提问
  | 'sources'      // 发现的相关来源
  | 'analysis'     // 结构化分析结果
  | 'title'        // 报告标题（增量）
  | 'concepts'     // 概念列表（增量）
  | 'narrative'    // 叙事报告（增量）
  | 'complete'     // 完成
  | 'error';       // 错误

// 深研过程中各阶段的摘要数据
export interface PhaseSummary {
  capture?: { title?: string };
  trace?: { sources: SourceInfo[] };
  decompose?: { concepts: Array<{ name: string; isNew?: boolean }> };
  compose?: { done: boolean };
  archive?: { done: boolean };
}

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

// 深研提取的概念
export interface AnalysisConcept {
  id: string;          // kebab-case slug，同时用于 Wiki
  name: string;        // 中文名
  aliases: string[];
  domain: string;      // 归属领域
  origin?: string;     // 来源：论文/作者/年份
  isNew?: boolean;     // 是否为 Wiki 中不存在的新概念
  summary: string;     // 2-3 句概要
  contribution?: string; // 本文对该概念的具体贡献（一句话，已知技术必填）
  what: string;        // 是什么（Markdown）
  enables: string;     // 能做什么（Markdown）
  limitations: string; // 现状与局限（Markdown）
  relations: { conceptId: string; conceptName: string; type: 'composed-of' | 'part-of' | 'related'; description: string }[];
}

// 叙事报告：问题驱动的渐进式深度研究
export interface NarrativeReport {
  oneliner: string;              // 一句非技术语言说清楚这篇在干什么
  situation: string;             // 现状与矛盾（Markdown）
  insight: string;               // 核心洞察（Markdown）
  insightHighlight: string;      // 一句话提炼洞察（高亮框用）
  mechanism: string;             // 方案机制（Markdown）
  evidence: string;              // 效果与边界（Markdown）
  implications: string;          // 启发（Markdown）
  conceptIndex: string[];        // 概念 id 列表，链接到 Wiki
}

export interface AnalysisResult {
  tldr: string;
  narrative?: NarrativeReport;   // 叙事报告（新）
  concepts?: AnalysisConcept[];  // 概念拆解（给 Wiki）
  comparison?: string;           // 跨概念横向对比
  tags: string[];
  // 旧字段（兼容已有条目）
  keyPoints?: string[];
  technical?: string;
  significance?: string;
  limitations?: string;
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

export type TriageVerdict = 'skip' | 'save';

export interface TriageRelation {
  id: string;
  title: string;
  overlap: string; // 具体关系描述
}

// 从文章中抽象出的原子概念
export interface TriageConcept {
  name: string;           // 概念/技术点名称
  role?: 'subject' | 'component'; // 主角 or 组件
  root: string;           // 溯源：起源 → 核心机制 → 突破点
  whatItEnables: string;   // 拿到它能做什么、造什么
  sourceUrl?: string;      // 一手来源 URL
}

// 旧版打分（兼容历史数据）
export interface TriageScores {
  novelty: number;
  usability: number;
  leverage: number;
  timing: number;
}

// 增量分析
export interface TriageDelta {
  gap: string;              // 这篇文章带来什么新信息（一句话）
}


export interface TriageEntry {
  id: string;
  url: string;
  title: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
  livePhases?: string[];             // 已完成阶段（按时间顺序）
  liveStatus?: string;               // 当前进行中的阶段
  // 以下字段在 status=done 时填充
  verdict?: TriageVerdict;
  concepts?: TriageConcept[];    // 识别到的具名技术
  sources?: SourceInfo[];        // 溯源找到的来源列表
  scrapedContent?: string;       // 抓取的原文（供定向扩展复用）
  narrative?: string;            // 连贯叙述（技术名用 [[name]] 标记）
  composition?: string;          // 组合方式（结构化备份）
  solves?: string;               // 能解决什么（结构化备份）
  explanation?: string;          // 整体理解
  delta?: TriageDelta;            // 增量分析（基于 Wiki）
  scores?: TriageScores;         // 旧版四维度评分（兼容）
  verdictReason?: string;        // verdict 理由（一句话）
  relatedEntries?: TriageRelation[]; // 知识库关联（参考用）
}

export interface TriageBatch {
  id: string;
  createdAt: string;
  status: 'processing' | 'done';
  entries: TriageEntry[];
}

// === Wiki 系统 ===

export interface WikiCategory {
  id: string;        // kebab-case slug
  name: string;      // 显示名
  order: number;
  createdAt: string;
}

export interface WikiSection {
  heading: string;   // 段落标题（agent 决定）
  content: string;   // Markdown
}

export interface WikiSourceLink {
  url: string;
  title: string;
  type?: 'original' | 'paper' | 'github' | 'docs' | 'related';
}

export interface SkillFile {
  name: string;       // skill 名称（如 "dbs-content"）
  command: string;    // /command 名称
  content: string;    // SKILL.md 原文全文
  sourceUrl: string;  // GitHub 文件链接
}

export interface WikiItem {
  id: string;
  name: string;
  categoryId: string;
  sections: WikiSection[];
  sourceLinks: WikiSourceLink[];
  skillFiles?: SkillFile[];  // 附属 skill 源文件
  createdAt: string;
  updatedAt: string;
}

export interface WikiItemSummary {
  id: string;
  name: string;
  categoryId: string;
  sectionHeadings: string[];
  sourceCount: number;
  skillFileCount?: number;
  updatedAt: string;
}

