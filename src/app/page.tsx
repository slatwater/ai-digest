'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDigest } from '@/hooks/useDigest';
import { PhaseIndicator } from '@/components/PhaseIndicator';
import { StreamView } from '@/components/StreamView';
import { AnalysisView } from '@/components/AnalysisView';
import { Sidebar } from '@/components/Sidebar';
import { BlueprintView } from '@/components/BlueprintView';
import { ChatPanel } from '@/components/ChatPanel';
import { DigestEntry } from '@/lib/types';

type View = 'digest' | 'entry' | 'blueprint';

export default function Home() {
  const [url, setUrl] = useState('');
  const [view, setView] = useState<View>('digest');
  const [selectedEntry, setSelectedEntry] = useState<DigestEntry | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const digest = useDigest();
  const prevPhaseRef = useRef<string | null>(null);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || digest.isRunning) return;
    setView('digest');
    setSelectedEntry(null);
    digest.start(url.trim());
  }, [url, digest]);

  const handleSelectEntry = useCallback((entry: DigestEntry) => {
    setView('entry');
    setSelectedEntry(entry);
  }, []);

  const handleShowBlueprint = useCallback(() => {
    setView(prev => prev === 'blueprint' ? 'digest' : 'blueprint');
    setSelectedEntry(null);
  }, []);

  const handleDeleteEntry = useCallback((id: string) => {
    if (selectedEntry?.id === id) {
      setSelectedEntry(null);
      setView('digest');
    }
    setRefreshTrigger(n => n + 1);
  }, [selectedEntry]);

  // 完成后刷新侧边栏
  useEffect(() => {
    if (digest.phase === 'complete' && prevPhaseRef.current !== 'complete') {
      const timer = setTimeout(() => setRefreshTrigger(n => n + 1), 500);
      return () => clearTimeout(timer);
    }
    prevPhaseRef.current = digest.phase;
  }, [digest.phase]);

  const activeEntry = view === 'entry' ? selectedEntry : digest.entry;

  return (
    <div className="h-full flex">
      <Sidebar
        onSelect={handleSelectEntry}
        onDelete={handleDeleteEntry}
        onShowBlueprint={handleShowBlueprint}
        showingBlueprint={view === 'blueprint'}
        selectedId={selectedEntry?.id}
        refreshTrigger={refreshTrigger}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Input area */}
        <header
          className="shrink-0"
          style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}
        >
          <div className="max-w-[720px] mx-auto px-8 py-5">
            <form onSubmit={handleSubmit} className="flex gap-3">
              <input
                id="digest-url"
                name="url"
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="粘贴链接，开始研究"
                className="input-field flex-1 px-4 py-2.5 rounded-md"
                style={{
                  fontSize: 'var(--text-sm)',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                disabled={digest.isRunning}
              />
              {digest.isRunning ? (
                <button
                  type="button"
                  onClick={digest.stop}
                  className="btn btn-danger px-5 py-2.5 rounded-md font-medium"
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  停止
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!url.trim()}
                  className="btn btn-primary px-5 py-2.5 rounded-md font-medium"
                  style={{ fontSize: 'var(--text-sm)' }}
                >
                  研究
                </button>
              )}
            </form>

            {(digest.isRunning || digest.phase === 'complete') && (
              <PhaseIndicator currentPhase={digest.phase} />
            )}
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[720px] mx-auto px-8 py-8">
            {/* Error */}
            {digest.error && (
              <div
                className="mb-6 px-4 py-3 rounded-md"
                style={{
                  background: 'var(--error-bg)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--error)',
                }}
              >
                {digest.error}
              </div>
            )}

            {/* Blueprint view */}
            {view === 'blueprint' && <BlueprintView />}

            {/* History entry view */}
            {view === 'entry' && selectedEntry && (
              <div>
                <button
                  onClick={() => { setView('digest'); setSelectedEntry(null); }}
                  className="link-subtle flex items-center gap-1.5 mb-8"
                  style={{ fontSize: 'var(--text-sm)' }}
                  aria-label="返回主页"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  返回
                </button>
                <EntryHeader title={selectedEntry.title} url={selectedEntry.url} />
                <AnalysisView entry={selectedEntry} />
                <ChatPanel entryId={selectedEntry.id} />
              </div>
            )}

            {/* Active digest */}
            {view === 'digest' && (
              <>
                {digest.messages.length > 0 && !activeEntry && (
                  <StreamView messages={digest.messages} isRunning={digest.isRunning} />
                )}

                {activeEntry && (
                  <div>
                    <EntryHeader title={activeEntry.title} url={activeEntry.url} />
                    <AnalysisView entry={activeEntry} />
                    {digest.phase === 'complete' && (
                      <ChatPanel entryId={activeEntry.id} />
                    )}
                  </div>
                )}

                {/* Empty state */}
                {!digest.isRunning && !digest.phase && !activeEntry && (
                  <div className="flex flex-col items-start py-16">
                    <p
                      className="leading-relaxed"
                      style={{
                        fontSize: 'var(--text-xl)',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      粘贴一个链接，
                      <br />
                      获得深度研究分析。
                    </p>
                    <div className="mt-6 space-y-2">
                      {[
                        '新闻报道 — 溯源原文，多维度解读',
                        '技术博客 — 拆解原理，横向对比',
                        'GitHub 项目 — 理解架构，生成可运行 Demo',
                        '学术论文 — 提炼要点，评估影响',
                      ].map((line, i) => (
                        <p
                          key={i}
                          style={{
                            fontSize: 'var(--text-sm)',
                            color: 'var(--text-tertiary)',
                            lineHeight: '1.6',
                          }}
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// 复用的标题组件，避免重复
function EntryHeader({ title, url }: { title: string; url: string }) {
  return (
    <header className="mb-10">
      <h2
        className="font-semibold tracking-tight leading-tight"
        style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}
      >
        {title}
      </h2>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="link-accent mt-2 block truncate"
        style={{ fontSize: 'var(--text-xs)' }}
      >
        {url}
      </a>
    </header>
  );
}
