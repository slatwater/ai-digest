'use client';

import { useState, useCallback } from 'react';
import { TopNav } from '@/components/TopNav';
import { TriageView } from '@/components/TriageView';
import { WikiBrowseView } from '@/components/WikiBrowseView';
import { BlueprintView } from '@/components/BlueprintView';
import { PipelineView } from '@/components/PipelineView';
import { SandboxView } from '@/components/SandboxView';
import { ExperimentView } from '@/components/ExperimentView';
import { ExperienceView } from '@/components/ExperienceView';
import { useWikiSave } from '@/hooks/useWikiSave';
import { useTriage } from '@/hooks/useTriage';
import { useExpand } from '@/hooks/useExpand';
import { useSandbox } from '@/hooks/useSandbox';
import { useExperiment } from '@/hooks/useExperiment';

type View = 'triage' | 'wiki' | 'sandbox' | 'experiment' | 'experience' | 'blueprint';

export default function Home() {
  const [view, setView] = useState<View>('triage');
  const [focusExperienceId, setFocusExperienceId] = useState<string | null>(null);
  const wikiSave = useWikiSave();
  const triage = useTriage();
  const expand = useExpand();
  const sandbox = useSandbox();
  const experiment = useExperiment();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNavigate = useCallback((v: any) => {
    setView(v);
    if (v !== 'experience') setFocusExperienceId(null);
  }, []);

  const handleNavigateToExperience = useCallback((id: string) => {
    setFocusExperienceId(id);
    setView('experience');
  }, []);

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
                  model={expand.model}
                  onAsk={expand.askQuestion}
                  onModelChange={expand.setModel}
                  onExit={() => { expand.reset(); wikiSave.reset(); }}
                  wikiSave={wikiSave}
                />
              </div>
            ) : (
              <TriageView triage={triage}
                onExpand={(entry, question) => expand.startSession(entry, question)} />
            )
          )}

          {/* Wiki 浏览 */}
          {view === 'wiki' && <WikiBrowseView />}

          {/* Skill 沙盒 */}
          {view === 'sandbox' && (
            <div className="max-w-[860px] mx-auto px-8 py-10">
              <SandboxView sandbox={sandbox} />
            </div>
          )}

          {/* 实验 */}
          {view === 'experiment' && (
            <div className="max-w-[860px] mx-auto px-8 py-10">
              <ExperimentView experiment={experiment} onNavigateToExperience={handleNavigateToExperience} />
            </div>
          )}

          {/* 经验 */}
          {view === 'experience' && (
            <div className="max-w-[860px] mx-auto px-8 py-10">
              <ExperienceView focusId={focusExperienceId} />
            </div>
          )}

          {/* 运行原理 */}
          {view === 'blueprint' && (
            <div className="max-w-[860px] mx-auto px-8 py-10">
              <BlueprintView />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
