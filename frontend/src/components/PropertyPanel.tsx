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
  const { selection, setSelection, properties, diff, issueFocus, issues, setIssueFocus } = useAppStore();

  const focusedIssue = issueFocus !== null && issues ? issues[issueFocus] : null;

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
    
    const propChanges: Record<string, Map<string, { old: any, new: any, count: number }>> = {};
    const propValuesCount: Record<string, Map<string, { val: any, count: number }>> = {};

    focusedIssue.elementIds.forEach(gid => {
      // Diffs
      const mods = diff.modified[gid]?.attributes;
      if (mods) {
        Object.entries(mods).forEach(([k, v]) => {
          if (!propChanges[k]) propChanges[k] = new Map();
          const changeHash = `${JSON.stringify(v.old)} -> ${JSON.stringify(v.new)}`;
          if (!propChanges[k].has(changeHash)) {
            propChanges[k].set(changeHash, { old: v.old, new: v.new, count: 0 });
          }
          propChanges[k].get(changeHash)!.count++;
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
                <div className="flex flex-col gap-1.5">
                  {displayProps.map(([k, v]) => {
                    const mod = modifications?.attributes?.[k];
                    if (!mod) return null;
                    return (
                      <div key={k} className="p-0 rounded-md border border-slate-700/60 overflow-hidden bg-slate-800/40 shadow-sm flex flex-col md:flex-row items-stretch">
                        <div className="bg-slate-800/60 px-3 py-1.5 md:w-1/4 md:border-r border-b md:border-b-0 border-slate-700/60 font-medium text-slate-300 text-[11px] flex justify-between items-center gap-2 shrink-0">
                          <span className="truncate" title={k}>{k}</span>
                          <span className="text-[9px] uppercase tracking-wider text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Mod</span>
                        </div>
                        <div className="font-mono text-[11px] flex flex-1">
                          <div className="flex-1 flex items-center bg-[#3b1212]/30 text-[#ff8b8b] border-r border-red-900/30">
                            <div className="w-6 shrink-0 text-center border-r border-red-900/30 text-red-500/50 select-none py-1.5">-</div>
                            <div className="py-1.5 px-2 break-all">{fmt(mod.old)}</div>
                          </div>
                          <div className="flex-1 flex items-center bg-[#0e2a18]/30 text-[#85e89d]">
                            <div className="w-6 shrink-0 text-center border-r border-emerald-900/30 text-emerald-500/50 select-none py-1.5">+</div>
                            <div className="py-1.5 px-2 break-all">{fmt(mod.new)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Normal properties */}
              <div className="flex flex-wrap gap-2">
                {displayProps.map(([k, v]) => {
                  if (modifications?.attributes?.[k]) return null;
                  return (
                    <div key={k} className="flex items-baseline gap-1.5 px-2 py-1 rounded-md border text-[11px] bg-slate-800/40 border-slate-700/50 hover:bg-slate-700/40 transition-colors">
                      <span className="font-medium text-slate-400 uppercase tracking-wider">{k}:</span>
                      <span className="text-slate-200 font-mono break-all">{fmt(v)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 text-sm py-8">
              No properties found for this element.
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
          <span className="text-xs font-mono text-slate-400 bg-slate-900/50 px-2 py-0.5 rounded-md border border-slate-700/50">
            {focusedIssue?.elementIds.length} element{focusedIssue?.elementIds.length === 1 ? "" : "s"}
          </span>
        </div>
        <button onClick={() => setIssueFocus(null)} className="text-slate-400 hover:text-slate-200 transition-colors bg-slate-800 hover:bg-slate-700 p-1.5 rounded-md border border-transparent hover:border-slate-600/50">
          <X size={16} />
        </button>
      </div>

      <div className="p-4 overflow-y-auto min-h-0 custom-scrollbar">
        {aggregatedDiffs.length === 0 && commonProps.length === 0 && (
          <div className="text-center text-slate-500 text-sm py-8">
            No properties or common modifications found for this group.
          </div>
        )}

        <div className="flex flex-col gap-4">
          {aggregatedDiffs.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {aggregatedDiffs.map(({ key, changes }) => (
                <div key={key} className="p-0 rounded-md border border-slate-700/60 overflow-hidden bg-slate-800/40 shadow-sm flex flex-col md:flex-row items-stretch relative">
                  <div className="bg-slate-800/60 px-3 py-1.5 md:w-1/4 md:border-r border-b md:border-b-0 border-slate-700/60 font-medium text-slate-300 text-[11px] flex justify-between items-center gap-2 shrink-0">
                    <span className="truncate" title={key}>{key}</span>
                    <span className="text-[9px] uppercase tracking-wider text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Mod</span>
                  </div>
                  
                  <div className="flex-1 flex flex-col divide-y divide-slate-700/40">
                    {changes.map((change, i) => (
                      <div key={i} className="flex flex-col sm:flex-row relative">
                        <div className="absolute right-2 top-1.5 text-[9px] text-slate-500 font-mono bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700/50 z-10">
                          {change.count} el{change.count === 1 ? "" : "s"}
                        </div>
                        <div className="font-mono text-[11px] flex flex-1">
                          <div className="flex-1 flex items-center bg-[#3b1212]/30 text-[#ff8b8b] border-r border-red-900/30 min-h-[32px]">
                            <div className="w-6 shrink-0 text-center border-r border-red-900/30 text-red-500/50 select-none py-1.5">-</div>
                            <div className="py-1.5 px-2 break-all pr-12">{fmt(change.old)}</div>
                          </div>
                          <div className="flex-1 flex items-center bg-[#0e2a18]/30 text-[#85e89d] min-h-[32px]">
                            <div className="w-6 shrink-0 text-center border-r border-emerald-900/30 text-emerald-500/50 select-none py-1.5">+</div>
                            <div className="py-1.5 px-2 break-all pr-12">{fmt(change.new)}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {commonProps.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {commonProps.map(([k, v]) => (
                <div key={k} className="flex items-baseline gap-1.5 px-2 py-1 rounded-md border text-[11px] bg-slate-800/40 border-slate-700/50 hover:bg-slate-700/40 transition-colors">
                  <span className="font-medium text-slate-400 uppercase tracking-wider">{k}:</span>
                  <span className="text-slate-200 font-mono break-all">{fmt(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};