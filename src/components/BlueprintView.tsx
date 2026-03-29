'use client';

import { useEffect, useState } from 'react';

// 流程阶段定义
const phases = [
  {
    num: '01',
    name: '采集 Capture',
    desc: '抓取目标链接的网页内容',
    tools: ['Bash (scrapling)', 'WebFetch (fallback)'],
    output: '原始网页文本',
  },
  {
    num: '02',
    name: '溯源 Trace',
    desc: '判断是否原始来源，搜索原文、论文、GitHub 仓库等相关资料',
    tools: ['WebSearch'],
    output: '===SOURCES_START=== JSON 数组 ===SOURCES_END===',
  },
  {
    num: '03',
    name: '分析 Analyze',
    desc: '多维度深度分析：要点提炼、技术解读、行业意义、局限争议、横向对比',
    tools: ['—（纯推理）'],
    output: '===ANALYSIS_START=== JSON ===ANALYSIS_END===',
  },
  {
    num: '04',
    name: '实践 Practice',
    desc: '生成纯 HTML/CSS/JS 单文件可交互 Demo，基于真实采集数据',
    tools: ['—（纯推理）'],
    output: '===DEMO_START=== JSON ===DEMO_END===',
  },
  {
    num: '05',
    name: '归档 Archive',
    desc: '生成完整 Markdown 研究报告并持久化到知识库',
    tools: ['—（纯推理）'],
    output: '===REPORT_START=== Markdown ===REPORT_END===',
  },
];

const architecture = [
  { from: '用户输入 URL', to: 'POST /api/digest', label: 'HTTP' },
  { from: 'POST /api/digest', to: 'runDigest()', label: '调用' },
  { from: 'runDigest()', to: 'Claude Agent SDK', label: 'prompt + tools' },
  { from: 'Claude Agent SDK', to: 'SSE 事件流', label: '逐条推送' },
  { from: 'SSE 事件流', to: '前端 useDigest', label: '实时渲染' },
  { from: 'runDigest()', to: 'parseStructuredData', label: '完成后' },
  { from: 'parseStructuredData', to: 'data/*.json + *.md', label: '持久化' },
];

export function BlueprintView() {
  const [prompt, setPrompt] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/blueprint')
      .then(r => r.json())
      .then(d => setPrompt(d.prompt))
      .catch(() => setPrompt('加载失败'));
  }, []);

  return (
    <article className="space-y-12">
      {/* 标题 */}
      <header>
        <h2
          className="font-semibold tracking-tight"
          style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}
        >
          运行原理
        </h2>
        <p className="mt-2" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: '1.6' }}>
          输入链接后，后端启动 Claude Agent SDK 驱动的自主 Agent。Agent 按照系统提示词定义的 5 个阶段依次执行，
          使用工具（Bash、WebSearch 等）完成采集和搜索，自主推理完成分析和生成，最终输出结构化数据。
          整个过程通过 SSE 实时推送到前端。
        </p>
      </header>

      {/* 数据流 */}
      <Section title="数据流" number="01">
        <div className="space-y-0">
          {architecture.map((step, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <code
                className="shrink-0 px-2 py-1 rounded"
                style={{
                  fontSize: 'var(--text-xs)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {step.from}
              </code>
              <span style={{ color: 'var(--text-quaternary)', fontSize: 'var(--text-xs)' }}>
                —{step.label}→
              </span>
              <code
                className="shrink-0 px-2 py-1 rounded"
                style={{
                  fontSize: 'var(--text-xs)',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {step.to}
              </code>
            </div>
          ))}
        </div>
      </Section>

      {/* Agent 阶段 */}
      <Section title="Agent 执行阶段" number="02">
        <div className="space-y-6">
          {phases.map((phase) => (
            <div key={phase.num} className="flex gap-4">
              <span
                className="tabular-nums shrink-0 pt-0.5"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--accent)',
                  letterSpacing: '0.05em',
                  minWidth: '20px',
                }}
              >
                {phase.num}
              </span>
              <div className="flex-1 min-w-0">
                <div
                  className="font-medium"
                  style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}
                >
                  {phase.name}
                </div>
                <p
                  className="mt-1"
                  style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: '1.6' }}
                >
                  {phase.desc}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <Detail label="工具" value={phase.tools.join('、')} />
                  <Detail label="输出" value={phase.output} mono />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 结构化数据提取 */}
      <Section title="数据提取逻辑" number="03">
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: '1.7' }}>
          <p>Agent 运行结束后，<code style={codeStyle}>parseStructuredData()</code> 从完整输出文本中提取结构化数据：</p>
          <ol className="mt-3 space-y-2 list-decimal list-inside">
            <li>正则匹配 <code style={codeStyle}>===XXX_START===</code> / <code style={codeStyle}>===XXX_END===</code> 标记对</li>
            <li>提取标记间内容，去除可能的 Markdown 代码围栏后 JSON.parse</li>
            <li>如果 analysis 标记解析失败，从归档报告的 Markdown 各 section 中回退提取</li>
            <li>组装为 <code style={codeStyle}>DigestEntry</code>，保存至 <code style={codeStyle}>data/</code> 目录</li>
          </ol>
        </div>
      </Section>

      {/* 完整提示词 */}
      <Section title="完整系统提示词" number="04">
        {prompt === null ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>加载中...</div>
        ) : (
          <pre
            className="overflow-x-auto px-5 py-5 rounded-md"
            style={{
              background: 'oklch(12% 0.01 75)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'oklch(85% 0.005 75)',
              lineHeight: '1.8',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {prompt}
          </pre>
        )}
      </Section>
    </article>
  );
}

// 复用子组件
function Section({ title, number, children }: { title: string; number: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-4">
        <span
          className="tabular-nums"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--accent)',
            letterSpacing: '0.05em',
          }}
        >
          {number}
        </span>
        <h3
          className="font-semibold tracking-tight"
          style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}
        >
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
      {label}:{' '}
      <span style={mono ? { fontFamily: 'var(--font-mono)', fontSize: '0.6875rem' } : undefined}>
        {value}
      </span>
    </span>
  );
}

const codeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  background: 'var(--bg-subtle)',
  padding: '1px 5px',
  borderRadius: '3px',
};
