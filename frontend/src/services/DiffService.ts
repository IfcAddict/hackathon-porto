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
  ): Promise<{ diff: DiffResult | null; currentProperties: Record<string, any> }> {
    const result: DiffResult = {
      added: [],
      deleted: [],
      modified: {},
    };

    let currentProperties: Record<string, any> = {};

    if (!currentFile) return { diff: null, currentProperties };

    const newData = await this.readModel(currentFile);
    for (const [gid, val] of Object.entries(newData.elements)) {
      currentProperties[gid] = val.properties;
    }

    if (!baselineFile) {
      return { diff: null, currentProperties };
    }

    const oldData = await this.readModel(baselineFile);

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

    return { diff: result, currentProperties };
  }

  private collectExpressIdsForDiff(modelID: number): Set<number> {
    const ids = new Set<number>();
    const roots = [
      WebIFC.IFCPRODUCT,
      WebIFC.IFCTYPEPRODUCT,
      WebIFC.IFCRELDEFINESBYPROPERTIES,
      WebIFC.IFCPROPERTYSET
    ] as const;
    for (const typeCode of roots) {
      try {
        const vec = this.ifcAPI.GetLineIDsWithType(modelID, typeCode, true);
        const n = vec.size();
        for (let i = 0; i < n; i++) ids.add(vec.get(i));
      } catch (e) {
        // ignore if type doesn't exist
      }
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

    // Resolve Types
    const typeByElement = new Map<number, number>();
    try {
      const rels = this.ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYTYPE, true);
      for (let i = 0; i < rels.size(); i++) {
        try {
          const rel = this.ifcAPI.GetLine(modelID, rels.get(i));
          const typeId = rel?.RelatingType?.value;
          if (typeId && Array.isArray(rel.RelatedObjects)) {
            for (const obj of rel.RelatedObjects) {
              if (obj?.value) typeByElement.set(obj.value, typeId);
            }
          }
        } catch (e) {}
      }
    } catch(e) {}

    // Resolve Property Sets
    const psetsByTarget = new Map<number, Record<string, any>[]>();
    try {
      const rels = this.ifcAPI.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES, true);
      for (let i = 0; i < rels.size(); i++) {
        try {
          const rel = this.ifcAPI.GetLine(modelID, rels.get(i));
          const psetId = rel?.RelatingPropertyDefinition?.value;
          if (!psetId) continue;
          const pset = this.ifcAPI.GetLine(modelID, psetId);
          if (!pset) continue;
          
          const psetName = pset.Name?.value || "Pset";
          const props: Record<string, any> = {};
          if (Array.isArray(pset.HasProperties)) {
            for (const propHandle of pset.HasProperties) {
               if (propHandle?.value) {
                 try {
                   const propLine = this.ifcAPI.GetLine(modelID, propHandle.value);
                   if (propLine && propLine.Name?.value) {
                     props[`${psetName}.${propLine.Name.value}`] = propLine.NominalValue;
                   }
                 } catch(e) {}
               }
            }
          }
          
          if (Array.isArray(rel.RelatedObjects)) {
            for (const obj of rel.RelatedObjects) {
              if (obj?.value) {
                if (!psetsByTarget.has(obj.value)) psetsByTarget.set(obj.value, []);
                psetsByTarget.get(obj.value)!.push(props);
              }
            }
          }
        } catch(e) {}
      }
    } catch(e) {}

    const expressIds = this.collectExpressIdsForDiff(modelID);
    for (const expressId of expressIds) {
      try {
        const props = this.ifcAPI.GetLine(modelID, expressId) as Record<
          string,
          unknown
        >;
        const gid = props?.GlobalId as { value?: string } | undefined;
        if (gid?.value) {
          const globalId = gid.value;
          const allProps = { ...props };
          
          // Attach type's attributes and psets first (so occurrence can override)
          const typeId = typeByElement.get(expressId);
          if (typeId) {
             try {
               const tProps = this.ifcAPI.GetLine(modelID, typeId);
               if (tProps) {
                  // Propagate PredefinedType if not defined on occurrence
                  if (tProps.PredefinedType !== undefined && tProps.PredefinedType !== null) {
                    allProps['Type.PredefinedType'] = tProps.PredefinedType;
                  }
                  
                  // Propagate Type's own HasPropertySets
                  if (Array.isArray(tProps.HasPropertySets)) {
                    for (const psetHandle of tProps.HasPropertySets) {
                      if (psetHandle?.value) {
                        try {
                           const psetLine = this.ifcAPI.GetLine(modelID, psetHandle.value);
                           if (psetLine) {
                              const psetName = psetLine.Name?.value || "Pset";
                              if (Array.isArray(psetLine.HasProperties)) {
                                for (const propHandle of psetLine.HasProperties) {
                                  if (propHandle?.value) {
                                    try {
                                      const propLine = this.ifcAPI.GetLine(modelID, propHandle.value);
                                      if (propLine && propLine.Name?.value) {
                                        allProps[`${psetName}.${propLine.Name.value}`] = propLine.NominalValue;
                                      }
                                    } catch(e) {}
                                  }
                                }
                              }
                           }
                        } catch(e) {}
                      }
                    }
                  }
               }
             } catch (e) {}
             const typePsets = psetsByTarget.get(typeId) || [];
             for (const p of typePsets) Object.assign(allProps, p);
          }

          // Attach occurrences's psets
          const myPsets = psetsByTarget.get(expressId) || [];
          for (const p of myPsets) Object.assign(allProps, p);
          
          elements[globalId] = { properties: allProps, expressId };
          globalIdToExpressId.set(globalId, expressId);
          expressIdToGlobalId.set(expressId, globalId);
        }
      } catch (e) {
        // ignore invalid lines
      }
    }

    this.ifcAPI.CloseModel(modelID);

    return { elements, globalIdToExpressId, expressIdToGlobalId };
  }
}
