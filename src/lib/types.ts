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
  direct?: boolean;                  // 直接深入模式（跳过 triage agent）
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
  // token 用量统计
  tokenUsage?: {
    model: string;               // 使用的模型
    turns: number;               // agent 轮次
    inputTokens: number;         // 总 input tokens
    outputTokens: number;        // 总 output tokens
    cacheReadTokens: number;     // cache read tokens
    costUsd?: number;            // 费用（美元）
    durationMs?: number;         // 耗时（毫秒）
  };
}

// 解析可选模型
// 'sonnet' = SDK 别名（跟随最新 sonnet），'opus' / 'opus-4-6' = 明确 ID
// 注：SDK 0.2.85 的 'opus' 别名实际映射到 4.6，不会自动跟到 4.7
// 所以这里把 'opus' 显式解析为 claude-opus-4-7，绕开 SDK 旧别名
export type TriageModel = 'sonnet' | 'opus' | 'opus-4-6';

// 把内部别名解析成传给 SDK 的实际模型 ID
export function resolveModelId(model: TriageModel | undefined): string {
  if (model === 'opus-4-6') return 'claude-opus-4-6';
  if (model === 'opus') return 'claude-opus-4-7';
  return model || 'sonnet';
}

export interface TriageBatch {
  id: string;
  createdAt: string;
  status: 'processing' | 'done';
  model?: TriageModel;
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

export interface WikiItem {
  id: string;
  name: string;
  categoryId: string;
  sections: WikiSection[];
  sourceLinks: WikiSourceLink[];
  createdAt: string;
  updatedAt: string;
}

export interface WikiItemSummary {
  id: string;
  name: string;
  categoryId: string;
  sectionHeadings: string[];
  sourceCount: number;
  updatedAt: string;
}

// === 实验 / 经验 ===

// coze 进程执行状态（沙盒实时推送到前端）
export interface CozeRun {
  id: string;              // 进程唯一 id
  command: string;         // 执行的命令（截断）
  status: 'running' | 'success' | 'failed';
  startedAt: number;
  endedAt?: number;
  exitCode?: number;
  stdout: string;          // 累积的 stdout
  stderr: string;          // 累积的 stderr
}

// 经验条目：好的实验方案的产物
export interface ExperienceEntry {
  id: string;
  title: string;
  summary: string;                  // 一句话概要
  content: string;                  // 完整 markdown 方案
  wikiItemIds: string[];            // 来源 wiki 条目
  wikiItemNames: string[];          // 冗余存名字，避免 join
  cozeRuns: CozeRun[];              // 验证过的 coze 调用记录
  createdAt: string;
  updatedAt: string;
}

export interface ExperienceSummary {
  id: string;
  title: string;
  summary: string;
  wikiItemNames: string[];
  cozeRunCount: number;
  updatedAt: string;
}

// === 深入追问 Pipeline（分支画布 + 沉淀区） ===

// 节点类型：input=URL 输入卡；parse=解析结果卡；question/answer=追问链；experiment=以某个 answer 为种子的实验节点；github=每日 GitHub trending 候选池（勾选后转为 input 流）；distill=经验沉淀 agent（导入文档+多轮对话→存为经验）
export type PipelineNodeType = 'input' | 'parse' | 'question' | 'answer' | 'experiment' | 'github' | 'distill';
export type PipelineNodeState = 'pending' | 'streaming' | 'done' | 'error';

// GitHub trending 候选项（每日 9 点定时抓取，每天覆盖）
export type GithubTrendingCategory = 'all' | 'typescript' | 'python';
export interface GithubTrendItem {
  repo: string;                    // owner/name
  url: string;                     // 绝对 URL
  category: GithubTrendingCategory;
}
export interface GithubTrendingPayload {
  items: GithubTrendItem[];        // 9 条（all/ts/python 各 3）
  fetchedAt: string;               // ISO；按本地日期判断是否需要刷新
  date: string;                    // YYYY-MM-DD（fetchedAt 当天）
}

// 实验节点内嵌：对话 + coze 运行记录（刷新/重启后从此恢复）
export interface ExperimentToolTrace {
  tool: string;
  detail: string;
  timestamp: number;
}

export interface ExperimentNodePayload {
  sourceNodeId: string;            // 发起实验的 answer 节点 id
  seedTitle?: string;              // 节点卡标题（answer.markedAs / 首行）
  seedText: string;                // 冻结的 answer 文本（实验起点快照）
  sdkSessionId?: string | null;    // 后端 experiment 会话 id（resume 用）
  model?: TriageModel;
  resolvedModel?: string;
  messages: ChatMessage[];         // 对话历史（真相源）
  cozeRuns: CozeRun[];             // coze 运行记录
  toolTraces?: ExperimentToolTrace[];
  savedExperienceId?: string;      // 存为经验后的 id
}

// 经验沉淀节点内嵌：导入的文档 + 多轮对话 + 草稿
// 文件 content 直接是文本（前端原文 / 后端 pdf-parse / mammoth 解析后的纯文本）
export interface DistillFile {
  name: string;                    // 文件名
  size: number;                    // 原始字节数
  mime?: string;                   // 原始 MIME（仅展示用）
  content: string;                 // 解析后的纯文本（pdf/word 转 text）
  addedAt: number;
}

export interface DistillNodePayload {
  files: DistillFile[];            // 已导入文档（可空：纯对话也允许）
  messages: ChatMessage[];         // 多轮对话历史
  sdkSessionId?: string | null;    // 后端会话 id（resume 用）
  model?: TriageModel;
  resolvedModel?: string;
  savedExperienceId?: string;      // 存为经验后的 id
}

// Parse 节点内嵌的 triage entry 快照
export interface ParseNodePayload {
  entryId: string;                 // 对应 TriageEntry.id
  batchId?: string;                // 所属 batch（轮询用）
  url: string;
  title: string;
  verdict?: TriageVerdict;
  verdictReason?: string;
  narrative?: string;
  concepts?: TriageConcept[];
  sources?: SourceInfo[];
  relatedEntries?: TriageRelation[];
  delta?: TriageDelta;
  livePhases?: string[];
  liveStatus?: string;
  direct?: boolean;                // 直接深入模式：只抓原文不跑 agent，narrative 是页面正文摘要
  tokenUsage?: TriageEntry['tokenUsage'];
}

export interface PipelineNode {
  id: string;                    // 如 n1/n2
  type: PipelineNodeType;
  state: PipelineNodeState;
  text: string;                  // 问题或回答正文；input 节点存 URL 列表；parse 节点存摘要
  parent: string | null;         // 上级节点 id（null = 根）
  branchIdx: number;             // 分支编号（0 = 主干）
  branchLabel?: string;          // 分支标签（如 "A · 稀疏化机制"）
  flowIdx?: number;              // 所属流（0=第一条，+1=新流程按钮创建）
  // 画布坐标（前端可编辑）
  x?: number;
  y?: number;
  w?: number;
  h?: number;                    // 自定义高度；未设则用默认 NODE_H（github 节点列表更长，需要 h=360）
  createdAt: string;
  duration?: string;             // 如 "8.3s"
  tokens?: number;               // output tokens
  sources?: string[];            // 模型引用的来源
  model?: TriageModel;
  error?: string;
  // input 节点字段
  inputUrls?: string[];          // 用户粘贴的 URL 列表
  inputModel?: TriageModel;      // 提交时使用的模型
  // parse 节点字段
  parseEntry?: ParseNodePayload; // 解析完成后填充
  // experiment 节点字段
  experimentPayload?: ExperimentNodePayload; // 实验节点持久化（对话+coze）
  // github 节点字段
  githubPayload?: GithubTrendingPayload;     // 每日 GitHub trending 候选池
  // distill 节点字段
  distillPayload?: DistillNodePayload;       // 经验沉淀节点（文件+多轮对话+草稿）
}

export interface PipelineWikiCandidate {
  action: 'append' | 'new';
  entryId?: string;              // append 时的目标 WikiItem.id
  name?: string;                 // new 时的草拟名
  categoryId?: string;
}

// 新流程：每个段落直接带原文 excerpts（用户右键选区即时存入，无需经过 sediment 暂存）
export interface PipelineDraftSection {
  heading: string;
  excerpts: string[];
}

export interface PipelineDraft {
  name: string;
  categoryId: string;
  newCategory?: { name: string } | null;
  sections: PipelineDraftSection[];
  sourceLinks: WikiSourceLink[];
  appendToItemId?: string;       // 若为追加，目标条目 id
}

export interface PipelineSessionSnapshot {
  title: string;
  url: string;
  narrative?: string;
  concepts?: TriageConcept[];
  sources?: SourceInfo[];
}

export interface PipelineSession {
  id: string;
  entryId?: string;                        // 旧字段：首个 parse 节点对应的 triage entry，兼容老数据
  entrySnapshot?: PipelineSessionSnapshot; // 旧字段：冻结的上下文；新模型下每个 parse 节点自带 payload
  nodes: PipelineNode[];
  wikiCandidate?: PipelineWikiCandidate;
  draft?: PipelineDraft;
  sdkSessionId?: string;                   // 旧字段：单一共享 SDK session（兼容老数据，作为 branchIdx=0 的兜底）
  branchSessionIds?: Record<number, string>; // 每个分支独立的 SDK session；派生分支时新开，避免跨分支污染
  model?: TriageModel;
  savedWikiItemId?: string;                // 存入 wiki 后的条目 id
  createdAt: string;
  updatedAt: string;
}

export interface PipelineSessionSummary {
  id: string;
  entryId?: string;
  title: string;
  nodeCount: number;
  savedWikiItemId?: string;
  updatedAt: string;
}

