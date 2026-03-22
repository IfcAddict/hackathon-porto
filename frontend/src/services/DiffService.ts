import * as WebIFC from "web-ifc";
import { DiffResult } from "../store/useAppStore";

export class DiffService {
  private ifcAPI: WebIFC.IfcAPI;

  constructor() {
    this.ifcAPI = new WebIFC.IfcAPI();
    this.ifcAPI.SetWasmPath("/");
  }

  async init() {
    await this.ifcAPI.Init();
  }

  async compare(oldFile: File | null, newFile: File | null): Promise<DiffResult & { oldMapping: any, newMapping: any }> {
    const result: DiffResult & { oldMapping: any, newMapping: any } = {
      added: [],
      deleted: [],
      modified: {},
      oldMapping: { extToGlb: new Map(), glbToExt: new Map() },
      newMapping: { extToGlb: new Map(), glbToExt: new Map() }
    };

    if (!oldFile || !newFile) return result;

    const oldData = await this.readModel(oldFile);
    const newData = await this.readModel(newFile);

    result.oldMapping = { extToGlb: oldData.expressIdToGlobalId, glbToExt: oldData.globalIdToExpressId };
    result.newMapping = { extToGlb: newData.expressIdToGlobalId, glbToExt: newData.globalIdToExpressId };

    const oldIds = new Set(Object.keys(oldData.elements));
    const newIds = new Set(Object.keys(newData.elements));

    // Deleted
    oldIds.forEach(id => {
      if (!newIds.has(id)) result.deleted.push(id);
    });

    // Added
    newIds.forEach(id => {
      if (!oldIds.has(id)) result.added.push(id);
    });

    // Modified (simple property diff)
    oldIds.forEach(id => {
      if (newIds.has(id)) {
        const oldProps = oldData.elements[id].properties;
        const newProps = newData.elements[id].properties;
        let diffs: any = null;

        // E.g., comparing Name, Description, ObjectType
        ["Name", "Description", "ObjectType"].forEach(key => {
          const oldVal = oldProps[key]?.value;
          const newVal = newProps[key]?.value;
          if (oldVal !== newVal) {
            if (!diffs) diffs = {};
            diffs[key] = { old: oldVal, new: newVal };
          }
        });

        if (diffs) {
          result.modified[id] = { properties: diffs };
        }
      }
    });

    return result;
  }

  private async readModel(file: File) {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const modelID = this.ifcAPI.OpenModel(data, { COORDINATE_TO_ORIGIN: false });
    
    const elements = {} as Record<string, { properties: any, expressId: number }>;
    const rootNodes = this.ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCPRODUCT);
    const sz = rootNodes.size();

    const globalIdToExpressId = new Map<string, number>();
    const expressIdToGlobalId = new Map<number, string>();

    for (let i = 0; i < sz; i++) {
        const expressId = rootNodes.get(i);
        const props = this.ifcAPI.GetLine(modelID, expressId);
        if (props && props.GlobalId && props.GlobalId.value) {
            const globalId = props.GlobalId.value;
            elements[globalId] = { properties: props, expressId };
            globalIdToExpressId.set(globalId, expressId);
            expressIdToGlobalId.set(expressId, globalId);
        }
    }

    this.ifcAPI.CloseModel(modelID);

    return { elements, globalIdToExpressId, expressIdToGlobalId };
  }
}
