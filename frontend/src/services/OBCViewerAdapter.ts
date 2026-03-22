import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as THREE from "three";
import type { ViewerAdapter, CameraParams } from "./ViewerAdapter";

import * as WEBIFC from "web-ifc";

export class OBCViewerAdapter implements ViewerAdapter {
  private components: OBC.Components;
  private container: HTMLElement | null = null;
  private cameraCallback: ((params: CameraParams | null) => void) | null = null;
  private selectCallback: ((globalId: string | null) => void) | null = null;

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

    // Explicitly initialize FragmentsManager before using anything
    const fragments = this.components.get(OBC.FragmentsManager);
    if (!fragments.initialized) {
        await fragments.init("");
    }

    world.scene.setup();
    world.camera.controls.setLookAt(12, 6, 8, 0, 0, -10);
    world.scene.three.background = new THREE.Color(0xf5f5f5);

    // Add a grid
    const grids = this.components.get(OBC.Grids);
    const grid = grids.create(world as any);

    const camera = world.camera;
    // Set controls update listener for syncing
    camera.controls.addEventListener("update", () => {
      if (this.cameraCallback && !this.isSyncing) {
        this.cameraCallback(this.getCamera());
      }
    });

    const highlighter = this.components.get(OBCF.Highlighter);
    highlighter.setup({ world: world as any });
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
    ifcLoader.settings.excludedCategories.add(WEBIFC.IFCSPACE);
    ifcLoader.settings.excludedCategories.add(WEBIFC.IFCOPENINGELEMENT);

    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);

    // Provide 3 args to load
    const model = await ifcLoader.load(data, false, file.name);

    // Add to world
    const worlds = this.components.get(OBC.Worlds);
    // @ts-ignore
    const world = Array.from(worlds.list.values())[0] as any;
    if (world) {
      world.scene.three.add(model);
    }

    // @ts-ignore
    this.modelId = model.id || model.uuid;
  }

  setMapping(globalIdToExpressId: Map<string, number>, expressIdToGlobalId: Map<number, string>) {
    this.globalIdToExpressId = globalIdToExpressId;
    this.expressIdToGlobalId = expressIdToGlobalId;
  }

  private isSyncing = false;

  setCamera(params: CameraParams) {
    const worlds = this.components.get(OBC.Worlds);
    // @ts-ignore
    const world = Array.from(worlds.list.values())[0] as any;
    if (!world) return;

    this.isSyncing = true;
    const camera = world.camera;
    camera.controls.setLookAt(
      params.position.x, params.position.y, params.position.z,
      params.target.x, params.target.y, params.target.z,
      false
    ).then(() => {
       this.isSyncing = false;
    });
    // Fallback if it's not a promise
    this.isSyncing = false;
  }

  getCamera(): CameraParams {
    const worlds = this.components.get(OBC.Worlds);
    // @ts-ignore
    const world = Array.from(worlds.list.values())[0] as any;
    if (!world) return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 };

    const camera = world.camera;
    const pos = new THREE.Vector3();
    const target = new THREE.Vector3();
    camera.controls.getPosition(pos);
    camera.controls.getTarget(target);

    return {
      position: { x: pos.x, y: pos.y, z: pos.z },
      target: { x: target.x, y: target.y, z: target.z },
      zoom: 1,
    };
  }

  onCameraChange(cb: (params: CameraParams) => void) {
    this.cameraCallback = cb as any;
  }

  highlightElements(globalIds: string[], colorHex: string) {
    try {
      const fragments = this.components.get(OBC.FragmentsManager);
      if (!fragments.initialized) return;

      const expressIds = globalIds.map(g => this.globalIdToExpressId.get(g)).filter(id => id !== undefined) as number[];
      if (expressIds.length === 0) return;

      const highlighter = this.components.get(OBCF.Highlighter);
      // Use highlighter... (omitting actual implementation for POC)
    } catch(e) {
      // Ignorar
    }
  }

  clearHighlights() {
    try {
      const fragments = this.components.get(OBC.FragmentsManager);
      if (!fragments.initialized) return;
      const highlighter = this.components.get(OBCF.Highlighter);
      highlighter.clear();
    } catch(e) {
      // Ignorar si no está inicializado
    }
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
