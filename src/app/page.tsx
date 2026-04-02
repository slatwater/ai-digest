'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDigest } from '@/hooks/useDigest';
import { PhaseIndicator } from '@/components/PhaseIndicator';
import { StreamView } from '@/components/StreamView';
import { AnalysisView } from '@/components/AnalysisView';
import { Sidebar } from '@/components/Sidebar';
import { BlueprintView } from '@/components/BlueprintView';
import { ChatPanel } from '@/components/ChatPanel';
import { TriageView } from '@/components/TriageView';
import { DigestEntry } from '@/lib/types';

type View = 'triage' | 'digest' | 'entry' | 'blueprint';

export default function Home() {
  const [url, setUrl] = useState('');
  const [view, setView] = useState<View>('triage');
  const [selectedEntry, setSelectedEntry] = useState<DigestEntry | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [digestQueue, setDigestQueue] = useState<string[]>([]);
  const digest = useDigest();
  const prevPhaseRef = useRef<string | null>(null);

  // 单条深度研究
  const handleSubmit = useCallback((e: React.FormEvent, force = false) => {
    e.preventDefault();
    if (!url.trim() || digest.isRunning) return;
    setView('digest');
    setSelectedEntry(null);
    digest.start(url.trim(), force);
  }, [url, digest]);

  // 从 triage 确认后批量启动深研（逐条队列）
  const handleStartDigestBatch = useCallback((urls: string[]) => {
    if (urls.length === 0) return;
    setView('digest');
    setSelectedEntry(null);
    // 第一条立即开始，剩余入队
    digest.start(urls[0], true);
    setDigestQueue(urls.slice(1));
  }, [digest]);

  // triage 确认后刷新侧边栏（留底条目需要出现在列表中）
  const handleTriageConfirm = useCallback(({ saved }: { saved: number; skipped: number }) => {
    if (saved > 0) {
      setRefreshTrigger(n => n + 1);
    }
  }, []);

  // 当前深研完成后，自动处理队列中的下一条
  useEffect(() => {
    if (digest.phase === 'complete' && digestQueue.length > 0) {
      const timer = setTimeout(() => {
        const [next, ...rest] = digestQueue;
        setDigestQueue(rest);
        digest.start(next, true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [digest.phase, digestQueue, digest]);

  const handleSelectEntry = useCallback((entry: DigestEntry) => {
    setView('entry');
    setSelectedEntry(entry);
  }, []);

  const handleShowBlueprint = useCallback(() => {
    setView(prev => prev === 'blueprint' ? 'triage' : 'blueprint');
    setSelectedEntry(null);
  }, []);

  const handleShowTriage = useCallback(() => {
    setView('triage');
    setSelectedEntry(null);
  }, []);

  const handleDeleteEntry = useCallback((id: string) => {
    if (selectedEntry?.id === id) {
      setSelectedEntry(null);
      setView('triage');
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
        onShowTriage={handleShowTriage}
        showingBlueprint={view === 'blueprint'}
        showingTriage={view === 'triage'}
        selectedId={selectedEntry?.id}
        refreshTrigger={refreshTrigger}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header：单条深研输入 */}
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
                placeholder="粘贴单个链接，直接深度研究"
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

            {/* 深研进度 + 队列提示 */}
            {(digest.isRunning || digest.phase === 'complete') && (
              <div>
                <PhaseIndicator currentPhase={digest.phase} />
                {digestQueue.length > 0 && (
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                    队列中还有 {digestQueue.length} 条待研究
                  </p>
                )}
              </div>
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

            {/* URL 去重提示 */}
            {digest.duplicate && (
              <div
                className="mb-6 px-5 py-4 rounded-md"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                }}
              >
                <p style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  该链接已有分析记录
                </p>
                <p className="mt-1">{digest.duplicate.title}</p>
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={() => {
                      fetch(`/api/entries?id=${digest.duplicate!.entryId}`)
                        .then(r => r.json())
                        .then(entry => { setSelectedEntry(entry); setView('entry'); });
                    }}
                    className="btn btn-primary px-4 py-1.5 rounded-md font-medium"
                    style={{ fontSize: 'var(--text-sm)' }}
                  >
                    查看已有分析
                  </button>
                  <button
                    onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)}
                    className="link-subtle px-2 py-1.5"
                    style={{ fontSize: 'var(--text-sm)' }}
                  >
                    重新研究
                  </button>
                </div>
              </div>
            )}

            {/* Triage view — 默认首页 */}
            {view === 'triage' && (
              <TriageView onStartDigest={handleStartDigestBatch} onConfirm={handleTriageConfirm} />
            )}

            {/* Blueprint view */}
            {view === 'blueprint' && <BlueprintView />}

            {/* History entry view */}
            {view === 'entry' && selectedEntry && (
              <div>
                <button
                  onClick={() => { setView('triage'); setSelectedEntry(null); }}
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

                {/* Digest empty state — 深研流未启动时提示 */}
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
                      深度研究进行中...
                    </p>
                    <p
                      className="mt-3"
                      style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}
                    >
                      在顶部输入框粘贴链接直接研究，或从每日研判中选择。
                    </p>
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

// 复用的标题组件
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
