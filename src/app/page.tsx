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
import { WikiDetail } from '@/components/WikiDetail';
import { useWiki } from '@/hooks/useWiki';
import { useTriage } from '@/hooks/useTriage';
import { DigestEntry } from '@/lib/types';

type View = 'triage' | 'digest' | 'entry' | 'blueprint' | 'wiki-detail';

export default function Home() {
  const [view, setView] = useState<View>('triage');
  const [selectedEntry, setSelectedEntry] = useState<DigestEntry | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [digestQueue, setDigestQueue] = useState<string[]>([]);
  const [lastUrl, setLastUrl] = useState('');
  const digest = useDigest();
  const wikiHook = useWiki();
  const triage = useTriage();
  const prevPhaseRef = useRef<string | null>(null);

  // 单条深度研究
  const handleStartDeepResearch = useCallback((url: string, force = false, existingId?: string) => {
    if (digest.isRunning) return;
    setLastUrl(url);
    setView('digest');
    setSelectedEntry(null);
    digest.start(url, force, existingId);
  }, [digest]);

  // 从 triage 确认后批量启动深研
  const handleStartDigestBatch = useCallback((urls: string[]) => {
    if (urls.length === 0) return;
    setView('digest');
    setSelectedEntry(null);
    digest.start(urls[0], true);
    setDigestQueue(urls.slice(1));
  }, [digest]);

  // triage 确认后刷新侧边栏
  const handleTriageConfirm = useCallback(({ saved }: { saved: number; skipped: number }) => {
    if (saved > 0) setRefreshTrigger(n => n + 1);
  }, []);

  // 队列自动处理
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

  const handleShowTriage = useCallback(() => {
    setView('triage');
    setSelectedEntry(null);
  }, []);

  const handleShowBlueprint = useCallback(() => {
    setView('blueprint');
    setSelectedEntry(null);
  }, []);

  const handleSelectWiki = useCallback((id: string) => {
    setView('wiki-detail');
    setSelectedEntry(null);
    wikiHook.loadEntry(id);
  }, [wikiHook]);

  // 从 Wiki 详情页点击来源条目
  const handleWikiSelectEntry = useCallback(async (entryId: string) => {
    try {
      const res = await fetch(`/api/entries?id=${entryId}`);
      const entry = await res.json();
      if (entry && !entry.error) {
        setSelectedEntry(entry);
        setView('entry');
      }
    } catch { /* ignore */ }
  }, []);

  // 从留底条目发起深度研究
  const handleDeepDive = useCallback((entry: DigestEntry) => {
    handleStartDeepResearch(entry.url, true, entry.id);
  }, [handleStartDeepResearch]);

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
        onSelectEntry={handleSelectEntry}
        onSelectWiki={handleSelectWiki}
        onDeleteEntry={handleDeleteEntry}
        onShowTriage={handleShowTriage}
        onShowBlueprint={handleShowBlueprint}
        selectedEntryId={view === 'entry' ? selectedEntry?.id : undefined}
        selectedWikiId={view === 'wiki-detail' ? wikiHook.entry?.id : undefined}
        refreshTrigger={refreshTrigger}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[720px] mx-auto px-8 py-8">

            {/* 解析视图 */}
            {view === 'triage' && (
              <TriageView
                triage={triage}
                onStartDigest={handleStartDigestBatch}
                onStartDeepResearch={handleStartDeepResearch}
                onConfirm={handleTriageConfirm}
                isDigestRunning={digest.isRunning}
              />
            )}

            {/* 原理 */}
            {view === 'blueprint' && <BlueprintView />}

            {/* Wiki 详情 */}
            {view === 'wiki-detail' && wikiHook.entry && (
              <WikiDetail
                entry={wikiHook.entry}
                neighbors={wikiHook.neighbors}
                onBack={handleShowTriage}
                onSelectWiki={handleSelectWiki}
                onSelectEntry={handleWikiSelectEntry}
              />
            )}

            {/* 条目详情 */}
            {view === 'entry' && selectedEntry && (
              <div>
                <div className="flex items-center justify-between mb-8">
                  <button
                    onClick={() => { setView('triage'); setSelectedEntry(null); }}
                    className="link-subtle flex items-center gap-1.5"
                    style={{ fontSize: 'var(--text-sm)' }}
                    aria-label="��回"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    返回
                  </button>
                  {selectedEntry.sources.length === 0 && !digest.isRunning && (
                    <button
                      onClick={() => handleDeepDive(selectedEntry)}
                      className="btn btn-primary flex items-center gap-1.5 px-4 py-1.5 rounded-md font-medium"
                      style={{ fontSize: 'var(--text-sm)' }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      深入研究
                    </button>
                  )}
                </div>
                <EntryHeader title={selectedEntry.title} url={selectedEntry.url} />
                <AnalysisView entry={selectedEntry} onSelectWiki={handleSelectWiki} />
                <div className="h-16" /> {/* 底部留白给浮动输入栏 */}
              </div>
            )}

            {/* 深度研究 */}
            {view === 'digest' && (
              <>
                {digest.error && (
                  <div
                    className="mb-6 px-4 py-3 rounded-md"
                    style={{ background: 'var(--error-bg)', fontSize: 'var(--text-sm)', color: 'var(--error)' }}
                  >
                    {digest.error}
                  </div>
                )}

                {digest.duplicate && (
                  <div
                    className="mb-6 px-5 py-4 rounded-md"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}
                  >
                    <p style={{ color: 'var(--text-primary)', fontWeight: 500 }}>该链接已有分析记录</p>
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
                        onClick={() => handleStartDeepResearch(lastUrl, true)}
                        className="link-subtle px-2 py-1.5"
                        style={{ fontSize: 'var(--text-sm)' }}
                      >
                        重新研究
                      </button>
                    </div>
                  </div>
                )}

                {(digest.isRunning || digest.phase === 'complete') && (
                  <div className="mb-6">
                    <PhaseIndicator currentPhase={digest.phase} />
                    {digestQueue.length > 0 && (
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                        队列中还有 {digestQueue.length} 条待研究
                      </p>
                    )}
                  </div>
                )}

                {digest.messages.length > 0 && !activeEntry && (
                  <StreamView messages={digest.messages} isRunning={digest.isRunning} />
                )}

                {activeEntry && (
                  <div>
                    <EntryHeader title={activeEntry.title} url={activeEntry.url} />
                    <AnalysisView entry={activeEntry} onSelectWiki={handleSelectWiki} />
                    <div className="h-16" /> {/* 底部留白给浮动输入栏 */}
                  </div>
                )}

                {!digest.isRunning && !digest.phase && !activeEntry && (
                  <div className="flex flex-col items-start py-16">
                    <p
                      className="leading-relaxed"
                      style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
                    >
                      等待研究开始
                    </p>
                    <p className="mt-3" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
                      在解析页粘贴链接开始深度研究。
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* 浮动进度提示 */}
        {(digest.isRunning && view !== 'digest' || triage.isProcessing && view !== 'triage') && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col gap-2 items-center" style={{ zIndex: 10 }}>
            {digest.isRunning && view !== 'digest' && (
              <button
                onClick={() => setView('digest')}
                className="flex items-center gap-2.5 px-5 py-2.5 rounded-lg"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--accent)',
                  boxShadow: '0 4px 16px oklch(0% 0 0 / 0.1)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--accent)',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
                研究进行中 · 点击查看
                {digestQueue.length > 0 && (
                  <span style={{ color: 'var(--text-tertiary)' }}>+{digestQueue.length} 排队</span>
                )}
              </button>
            )}
            {triage.isProcessing && view !== 'triage' && (
              <button
                onClick={() => setView('triage')}
                className="flex items-center gap-2.5 px-5 py-2.5 rounded-lg"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 4px 16px oklch(0% 0 0 / 0.1)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-secondary)',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--text-tertiary)' }} />
                解析进行中 · {triage.counts.done}/{triage.counts.total} · 点击查看
              </button>
            )}
          </div>
        )}
      </main>

      {/* 浮动追问面板：阅读过程中随时可用 */}
      {((view === 'entry' && selectedEntry) || (view === 'digest' && activeEntry && digest.phase === 'complete')) && (
        <ChatPanel entryId={(view === 'entry' ? selectedEntry?.id : activeEntry?.id) || ''} />
      )}
    </div>
  );
}

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
