/** Return true to abandon the rest of a visual update (superseded by a newer one). */
export type VisualStaleCheck = () => boolean;

export interface ViewerAdapter {
  init(container: HTMLElement): Promise<void>;
  loadModel(file: File): Promise<void>;
  unloadModel(): Promise<void>;
  highlightElements(
    globalIds: string[],
    colorHex: string,
    removePrevious?: boolean,
    isStale?: VisualStaleCheck
  ): Promise<void>;
  clearHighlights(isStale?: VisualStaleCheck): Promise<void>;
  /** Dim non-focused geometry; null shows full model. */
  setFragmentIsolate(
    focusGlobalIds: string[] | null,
    isStale?: VisualStaleCheck
  ): Promise<void>;
  /** After load or focus change: clear selection highlights and apply isolate layer. */
  refreshIsolate(
    focusGlobalIds: string[] | null,
    colorHex?: string,
    isolateRest?: boolean,
    isStale?: VisualStaleCheck
  ): Promise<void>;
  onElementSelect(cb: (globalId: string | null) => void): void;
  getElementData(globalId: string): any;
  setMapping(globalIdToExpressId: Map<string, number>, expressIdToGlobalId: Map<number, string>): void;
  dispose(): void;
}
