import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";
import fragmentsWorkerUrl from "@thatopen/fragments/worker?url";
import type { ViewerAdapter, VisualStaleCheck } from "./ViewerAdapter";
import type { DiffResult } from "../store/useAppStore";
import { DIFF_COLORS } from "../config/diffVisual";

import * as WEBIFC from "web-ifc";

/** Applied to all geometry in the fragment model; focused items are reset afterward. */
const FRAGMENT_DIM_STYLE: FRAGS.MaterialDefinition = {
  color: new THREE.Color(0x94a3b8),
  opacity: 0.12,
  transparent: true,
  renderedFaces: FRAGS.RenderedFaces.TWO,
  depthWrite: false,
};

export class OBCViewerAdapter implements ViewerAdapter {
  private components: OBC.Components;
  private container: HTMLElement | null = null;
  private selectCallback: ((globalId: string | null) => void) | null = null;

  /**
   * One fragment/highlighter mutation chain at a time. Prevents interleaving
   * (e.g. load vs diff, or rapid clicks) which left the scene dimmed without
   * focus reset. Skipped jobs only consult isStale before any GPU writes.
   */
  private visualTail: Promise<void> = Promise.resolve();

  private enqueueVisual<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.visualTail.then(() => fn());
    this.visualTail = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  private globalIdToExpressId = new Map<string, number>();
  private expressIdToGlobalId = new Map<number, string>();
  private modelMap = new Map<string, any>(); // cache of properties

  private modelId: string | null = null;
  private customHighlightMaterials: Record<string, THREE.MeshBasicMaterial> = {};

  constructor() {
    this.components = new OBC.Components();
  }

  async init(container: HTMLElement) {
    this.container = container;

    const worlds = this.components.get(OBC.Worlds);
    const world = worlds.create<
      OBC.SimpleScene,
      OBC.OrthoPerspectiveCamera,
      OBC.SimpleRenderer
    >();

    world.name = "Main";
    world.scene = new OBC.SimpleScene(this.components);
    world.renderer = new OBC.SimpleRenderer(this.components, container);
    world.camera = new OBC.OrthoPerspectiveCamera(this.components);

    this.components.init();

    const fragments = this.components.get(OBC.FragmentsManager);
    if (!fragments.initialized) {
      fragments.init(fragmentsWorkerUrl);
    }

    world.scene.setup();
    world.camera.controls.setLookAt(12, 6, 8, 0, 0, -10);
    world.scene.three.background = new THREE.Color(0xf5f5f5);

    // Add a grid
    const grids = this.components.get(OBC.Grids);
    const grid = grids.create(world as any);

    const highlighter = this.components.get(OBCF.Highlighter);
    highlighter.setup({ world: world as any });

    const selectEvents = highlighter.events.select;
    if (selectEvents?.onHighlight) {
      selectEvents.onHighlight.add(async (modelIdMap) => {
        if (!this.selectCallback) return;
        const fragments = this.components.get(OBC.FragmentsManager);
        if (!fragments.initialized) return;
        const guids = await fragments.modelIdMapToGuids(modelIdMap);
        this.selectCallback(guids[0] ?? null);
      });
    }
    if (selectEvents?.onClear) {
      selectEvents.onClear.add(() => {
        this.selectCallback?.(null);
      });
    }
  }

  async loadModel(file: File) {
    const ifcLoader = this.components.get(OBC.IfcLoader);
    await ifcLoader.setup({
      wasm: {
        path: "/",
        absolute: true
      },
      webIfc: {
        COORDINATE_TO_ORIGIN: false
      },
      autoSetWasm: false
    });

    // Exclude basic non-visual spaces and openings to avoid zero length errors
    // ifcLoader.settings.excludedCategories.add(WEBIFC.IFCSPACE);
    // ifcLoader.settings.excludedCategories.add(WEBIFC.IFCOPENINGELEMENT);

    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);

    // Provide 3 args to load
    const model = await ifcLoader.load(data, false, file.name);

    // Add to world
    const worlds = this.components.get(OBC.Worlds);
    // @ts-ignore
    const world = Array.from(worlds.list.values())[0] as any;
    if (world) {
      // In @thatopen/components v3, IfcLoader returns a FragmentsModel with an object property.
      const modelObject = (model as any).object || model;
      world.scene.three.add(modelObject);
      
      // Attempt to fit the camera to the loaded model, which should also trigger a render update
      if (world.camera.fit) {
          await world.camera.fit([modelObject]);
      }
    }

