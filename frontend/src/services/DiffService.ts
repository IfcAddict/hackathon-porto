import * as WebIFC from "web-ifc";
import { DiffResult } from "../store/useAppStore";

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const walk = (x: unknown): unknown => {
    if (x === null || typeof x === "undefined") return x;
    if (typeof x === "bigint") return x.toString();
    if (typeof x !== "object") return x;
    if (x instanceof Uint8Array) return `Uint8Array(${x.length})`;
    const obj = x as object;
    if (seen.has(obj)) return "[Circular]";
    seen.add(obj);
    if (Array.isArray(x)) return x.map(walk);
    const rec = x as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = walk(rec[k]);
    return out;
  };

  return JSON.stringify(walk(value));
}

function diffIfcLines(
  oldProps: Record<string, unknown>,
  newProps: Record<string, unknown>
): Record<string, { old: unknown; new: unknown }> | null {
  const keys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);
  const attrs: Record<string, { old: unknown; new: unknown }> = {};

  for (const k of keys) {
    if (k === "expressID") continue;
    const os = stableStringify(oldProps[k]);
    const ns = stableStringify(newProps[k]);
    if (os !== ns) attrs[k] = { old: oldProps[k], new: newProps[k] };
  }

  return Object.keys(attrs).length ? attrs : null;
}

export class DiffService {
  private ifcAPI: WebIFC.IfcAPI;

  constructor() {
    this.ifcAPI = new WebIFC.IfcAPI();
    this.ifcAPI.SetWasmPath("/");
  }

  async init() {
    await this.ifcAPI.Init();
  }

  async compare(
    baselineFile: File | null,
    currentFile: File | null
  ): Promise<DiffResult> {
    const result: DiffResult = {
      added: [],
      deleted: [],
      modified: {},
    };

    if (!baselineFile || !currentFile) return result;

    const oldData = await this.readModel(baselineFile);
    const newData = await this.readModel(currentFile);

    const oldIds = new Set(Object.keys(oldData.elements));
    const newIds = new Set(Object.keys(newData.elements));

    oldIds.forEach((id) => {
      if (!newIds.has(id)) result.deleted.push(id);
    });

    newIds.forEach((id) => {
      if (!oldIds.has(id)) result.added.push(id);
    });

    oldIds.forEach((id) => {
      if (!newIds.has(id)) return;
      const oldProps = oldData.elements[id].properties as Record<string, unknown>;
      const newProps = newData.elements[id].properties as Record<string, unknown>;
      const attrDiff = diffIfcLines(oldProps, newProps);
      if (attrDiff) {
        result.modified[id] = { attributes: attrDiff };
      }
    });

    return result;
  }

  /**
   * Collect express IDs for entities we diff by GlobalId.
   * IFCPRODUCT alone misses type definitions (e.g. IfcStairType, IfcWallType), which
   * sit under IfcTypeProduct, not IfcProduct — so PredefinedType changes were invisible.
   */
  private collectExpressIdsForDiff(modelID: number): Set<number> {
    const ids = new Set<number>();
    const roots = [
      WebIFC.IFCPRODUCT,
      WebIFC.IFCTYPEPRODUCT,
    ] as const;
    for (const typeCode of roots) {
      const vec = this.ifcAPI.GetLineIDsWithType(modelID, typeCode, true);
      const n = vec.size();
      for (let i = 0; i < n; i++) ids.add(vec.get(i));
    }
    return ids;
  }

  private async readModel(file: File) {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const modelID = this.ifcAPI.OpenModel(data, {
      COORDINATE_TO_ORIGIN: false,
    });

    const elements = {} as Record<
      string,
      { properties: Record<string, unknown>; expressId: number }
    >;

    const globalIdToExpressId = new Map<string, number>();
    const expressIdToGlobalId = new Map<number, string>();

    const expressIds = this.collectExpressIdsForDiff(modelID);
    for (const expressId of expressIds) {
      const props = this.ifcAPI.GetLine(modelID, expressId) as Record<
        string,
        unknown
      >;
      const gid = props?.GlobalId as { value?: string } | undefined;
      if (gid?.value) {
        const globalId = gid.value;
        elements[globalId] = { properties: props, expressId };
        globalIdToExpressId.set(globalId, expressId);
        expressIdToGlobalId.set(expressId, globalId);
      }
    }

    this.ifcAPI.CloseModel(modelID);

    return { elements, globalIdToExpressId, expressIdToGlobalId };
  }
}
