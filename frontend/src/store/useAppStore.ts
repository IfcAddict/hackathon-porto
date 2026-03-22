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

interface AppState {
  oldModelFile: File | null;
  newModelFile: File | null;
  diff: DiffResult | null;
  selection: string | null;
  syncEnabled: boolean;
  
  setOldModelFile: (file: File | null) => void;
  setNewModelFile: (file: File | null) => void;
  setDiff: (diff: DiffResult | null) => void;
  setSelection: (globalId: string | null) => void;
  setSyncEnabled: (enabled: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  oldModelFile: null,
  newModelFile: null,
  diff: null,
  selection: null,
  syncEnabled: true,

  setOldModelFile: (file) => set({ oldModelFile: file }),
  setNewModelFile: (file) => set({ newModelFile: file }),
  setDiff: (diff) => set({ diff }),
  setSelection: (globalId) => set({ selection: globalId }),
  setSyncEnabled: (enabled) => set({ syncEnabled: enabled }),
}));