    // @ts-ignore
    this.modelId = model.id || model.uuid;
  }

  setMapping(globalIdToExpressId: Map<string, number>, expressIdToGlobalId: Map<number, string>) {
    this.globalIdToExpressId = globalIdToExpressId;
    this.expressIdToGlobalId = expressIdToGlobalId;
  }

  async highlightElements(
    globalIds: string[],
    colorHex: string,
    removePrevious = true,
    isStale?: VisualStaleCheck
  ) {
    return this.enqueueVisual(async () => {
      if (isStale?.()) return;
      await this.highlightElementsImpl(globalIds, colorHex, removePrevious);
    });
  }

  private async highlightElementsImpl(
    globalIds: string[],
    colorHex: string,
    removePrevious = true
  ) {
    const fragments = this.components.get(OBC.FragmentsManager);
    if (!fragments.initialized) return;
    if (globalIds.length === 0) return;

    const highlighter = this.components.get(OBCF.Highlighter);
    const styleKey = `diff-${colorHex.replace(/^#/, "")}`;
    highlighter.styles.set(styleKey, {
      color: new THREE.Color(colorHex),
      renderedFaces: FRAGS.RenderedFaces.TWO,
      opacity: 0.9,
      transparent: false,
    });

    const modelIdMap = await fragments.guidsToModelIdMap(globalIds);
    if (!modelIdMap || Object.keys(modelIdMap).length === 0) return;

    await highlighter.highlightByID(
      styleKey,
      modelIdMap,
      removePrevious,
      false
    );
  }

  async clearHighlights(isStale?: VisualStaleCheck) {
    return this.enqueueVisual(async () => {
      if (isStale?.()) return;
      await this.clearHighlightsImpl();
    });
  }

  private async clearHighlightsImpl() {
    const fragments = this.components.get(OBC.FragmentsManager);
    if (!fragments.initialized) return;
    const highlighter = this.components.get(OBCF.Highlighter);
    await highlighter.clear();
  }

  /**
   * Dims all loaded fragment geometry, then restores full shading for the given GlobalIds.
   * Uses FragmentsManager.highlight (not mesh.setOpacity), which works with the BIM renderer.
   * Does not modify Highlighter — call before re-applying diff highlight styles.
   */
  async setFragmentIsolate(
    globalIds: string[] | null,
    isStale?: VisualStaleCheck
  ) {
    return this.enqueueVisual(async () => {
      if (isStale?.()) return;
      await this.setFragmentIsolateImpl(globalIds);
    });
  }

  private async setFragmentIsolateImpl(globalIds: string[] | null) {
    const fragments = this.components.get(OBC.FragmentsManager);
    if (!fragments.initialized) return;

    await fragments.resetHighlight(undefined);

    if (!globalIds || globalIds.length === 0) return;

    const focusMap = await fragments.guidsToModelIdMap(globalIds);
    if (!focusMap || Object.keys(focusMap).length === 0) return;

    await fragments.highlight(FRAGMENT_DIM_STYLE, undefined);

    await fragments.resetHighlight(focusMap);
  }

  async reapplyDiffHighlighterLayer(d: DiffResult, isStale?: VisualStaleCheck) {
    return this.enqueueVisual(async () => {
      if (isStale?.()) return;
      await this.reapplyDiffHighlighterLayerImpl(d);
    });
  }

  /** Current IFC in the viewer: highlight added + modified. Deleted GUIDs are not in this file. */
  private async reapplyDiffHighlighterLayerImpl(d: DiffResult) {
    const modifiedIds = Object.keys(d.modified);
    await this.highlightElementsImpl(d.added, DIFF_COLORS.added, true);
    await this.highlightElementsImpl(modifiedIds, DIFF_COLORS.modified, false);
  }

  async applyDiffAndIsolate(
    d: DiffResult | null,
    focusGlobalIds: string[] | null,
    isStale?: VisualStaleCheck
  ) {
    return this.enqueueVisual(async () => {
      if (isStale?.()) return;
      await this.clearHighlightsImpl();
      await this.setFragmentIsolateImpl(focusGlobalIds);
      if (!d) return;
      await this.reapplyDiffHighlighterLayerImpl(d);
    });
  }

  onElementSelect(cb: (globalId: string | null) => void) {
    this.selectCallback = cb;
  }

  getElementData(globalId: string) {
    const expressId = this.globalIdToExpressId.get(globalId);
    if (!expressId) return null;
    return this.modelMap.get(globalId) || null;
  }

  dispose() {
    try {
      this.components.dispose();
    } catch(e) {
      // suppress
    }
  }
}
