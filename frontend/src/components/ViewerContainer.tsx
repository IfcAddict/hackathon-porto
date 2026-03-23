import React, { useEffect, useRef, useState } from "react";
import { OBCViewerAdapter } from "../services/OBCViewerAdapter";
import { ViewerAdapter } from "../services/ViewerAdapter";
import { useAppStore } from "../store/useAppStore";

function issueFocusGlobalIds(
  issueFocus: number | null,
  issues: { id: number; elementIds: string[] }[] | null,
  selectionGroup: string[] | null
): { ids: string[] | null; colorHex: string; isolateRest: boolean } {
  if (selectionGroup && selectionGroup.length > 0) {
    return { ids: selectionGroup, colorHex: "#3b82f6", isolateRest: true }; // blue, isolate element group
  }

  if (issueFocus !== null && issues) {
    const issue = issues.find(i => i.id === issueFocus);
    if (issue) {
      return { ids: issue.elementIds, colorHex: "#a855f7", isolateRest: true }; // violet, isolate elements
    }
  }
  
  if (issues && issues.length > 0) {
    const allIds = new Set<string>();
    for (const issue of issues) {
      for (const id of issue.elementIds) allIds.add(id);
    }
    return { ids: Array.from(allIds), colorHex: "#ef4444", isolateRest: false }; // red, do not isolate
  }
  
  return { ids: null, colorHex: "#a855f7", isolateRest: false };
}

interface ViewerContainerProps {
  modelFile: File | null;
}

export const ViewerContainer: React.FC<ViewerContainerProps> = ({ modelFile }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [adapter, setAdapter] = useState<ViewerAdapter | null>(null);
  const setSelection = useAppStore((s) => s.setSelection);
  const [loading, setLoading] = useState(false);

  const loadApplyGenRef = useRef(0);
  const isolateGenRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    let mounted = true;
    const viewerAdapter = new OBCViewerAdapter();

    async function setupViewer() {
      if (!containerRef.current) return;
      await viewerAdapter.init(containerRef.current);

      if (!mounted) {
        viewerAdapter.dispose();
        return;
      }

      viewerAdapter.onElementSelect((globalId) => {
        setSelection(globalId);
      });

      setAdapter(viewerAdapter);
    }

    void setupViewer();

    return () => {
      mounted = false;
      viewerAdapter.dispose();
      setAdapter(null);
    };
  }, [setSelection]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!adapter) return;

    if (!modelFile) {
      setLoading(false);
      void adapter.unloadModel();
      return;
    }

    const myGen = ++loadApplyGenRef.current;
    const stale = () => myGen !== loadApplyGenRef.current;

    const load = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        await adapter.loadModel(modelFile);
        if (stale()) return;
        const st = useAppStore.getState();
        const { ids, colorHex, isolateRest } = issueFocusGlobalIds(st.issueFocus, st.issues, st.selectionGroup);
        await adapter.refreshIsolate(ids, colorHex, isolateRest, stale);
      } catch (e: any) {
        console.error("Failed to load IFC", e);
        setErrorMsg(e?.message || String(e));
      } finally {
        if (!stale()) setLoading(false);
      }
    };
    void load();
    return () => {
      loadApplyGenRef.current++;
    };
  }, [adapter, modelFile]);

  const issueFocus = useAppStore((state) => state.issueFocus);
  const issues = useAppStore((state) => state.issues);
  const selectionGroup = useAppStore((state) => state.selectionGroup);

  useEffect(() => {
    if (!adapter) return;

    const myGen = ++isolateGenRef.current;
    const stale = () => myGen !== isolateGenRef.current;

    const { ids, colorHex, isolateRest } = issueFocusGlobalIds(issueFocus, issues, selectionGroup);

    void adapter.refreshIsolate(ids, colorHex, isolateRest, stale);
    return () => {
      isolateGenRef.current++;
    };
  }, [adapter, issueFocus, issues, selectionGroup]);

  return (
    <div className="relative w-full h-full bg-slate-900 overflow-hidden">
      <div className="absolute top-4 left-4 z-10 px-3 py-1 bg-slate-800/80 rounded text-slate-300 font-semibold text-sm border border-slate-700/50 backdrop-blur-sm pointer-events-none">
        Model
      </div>

      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <div className="mt-4 text-slate-200 font-medium">Loading {modelFile?.name}...</div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 text-center text-red-400">
          <div className="bg-slate-800 p-4 rounded max-w-lg border border-red-500/50">
            <h3 className="text-red-500 font-bold mb-2">Error during load</h3>
            <pre className="text-xs whitespace-pre-wrap">{errorMsg}</pre>
          </div>
        </div>
      )}

      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
