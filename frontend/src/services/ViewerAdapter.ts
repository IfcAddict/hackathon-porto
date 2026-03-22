export interface CameraParams {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  zoom: number;
}

export interface ViewerAdapter {
  init(container: HTMLElement): Promise<void>;
  loadModel(file: File): Promise<void>;
  setCamera(params: CameraParams): void;
  getCamera(): CameraParams;
  onCameraChange(cb: (params: CameraParams) => void): void;
  highlightElements(globalIds: string[], colorHex: string): void;
  clearHighlights(): void;
  onElementSelect(cb: (globalId: string | null) => void): void;
  getElementData(globalId: string): any;
  setMapping(globalIdToExpressId: Map<string, number>, expressIdToGlobalId: Map<number, string>): void;
  dispose(): void;
}
