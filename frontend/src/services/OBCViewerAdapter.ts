import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";
import fragmentsWorkerUrl from "@thatopen/fragments/worker?url";
import type { ViewerAdapter, VisualStaleCheck } from "./ViewerAdapter";

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
  private disposed = false;

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
  private modelMap = new Map<string, any>();

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

    const grids = this.components.get(OBC.Grids);
    grids.create(world as any);

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
    if (this.disposed) return;

    const fragments = this.components.get(OBC.FragmentsManager);
    if (!fragments.initialized) {
      fragments.init(fragmentsWorkerUrl);
    }

    const ifcLoader = this.components.get(OBC.IfcLoader);
    await ifcLoader.setup({
      wasm: {
        path: "/",
        absolute: true,
      },
      webIfc: {
        COORDINATE_TO_ORIGIN: false,
      },
      autoSetWasm: false,
    });

    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);

    const model = await ifcLoader.load(data, false, file.name);

    const worlds = this.components.get(OBC.Worlds);
    // @ts-ignore
    const world = Array.from(worlds.list.values())[0] as any;
    if (world) {
      const modelObject = (model as any).object || model;
      world.scene.three.add(modelObject);

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
    const styleKey = `hl-${colorHex.replace(/^#/, "")}`;
    highlighter.styles.set(styleKey, {
      color: new THREE.Color(colorHex),
      renderedFaces: FRAGS.RenderedFaces.TWO,
      opacity: 0.9,
      transparent: false,
    });

    const modelIdMap = await fragments.guidsToModelIdMap(globalIds);
    if (!modelIdMap || Object.keys(modelIdMap).length === 0) return;

    await highlighter.highlightByID(styleKey, modelIdMap, removePrevious, false);
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

  async setFragmentIsolate(globalIds: string[] | null, isStale?: VisualStaleCheck) {
    return this.enqueueVisual(async () => {
      if (isStale?.()) return;
      await this.setFragmentIsolateImpl(globalIds);
    });
  }

  private async setFragmentIsolateImpl(globalIds: string[] | null) {
    const fragments = this.components.get(OBC.FragmentsManager);
    const hider = this.components.get(OBC.Hider);
    
    if (!fragments.initialized) return;

    // Reset everything to opaque and visible
    await fragments.resetHighlight(undefined);
    await hider.set(true);

    // If there's no list of IDs to focus on, don't hide anything
    if (!globalIds || globalIds.length === 0) {
      return;
    }

    const focusMap = await fragments.guidsToModelIdMap(globalIds);
    if (!focusMap || Object.keys(focusMap).length === 0) return;

    // Isolate the focused elements (hides everything else completely)
    await hider.isolate(focusMap);
  }

  async refreshIsolate(focusGlobalIds: string[] | null, colorHex = "#a855f7", isolateRest = true, isStale?: VisualStaleCheck) {
    return this.enqueueVisual(async () => {
      if (isStale?.()) return;
      await this.clearHighlightsImpl();
      await this.setFragmentIsolateImpl(isolateRest ? focusGlobalIds : null);
      if (focusGlobalIds && focusGlobalIds.length > 0) {
        await this.highlightElementsImpl(focusGlobalIds, colorHex, true);
      }
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
    this.disposed = true;
    try {
      this.components.dispose();
    } catch (e) {
      // suppress
    }
  }
}
