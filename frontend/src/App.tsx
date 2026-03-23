import React, { useEffect, useState } from "react";
import { Toolbar } from "./components/Toolbar";
import { ViewerContainer } from "./components/ViewerContainer";
import { PropertyPanel } from "./components/PropertyPanel";
import { IssuesSidebar } from "./components/IssuesSidebar";
import { useAppStore } from "./store/useAppStore";
import { usePollBackendIfcFiles } from "./hooks/usePollBackendIfcFiles";
import { DiffService } from "./services/DiffService";

function App() {
  const { baselineIfcFile, ifcFile, setDiffAndProperties } = useAppStore();
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
    if (!ifcFile) {
      setDiffAndProperties(null, null);
      return;
    }

    let cancelled = false;
    diffService
      .compare(baselineIfcFile, ifcFile)
      .then(({ diff, currentProperties }) => {
        if (!cancelled) setDiffAndProperties(diff, currentProperties);
      })
      .catch((err) => {
        console.error("Diff/Properties computation failed", err);
        if (!cancelled) setDiffAndProperties(null, null);
      });

    return () => {
      cancelled = true;
    };
  }, [baselineIfcFile, ifcFile, diffService, setDiffAndProperties]);

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-900 overflow-hidden font-sans">
      <Toolbar />

      <div className="flex-1 flex w-full min-h-0 relative pt-16 border-t border-slate-700">
        <IssuesSidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          <div className="flex-1 relative min-h-0">
            <ViewerContainer modelFile={ifcFile} />
          </div>
          <PropertyPanel />
        </div>
      </div>
    </div>
  );
}

export default App;
