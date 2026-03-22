import React, { useEffect, useRef, useState } from "react";
import { OBCViewerAdapter } from "../services/OBCViewerAdapter";
import { ViewerAdapter } from "../services/ViewerAdapter";
import { useAppStore, type DiffResult } from "../store/useAppStore";

function focusIsolateIds(focus: { globalId: string } | null): string[] | null {
  if (!focus) return null;
  return [focus.globalId];
}

interface ViewerContainerProps {
  modelFile: File | null;
}

export const ViewerContainer: React.FC<ViewerContainerProps> = ({ modelFile }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [adapter, setAdapter] = useState<ViewerAdapter | null>(null);
  const setSelection = useAppStore((s) => s.setSelection);
  const [loading, setLoading] = useState(false);

  const initialized = useRef(false);
  /** Post-load apply chain only — must not share a counter with diff/focus or the diff effect invalidates load. */
  const loadApplyGenRef = useRef(0);
  /** Diff / isolate / focus rapid-click guard (independent from load). */
  const diffFocusGenRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;
    if (initialized.current) return;
    initialized.current = true;

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

    setupViewer();

    return () => {
      mounted = false;
      viewerAdapter.dispose();
    };
  }, [setSelection]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load model when file changes
  useEffect(() => {
    if (!adapter || !modelFile) return;

    const myGen = ++loadApplyGenRef.current;
    const stale = () => myGen !== loadApplyGenRef.current;

    const load = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        await adapter.loadModel(modelFile);
        if (stale()) return;
        const st = useAppStore.getState();
        await adapter.applyDiffAndIsolate(
          st.diff,
          focusIsolateIds(st.diffFocus),
          stale
        );
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

  const diff = useAppStore((state) => state.diff);
  const diffFocus = useAppStore((state) => state.diffFocus);

  const prevDiffRef = useRef<DiffResult | null | undefined>(undefined);

  useEffect(() => {
    prevDiffRef.current = undefined;
  }, [adapter]);

  useEffect(() => {
    if (!adapter) return;

    const myGen = ++diffFocusGenRef.current;
    const stale = () => myGen !== diffFocusGenRef.current;

    const prev = prevDiffRef.current;
    const diffChanged = prev !== diff;
    const focusIds = focusIsolateIds(diffFocus);

    const run = async () => {
      if (diffChanged) {
        await adapter.applyDiffAndIsolate(diff, focusIds, stale);
      } else {
        await adapter.setFragmentIsolate(focusIds, stale);
        if (diff) await adapter.reapplyDiffHighlighterLayer(diff, stale);
      }
      if (!stale()) prevDiffRef.current = diff;
    };

    void run();
    return () => {
      diffFocusGenRef.current++;
    };
  }, [adapter, diff, diffFocus]);

  return (
    <div className="relative w-full h-full bg-slate-900 overflow-hidden">
      <div className="absolute top-4 left-4 z-10 px-3 py-1 bg-slate-800/80 rounded text-slate-300 font-semibold text-sm border border-slate-700/50 backdrop-blur-sm pointer-events-none">
        Current model
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
