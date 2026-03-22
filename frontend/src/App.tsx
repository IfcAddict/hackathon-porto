import React, { useEffect, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { ViewerContainer } from './components/ViewerContainer';
import { PropertyPanel } from './components/PropertyPanel';
import { DiffSidebar } from './components/DiffSidebar';
import { useAppStore } from './store/useAppStore';
import { DiffService } from './services/DiffService';
import { usePollBackendIfcFiles } from './hooks/usePollBackendIfcFiles';

function App() {
  const { baselineIfcFile, currentIfcFile, setDiff } = useAppStore();
  const [diffService, setDiffService] = useState<DiffService | null>(null);

  usePollBackendIfcFiles();

  useEffect(() => {
    const service = new DiffService();
    service.init().then(() => {
      setDiffService(service);
    });
  }, []);

  useEffect(() => {
    if (!diffService) return;
    if (!baselineIfcFile || !currentIfcFile) {
      setDiff(null);
      return;
    }

    let cancelled = false;
    diffService
      .compare(baselineIfcFile, currentIfcFile)
      .then((result) => {
        if (!cancelled) setDiff(result);
      })
      .catch((err) => {
        console.error("Diff computation failed", err);
        if (!cancelled) setDiff(null);
      });

    return () => {
      cancelled = true;
    };
  }, [baselineIfcFile, currentIfcFile, diffService, setDiff]);

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-900 overflow-hidden font-sans">
      <Toolbar />
      
      <div className="flex-1 flex w-full min-h-0 relative pt-16 border-t border-slate-700">
        <DiffSidebar />
        <div className="flex-1 relative min-w-0 min-h-0">
          <ViewerContainer modelFile={currentIfcFile} />
        </div>

        <PropertyPanel />
      </div>
    </div>
  );
}

export default App;
