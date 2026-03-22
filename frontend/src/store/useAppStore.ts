import { create } from 'zustand';

export interface DiffResult {
  added: string[];
  deleted: string[];
  modified: Record<string, {
    attributes?: Record<string, { old: any; new: any }>;
    properties?: Record<string, { old: any; new: any }>;
    placement?: { old: any; new: any };
    geometry?: { old: any; new: any };
  }>;
}

/** Sidebar “isolate in viewer” target for a chosen diff row. */
export interface DiffFocus {
  globalId: string;
}

interface AppState {
  /** Baseline IFC — parsed for diff only, not shown in the 3D viewer. */
  baselineIfcFile: File | null;
  /** Current/revised IFC — loaded in the single viewer; diff vs baseline drives highlights. */
  currentIfcFile: File | null;
  diff: DiffResult | null;
  diffFocus: DiffFocus | null;
  selection: string | null;

  setBaselineIfcFile: (file: File | null) => void;
  setCurrentIfcFile: (file: File | null) => void;
  setDiff: (diff: DiffResult | null) => void;
  setDiffFocus: (focus: DiffFocus | null) => void;
  setSelection: (globalId: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  baselineIfcFile: null,
  currentIfcFile: null,
  diff: null,
  diffFocus: null,
  selection: null,

  setBaselineIfcFile: (file) => set({ baselineIfcFile: file }),
  setCurrentIfcFile: (file) => set({ currentIfcFile: file }),
  setDiff: (diff) => set({ diff, diffFocus: null }),
  setDiffFocus: (focus) => set({ diffFocus: focus }),
  setSelection: (globalId) => set({ selection: globalId }),
}));
