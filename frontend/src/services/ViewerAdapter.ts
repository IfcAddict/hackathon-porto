import type { DiffResult } from "../store/useAppStore";

/** Return true to abandon the rest of a visual update (superseded by a newer one). */
export type VisualStaleCheck = () => boolean;

export interface ViewerAdapter {
  init(container: HTMLElement): Promise<void>;
  loadModel(file: File): Promise<void>;
  highlightElements(
    globalIds: string[],
    colorHex: string,
    removePrevious?: boolean,
    isStale?: VisualStaleCheck
  ): Promise<void>;
  clearHighlights(isStale?: VisualStaleCheck): Promise<void>;
  /** Fragment-level dim via highlight; null clears. Does not clear Highlighter diff styles. */
  setFragmentIsolate(
    focusGlobalIds: string[] | null,
    isStale?: VisualStaleCheck
  ): Promise<void>;
  /** Clear + isolate layer + re-apply diff overlay colors (full refresh). */
  applyDiffAndIsolate(
    diff: DiffResult | null,
    focusGlobalIds: string[] | null,
    isStale?: VisualStaleCheck
  ): Promise<void>;
  /** Re-paint Highlighter diff colors only (no clear). Use after setFragmentIsolate if needed. */
  reapplyDiffHighlighterLayer(
    diff: DiffResult,
    isStale?: VisualStaleCheck
  ): Promise<void>;
  onElementSelect(cb: (globalId: string | null) => void): void;
  getElementData(globalId: string): any;
  setMapping(globalIdToExpressId: Map<string, number>, expressIdToGlobalId: Map<number, string>): void;
  dispose(): void;
}
