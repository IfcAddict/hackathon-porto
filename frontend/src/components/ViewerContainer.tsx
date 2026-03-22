import React, { useEffect, useRef, useState } from "react";
import { OBCViewerAdapter } from "../services/OBCViewerAdapter";
import { CameraParams, ViewerAdapter } from "../services/ViewerAdapter";
import { useAppStore } from "../store/useAppStore";

interface ViewerContainerProps {
  modelFile: File | null;
  viewerId: "old" | "new";
}

export const ViewerContainer: React.FC<ViewerContainerProps> = ({ modelFile, viewerId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [adapter, setAdapter] = useState<ViewerAdapter | null>(null);
  const { setSelection, syncEnabled, setSyncEnabled } = useAppStore();
  const [loading, setLoading] = useState(false);

  const initialized = useRef(false);

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

      viewerAdapter.onCameraChange((params) => {
        if (syncEnabled) {
           // trigger globally
           window.dispatchEvent(new CustomEvent("sync-camera", { 
             detail: { source: viewerId, params } 
           }));
        }
      });

      setAdapter(viewerAdapter);
    }
    
    setupViewer();

    return () => {
      mounted = false;
      viewerAdapter.dispose();
    };
  }, []);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Listen for sync events
  useEffect(() => {
    if (!adapter || !syncEnabled) return;

    const handleSync = (e: Event) => {
      const ev = e as CustomEvent;
      if (ev.detail.source !== viewerId && ev.detail.params) {
        adapter.setCamera(ev.detail.params as CameraParams);
      }
    };

    window.addEventListener("sync-camera", handleSync);
    return () => window.removeEventListener("sync-camera", handleSync);
  }, [adapter, syncEnabled, viewerId]);

  // Load model when file changes
  useEffect(() => {
    if (!adapter || !modelFile) return;

    const load = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        await adapter.loadModel(modelFile);
      } catch (e: any) {
        console.error("Failed to load IFC", e);
        setErrorMsg(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [adapter, modelFile]);

  // Handle highlights when diff is active (simplified)
  const diff = useAppStore((state) => state.diff);
  useEffect(() => {
    if (!adapter || !diff) return;

    adapter.clearHighlights();

    if (viewerId === "old") {
      adapter.highlightElements(diff.deleted, "#EF4444"); // Red
      adapter.highlightElements(Object.keys(diff.modified), "#F59E0B"); // Amber
    } else {
      adapter.highlightElements(diff.added, "#10B981"); // Green
      adapter.highlightElements(Object.keys(diff.modified), "#F59E0B"); // Amber
    }
  }, [adapter, diff, viewerId]);

  return (
    <div className="relative w-full h-full bg-slate-900 overflow-hidden">
      <div className="absolute top-4 left-4 z-10 px-3 py-1 bg-slate-800/80 rounded text-slate-300 font-semibold text-sm border border-slate-700/50 backdrop-blur-sm pointer-events-none">
        {viewerId === "old" ? "Old Version" : "New Version"}
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
