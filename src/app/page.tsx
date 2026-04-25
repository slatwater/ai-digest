'use client';

import { useState } from 'react';
import { TopNav } from '@/components/TopNav';
import { WikiBrowseView } from '@/components/WikiBrowseView';
import { BlueprintView } from '@/components/BlueprintView';
import { PipelineView } from '@/components/PipelineView';
import { useTriage } from '@/hooks/useTriage';
import { usePipeline } from '@/hooks/usePipeline';

type View = 'triage' | 'wiki' | 'blueprint';

export default function Home() {
  const [view, setView] = useState<View>('triage');
  const triage = useTriage();
  const pipeline = usePipeline();

  return (
    <div className="h-full flex flex-col">
      <TopNav
        active={view}
        onNavigate={setView}
        triageProcessing={triage.isProcessing}
        triageCounts={triage.counts}
      />

      <main className="flex-1 min-h-0 flex">
        <div className={`flex-1 min-h-0 ${view === 'triage' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {/* 统一画布：解析 + 深入追问 */}
          {view === 'triage' && <PipelineView pipeline={pipeline} />}

          {/* Wiki 浏览 */}
          {view === 'wiki' && <WikiBrowseView />}

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
