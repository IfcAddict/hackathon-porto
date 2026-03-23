import React, { useMemo } from "react";
import { X, Info } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

const fmt = (v: unknown) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    if (Array.isArray(v)) {
      return `[ ${v.map((item) => (typeof item === 'object' && item !== null ? '{...}' : item)).join(', ')} ]`;
    }
    if ("value" in v && typeof (v as any).value !== "undefined") {
        return String((v as any).value); // web-ifc value wrappers
    }
    return "{ ... }";
  }
  return String(v);
};

export const PropertyPanel: React.FC = () => {
  const { selection, selectionGroup, setSelection, setSelectionGroup, properties, diff, issueFocus, issues, setIssueFocus } = useAppStore();

  const focusedIssue = issueFocus !== null && issues ? issues.find(i => i.id === issueFocus) : null;

  // --- Single Element Logic ---
  const currentProps = selection ? properties?.[selection] : undefined;
  const modifications = selection ? diff?.modified[selection] : undefined;

  const displayProps = useMemo(() => {
    if (!currentProps) return [];
    const allProps = Object.entries(currentProps).filter(([k, v]) => {
      if (k === "expressID" || k === "GlobalId" || k === "OwnerHistory") return false;
      const f = fmt(v);
      if (f === "—" || f === "null" || f === "" || f === "{}") return false;
      return true;
    });
    
    // Sort modified properties first
    allProps.sort((a, b) => {
      const aMod = modifications?.attributes?.[a[0]] ? 1 : 0;
      const bMod = modifications?.attributes?.[b[0]] ? 1 : 0;
      return bMod - aMod;
    });

    return allProps;
  }, [currentProps, modifications]);

  // --- Aggregated Issue Logic ---
  const { aggregatedDiffs, commonProps } = useMemo(() => {
    if (!focusedIssue || !diff || !properties) return { aggregatedDiffs: [], commonProps: [] };
    
    const propChanges: Record<string, Map<string, { old: any, new: any, count: number, elementIds: string[], elementTypes: Set<string> }>> = {};
    const propValuesCount: Record<string, Map<string, { val: any, count: number }>> = {};

    focusedIssue.elementIds.forEach(gid => {
      // Diffs
      const mods = diff.modified[gid]?.attributes;
      if (mods) {
        Object.entries(mods).forEach(([k, v]) => {
          if (!propChanges[k]) propChanges[k] = new Map();
          const changeHash = `${JSON.stringify(v.old)} -> ${JSON.stringify(v.new)}`;
          if (!propChanges[k].has(changeHash)) {
            propChanges[k].set(changeHash, { old: v.old, new: v.new, count: 0, elementIds: [], elementTypes: new Set() });
          }
          const changeRef = propChanges[k].get(changeHash)!;
          changeRef.count++;
          changeRef.elementIds.push(gid);
          const cname = properties[gid]?.constructor?.name;
          changeRef.elementTypes.add((cname && cname !== "Object") ? cname : "Element");
        });
      }

      // Static properties
      const props = properties[gid];
      if (props) {
        Object.entries(props).forEach(([k, v]) => {
          if (k === "expressID" || k === "GlobalId" || k === "OwnerHistory") return;
          const f = fmt(v);
          if (f === "—" || f === "null" || f === "" || f === "{}") return;

          if (!propValuesCount[k]) propValuesCount[k] = new Map();
          const valHash = JSON.stringify(v);
          if (!propValuesCount[k].has(valHash)) {
            propValuesCount[k].set(valHash, { val: v, count: 0 });
          }
          propValuesCount[k].get(valHash)!.count++;
        });
      }
    });

    const numElements = focusedIssue.elementIds.length;
    const common = Object.entries(propValuesCount)
      .filter(([, map]) => {
        if (map.size !== 1) return false;
        const onlyVal = Array.from(map.values())[0];
        return onlyVal.count === numElements;
      })
      .map(([k, map]) => {
        return [k, Array.from(map.values())[0].val] as [string, any];
      })
      .sort((a, b) => a[0].localeCompare(b[0]));

    const aggDiffs = Object.entries(propChanges).map(([key, changesMap]) => {
      return {
        key,
        changes: Array.from(changesMap.values()).sort((a, b) => b.count - a.count)
      };
    }).sort((a, b) => a.key.localeCompare(b.key));

    return { aggregatedDiffs: aggDiffs, commonProps: common };
  }, [focusedIssue, diff, properties]);

  if (!selection && !focusedIssue) {
    return (
      <div className="h-[33vh] shrink-0 flex flex-col bg-slate-900 border-t border-slate-700 text-slate-200">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700/50 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-sm text-slate-200 flex items-center gap-2">
              <Info size={16} className="text-slate-400" />
              Project Overview
            </h3>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
          <p className="text-sm mb-2">No element or task selected.</p>
          <p className="text-xs text-slate-600 max-w-md">
            Click on a task in the sidebar to view group properties and modifications, or select an element in the 3D viewer to inspect its details.
          </p>
          {issues && issues.length > 0 && (
            <div className="mt-6 flex gap-4 text-xs">
              <div className="bg-slate-800/50 px-4 py-2 rounded-lg border border-slate-700/50">
                <span className="block text-slate-400 mb-1">Total Issues</span>
                <span className="text-lg font-mono text-slate-300">{issues.length}</span>
              </div>
              <div className="bg-slate-800/50 px-4 py-2 rounded-lg border border-slate-700/50">
                <span className="block text-slate-400 mb-1">Affected Elements</span>
                <span className="text-lg font-mono text-slate-300">
                  {new Set(issues.flatMap(i => i.elementIds)).size}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (selection) {
    return (
      <div className="h-[33vh] shrink-0 flex flex-col bg-slate-900 border-t border-slate-700 text-slate-200">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700/50 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-sm text-slate-200 flex items-center gap-2">
              <Info size={16} className="text-blue-400" />
              Element Properties
            </h3>
            <span className="text-xs font-mono text-slate-400 bg-slate-900/50 px-2 py-0.5 rounded-md border border-slate-700/50">
              {selection}
            </span>
          </div>
          <button onClick={() => setSelection(null)} className="text-slate-400 hover:text-slate-200 transition-colors bg-slate-800 hover:bg-slate-700 p-1.5 rounded-md border border-transparent hover:border-slate-600/50">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto min-h-0 custom-scrollbar">
          {displayProps.length > 0 ? (
            <div className="flex flex-col gap-4">
              {/* Modifications */}
              {displayProps.some(([k]) => modifications?.attributes?.[k]) && (
                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2">
                    Modifications
                  </div>
                  <div className="w-full border border-slate-700/60 rounded-md overflow-x-auto bg-slate-800/20 custom-scrollbar">
                    <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                      <thead>
                        <tr className="bg-slate-800/60 border-b border-slate-700/60 text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                          <th className="py-2.5 px-3 border-r border-slate-700/60 w-1/4">IFC Classes / Entities</th>
                          <th className="py-2.5 px-3 border-r border-slate-700/60 w-1/4">Property / Attribute</th>
                          <th className="py-2.5 px-3 border-r border-slate-700/60 w-1/4">Before</th>
                          <th className="py-2.5 px-3 w-1/4">After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/40">
                        {displayProps.map(([k, v]) => {
                          const mod = modifications?.attributes?.[k];
                          if (!mod) return null;
                          return (
                            <tr key={k} className="hover:bg-slate-800/40 transition-colors group">
                              {/* Element */}
                              <td className="py-2.5 px-3 align-top border-r border-slate-700/60 font-medium text-slate-300">
                                {(currentProps?.constructor?.name && currentProps.constructor.name !== "Object") ? currentProps.constructor.name : "Element"}
                              </td>

                              {/* Property */}
                              <td className="py-2.5 px-3 align-top border-r border-slate-700/60">
                                <span className="font-medium text-slate-300 whitespace-normal">{k}</span>
                              </td>
                              
                              {/* Before */}
                              <td className="py-2.5 px-3 align-top border-r border-slate-700/60 font-mono text-[#ff8b8b] bg-[#3b1212]/10 whitespace-normal min-w-[150px]">
                                <div className="flex items-start gap-1.5">
                                  <span className="text-red-500/50 select-none shrink-0">-</span>
                                  <span className="break-all">{fmt(mod.old)}</span>
                                </div>
                              </td>

                              {/* After */}
                              <td className="py-2.5 px-3 align-top font-mono text-[#85e89d] bg-[#0e2a18]/10 whitespace-normal min-w-[150px]">
                                <div className="flex items-start gap-1.5">
                                  <span className="text-emerald-500/50 select-none shrink-0">+</span>
                                  <span className="break-all">{fmt(mod.new)}</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="text-center text-slate-500 text-sm py-8">
              No modifications found for this element.
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Render Issue Aggregation ---
  return (
    <div className="h-[33vh] shrink-0 flex flex-col bg-slate-900 border-t border-slate-700 text-slate-200">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 border-b border-slate-700/50 shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-sm text-slate-200 flex items-center gap-2">
            <Info size={16} className="text-violet-400" />
            Group Properties & Changes
          </h3>
          {focusedIssue && (
            <button 
              onClick={() => {
                if (selectionGroup && selectionGroup.length === focusedIssue.elementIds.length) {
                  setSelectionGroup(null);
                } else {
                  setSelectionGroup(focusedIssue.elementIds);
                }
              }}
              className={`text-[13px] font-bold px-3 py-1.5 rounded-md border-2 transition-colors shadow-sm ${
                selectionGroup && selectionGroup.length === focusedIssue.elementIds.length 
                  ? "bg-violet-600/30 border-violet-500/70 text-violet-100" 
                  : "bg-slate-800 border-slate-600/80 text-white hover:border-slate-500 hover:bg-slate-700"
              }`}
              title={selectionGroup && selectionGroup.length === focusedIssue.elementIds.length ? "Deselect elements in 3D" : "Select all elements in 3D"}
            >
              [ {focusedIssue.elementIds.length} element{focusedIssue.elementIds.length === 1 ? "" : "s"} ]
            </button>
          )}
        </div>
        <button onClick={() => setIssueFocus(null)} className="text-slate-400 hover:text-slate-200 transition-colors bg-slate-800 hover:bg-slate-700 p-1.5 rounded-md border border-transparent hover:border-slate-600/50">
          <X size={16} />
        </button>
      </div>

      <div className="p-4 overflow-y-auto min-h-0 custom-scrollbar">
        {aggregatedDiffs.length === 0 && commonProps.length === 0 && (
          <div className="text-center text-slate-500 text-sm py-8 pt-6">
            No modifications or common properties found for this group.
          </div>
        )}

        <div className="flex flex-col gap-4">
          {aggregatedDiffs.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2">
                Modifications
              </div>
              <div className="w-full border border-slate-700/60 rounded-md overflow-x-auto bg-slate-800/20 custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-800/60 border-b border-slate-700/60 text-slate-300 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3 border-r border-slate-700/60 w-1/5">IFC Classes/Entities</th>
                      <th className="py-2.5 px-3 border-r border-slate-700/60 w-1/5">Property/Attribute</th>
                      <th className="py-2.5 px-3 border-r border-slate-700/60 w-1/5">Before</th>
                      <th className="py-2.5 px-3 border-r border-slate-700/60 w-1/5">After</th>
                      <th className="py-2.5 px-3 w-1/5">Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/40">
                    {aggregatedDiffs.map(({ key, changes }) => (
                      <React.Fragment key={key}>
                        {changes.map((change, i) => (
                          <tr key={`${key}-${i}`} className="hover:bg-slate-800/40 transition-colors group">
                            {/* Element */}
                            <td className="py-2.5 px-3 align-top border-r border-slate-700/60 font-medium text-slate-300">
                              {Array.from(change.elementTypes).join(", ")}
                            </td>

                            {/* Property */}
                            <td className="py-2.5 px-3 align-top border-r border-slate-700/60">
                              <span className="font-medium text-slate-300 whitespace-normal">{key}</span>
                            </td>
                            
                            {/* Before */}
                            <td className="py-2.5 px-3 align-top border-r border-slate-700/60 font-mono text-[#ff8b8b] bg-[#3b1212]/10 whitespace-normal min-w-[150px]">
                              <div className="flex items-start gap-1.5">
                                <span className="text-red-500/50 select-none shrink-0">-</span>
                                <span className="break-all">{fmt(change.old)}</span>
                              </div>
                            </td>

                            {/* After */}
                            <td className="py-2.5 px-3 align-top border-r border-slate-700/60 font-mono text-[#85e89d] bg-[#0e2a18]/10 whitespace-normal min-w-[150px]">
                              <div className="flex items-start gap-1.5">
                                <span className="text-emerald-500/50 select-none shrink-0">+</span>
                                <span className="break-all">{fmt(change.new)}</span>
                              </div>
                            </td>

                            {/* Count */}
                            <td className="py-1.5 px-2 align-top">
                              <button
                                onClick={() => {
                                  const isSelected = selectionGroup && 
                                     selectionGroup.length === change.elementIds.length && 
                                     selectionGroup.every(id => change.elementIds.includes(id));
                                  if (isSelected) {
                                    setSelectionGroup(null);
                                  } else {
                                    setSelectionGroup(change.elementIds);
                                  }
                                }}
                                className={`flex items-center justify-center gap-2 px-2 py-1.5 rounded-md border-2 transition-colors w-full shadow-sm ${
                                  selectionGroup && selectionGroup.length === change.elementIds.length && selectionGroup.every(id => change.elementIds.includes(id))
                                    ? "bg-violet-600/30 border-violet-500/70 text-violet-100"
                                    : "bg-slate-700/50 border-slate-600/80 text-white hover:border-slate-500 hover:bg-slate-700"
                                }`}
                                title="Highlight these elements in the 3D viewer"
                              >
                                <span className="text-[13px] font-bold whitespace-nowrap">[ {change.count} elements ]</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {commonProps.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2 mt-2">
                Common Properties
              </div>
              <div className="flex flex-wrap gap-2">
                {commonProps.map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-1.5 px-2 py-1 rounded-md border text-[11px] bg-slate-800/40 border-slate-700/50 hover:bg-slate-700/40 transition-colors">
                    <span className="font-medium text-slate-400 uppercase tracking-wider">{k}:</span>
                    <span className="text-slate-200 font-mono break-all">{fmt(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};