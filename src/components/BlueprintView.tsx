'use client';

import { useEffect, useState } from 'react';

const phases = [
  { num: '01', name: '采集', desc: '抓取目标链接的网页内容', tools: 'Bash (scrapling) / WebFetch' },
  { num: '02', name: '溯源', desc: '判断是否原始来源，搜索原文、论文、GitHub', tools: 'WebSearch' },
  { num: '03', name: '分析', desc: '多维度深度分析：要点、技术解读、意义、局限、对比', tools: '纯��理' },
  { num: '04', name: '实践', desc: '生成可交互 Demo', tools: '纯推理' },
  { num: '05', name: '归档', desc: '生成 Markdown 研究报告并持久化', tools: '纯推理' },
];

export function BlueprintView() {
  const [prompt, setPrompt] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/blueprint').then(r => r.json()).then(d => setPrompt(d.prompt)).catch(() => setPrompt('加载失败'));
  }, []);

  return (
    <article className="space-y-10">
      <header>
        <h1 className="font-semibold tracking-tight" style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>
          运行原理
        </h1>
        <p className="mt-2" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: '1.6' }}>
          后端启动 Claude Agent SDK 驱动的自主 Agent，按 5 个阶��执行，通过 SSE ���时推送。
        </p>
      </header>

      <section>
        <h2 className="font-semibold mb-4" style={{ fontSize: 'var(--text-base)' }}>Agent 阶段</h2>
        <div className="space-y-3">
          {phases.map(p => (
            <div key={p.num} className="flex gap-4">
              <span className="tabular-nums shrink-0" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)' }}>
                {p.num}
              </span>
              <div>
                <span className="font-medium" style={{ fontSize: 'var(--text-sm)' }}>{p.name}</span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginLeft: 8 }}>{p.desc}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-quaternary)', marginLeft: 8 }}>{p.tools}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-4" style={{ fontSize: 'var(--text-base)' }}>系统提示词</h2>
        {prompt === null ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-quaternary)' }}>加载中...</p>
        ) : (
          <pre
            className="overflow-x-auto px-5 py-5 rounded"
            style={{
              background: 'oklch(14% 0.005 260)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: 'oklch(80% 0.003 260)',
              lineHeight: '1.8',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {prompt}
          </pre>
        )}
      </section>
    </article>
  );
}
