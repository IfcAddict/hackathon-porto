import { create } from "zustand";

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

/** One validation / IDS task from `*_issues.json` (GlobalIds in `elementIds`). */
export interface IfcIssue {
  id: number;
  title: string;
  description: string;
  elementIds: string[];
}

interface AppState {
  /** Baseline IFC (from `backend/rsc` via poll) for diff computation. */
  baselineIfcFile: File | null;
  /** IFC shown in the 3D viewer (e.g. from `backend/output` via poll or manual upload). */
  ifcFile: File | null;
  /** Computed diff between baseline and ifcFile */
  diff: DiffResult | null;
  /** Extracted properties for all elements in ifcFile */
  properties: Record<string, any> | null;
  
  /** Index into `issues`; isolates all `elementIds` for that task in the viewer. */
  issueFocus: number | null;
  issues: IfcIssue[] | null;
  /** GlobalId → issue ids that reference this element. */
  issueIdsByGlobalId: Record<string, number[]>;
  selection: string | null;

  setBaselineIfcFile: (file: File | null) => void;
  setIfcFile: (file: File | null) => void;
  setDiffAndProperties: (diff: DiffResult | null, properties: Record<string, any> | null) => void;
  setIssueFocus: (issueIndex: number | null) => void;
  setIssues: (issues: IfcIssue[] | null) => void;
  setSelection: (globalId: string | null) => void;
}

function buildIssueIndex(issues: IfcIssue[] | null): Record<string, number[]> {
  if (!issues) return {};
  const map: Record<string, number[]> = {};
  for (const issue of issues) {
    for (const gid of issue.elementIds) {
      const list = map[gid];
      if (list) {
        if (!list.includes(issue.id)) list.push(issue.id);
      } else map[gid] = [issue.id];
    }
  }
  return map;
}

export const useAppStore = create<AppState>((set) => ({
  baselineIfcFile: null,
  ifcFile: null,
  diff: null,
  properties: null,
  issueFocus: null,
  issues: null,
  issueIdsByGlobalId: {},
  selection: null,

  setBaselineIfcFile: (file) => set({ baselineIfcFile: file }),
  setIfcFile: (file) => set({ ifcFile: file }),
  setDiffAndProperties: (diff, properties) => set({ diff, properties }),
  setIssueFocus: (issueIndex) => set({ issueFocus: issueIndex }),
  setIssues: (issues) =>
    set({
      issues,
      issueIdsByGlobalId: buildIssueIndex(issues),
      issueFocus: null,
    }),
  setSelection: (globalId) => set({ selection: globalId }),
}));
