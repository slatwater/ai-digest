'use client';

import { useState, useCallback } from 'react';
import { TopNav } from '@/components/TopNav';
import { TriageView } from '@/components/TriageView';
import { LibraryView } from '@/components/LibraryView';
import { AnalysisView } from '@/components/AnalysisView';
import { WikiChatView } from '@/components/WikiChatView';
import { WikiBrowseView } from '@/components/WikiBrowseView';
import { BlueprintView } from '@/components/BlueprintView';
import { PipelineView } from '@/components/PipelineView';
import { ChatPanel } from '@/components/ChatPanel';
import { useWikiChat } from '@/hooks/useWikiChat';
import { useWikiSave } from '@/hooks/useWikiSave';
import { useTriage } from '@/hooks/useTriage';
import { useExpand } from '@/hooks/useExpand';
import { DigestEntry } from '@/lib/types';

type View = 'triage' | 'library' | 'entry' | 'wiki' | 'wiki-chat' | 'blueprint';

export default function Home() {
  const [view, setView] = useState<View>('triage');
  const [selectedEntry, setSelectedEntry] = useState<DigestEntry | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const wikiChat = useWikiChat();
  const wikiSave = useWikiSave();
  const triage = useTriage();
  const expand = useExpand();

  const handleSelectEntry = useCallback((entry: DigestEntry) => {
    setView('entry');
    setSelectedEntry(entry);
  }, []);

  const handleDeleteEntry = useCallback((id: string) => {
    if (selectedEntry?.id === id) {
      setSelectedEntry(null);
      setView('library');
    }
    setRefreshTrigger(n => n + 1);
  }, [selectedEntry]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNavigate = useCallback((v: any) => {
    setView(v);
    if (v !== 'entry') setSelectedEntry(null);
  }, []);

  const chatEntryId = view === 'entry' ? selectedEntry?.id : undefined;

  return (
    <div className="h-full flex flex-col">
      <TopNav
        active={view}
        onNavigate={handleNavigate}
        triageProcessing={triage.isProcessing}
        triageCounts={triage.counts}
      />

      <main className="flex-1 min-h-0 flex">
        <div className="flex-1 overflow-y-auto">
          {/* 解析（含深入子视图） */}
          {view === 'triage' && (
            expand.active && expand.entry ? (
              <div className="max-w-[860px] mx-auto px-8 py-10">
                <PipelineView
                  entry={expand.entry}
                  stages={expand.stages}
                  canAsk={expand.canAsk}
                  onAsk={expand.askQuestion}
                  onExit={() => { expand.reset(); wikiSave.reset(); }}
                  wikiSave={wikiSave}
                />
              </div>
            ) : (
              <TriageView triage={triage}
                onExpand={(entry, question) => expand.startSession(entry, question)} />
            )
          )}

          {/* 知识库列表 */}
          {view === 'library' && (
            <LibraryView
              onSelectEntry={handleSelectEntry}
              onDeleteEntry={handleDeleteEntry}
              refreshTrigger={refreshTrigger}
            />
          )}

          {/* 条目详情 */}
          {view === 'entry' && selectedEntry && (
            <div className="max-w-[860px] mx-auto px-8 py-10">
              <button
                onClick={() => setView('library')}
                className="link-subtle flex items-center gap-1.5 mb-8"
                style={{ fontSize: 'var(--text-sm)' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                知识库
              </button>
              <header className="mb-10">
                <h1
                  className="font-semibold tracking-tight leading-tight"
                  style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}
                >
                  {selectedEntry.title}
                </h1>
                <a
                  href={selectedEntry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block truncate"
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-quaternary)',
                    transition: 'color var(--duration-fast) var(--ease-out)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-text)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-quaternary)')}
                >
                  {selectedEntry.url}
                </a>
              </header>
              <AnalysisView entry={selectedEntry} />
            </div>
          )}

          {/* Wiki 浏览 */}
          {view === 'wiki' && <WikiBrowseView />}

          {/* Wiki 对话 */}
          {view === 'wiki-chat' && (
            <div className="max-w-[860px] mx-auto px-8 py-10">
              <WikiChatView chat={wikiChat} />
            </div>
          )}

          {/* 运行原理 */}
          {view === 'blueprint' && (
            <div className="max-w-[860px] mx-auto px-8 py-10">
              <BlueprintView />
            </div>
          )}
        </div>

        {/* 右侧追问面板 */}
        {chatEntryId && chatOpen && (
          <ChatPanel entryId={chatEntryId} onClose={() => setChatOpen(false)} />
        )}
      </main>

      {/* 追问入口 */}
      {chatEntryId && !chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-5 right-5 flex items-center gap-2 px-4 py-2 rounded"
          style={{
            zIndex: 20,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            fontWeight: 500,
            cursor: 'pointer',
            boxShadow: '0 2px 8px oklch(0% 0 0 / 0.06)',
            transition: 'border-color var(--duration-fast) var(--ease-out)',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          追问
        </button>
      )}
    </div>
  );
}
