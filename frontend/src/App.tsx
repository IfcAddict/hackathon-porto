import React, { useEffect, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { ViewerContainer } from './components/ViewerContainer';
import { PropertyPanel } from './components/PropertyPanel';
import { useAppStore } from './store/useAppStore';
import { DiffService } from './services/DiffService';

function App() {
  const { oldModelFile, newModelFile, setDiff } = useAppStore();
  const [diffService, setDiffService] = useState<DiffService | null>(null);

  useEffect(() => {
    const service = new DiffService();
    service.init().then(() => {
      setDiffService(service);
    });
    
    // Auto load test files for debugging
    fetch('/test.ifc').then(r => r.blob()).then(blob => {
       const file = new File([blob], 'test.ifc');
       useAppStore.getState().setOldModelFile(file);
    }).catch(console.error);

  }, []);

  useEffect(() => {
    if (diffService && oldModelFile && newModelFile) {
      console.log("Computing diff...");
      diffService.compare(oldModelFile, newModelFile)
        .then((result) => setDiff(result))
        .catch(err => console.error("Diff computation failed", err));
    }
  }, [oldModelFile, newModelFile, diffService, setDiff]);

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-900 overflow-hidden font-sans">
      <Toolbar />
      
      <div className="flex-1 flex w-full relative pt-16 border-t border-slate-700">
        {/* Left pane - Old version */}
        <div className="flex-1 relative border-r border-slate-700">
          <ViewerContainer viewerId="old" modelFile={oldModelFile} />
        </div>
        
        {/* Right pane - New version */}
        <div className="flex-1 relative">
          <ViewerContainer viewerId="new" modelFile={newModelFile} />
        </div>

        {/* Global floating UI */}
        <PropertyPanel />
      </div>
    </div>
  );
}

export default App;
