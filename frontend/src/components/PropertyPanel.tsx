import React, { useMemo } from "react";
import { X, Info } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

const fmt = (v: unknown) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    if (Array.isArray(v)) {
      return `[ ${v.map((item) => (typeof item === 'object' && item !== null ? '{...}' : item)).join(', ')} ]`;
    }
    if ("value" in v && typeof v.value !== "undefined") {
        return String(v.value); // web-ifc value wrappers
    }
    return "{ ... }";
  }
  return String(v);
};

export const PropertyPanel: React.FC = () => {
  const { selection, setSelection, properties, diff } = useAppStore();

  const currentProps = selection ? properties?.[selection] : undefined;
  const modifications = selection ? diff?.modified[selection] : undefined;

  const displayProps = useMemo(() => {
    if (!currentProps) return [];
    const allProps = Object.entries(currentProps).filter(([k]) => k !== "expressID" && k !== "GlobalId" && k !== "OwnerHistory");
    
    // Sort modified properties first
    allProps.sort((a, b) => {
      const aMod = modifications?.attributes?.[a[0]] ? 1 : 0;
      const bMod = modifications?.attributes?.[b[0]] ? 1 : 0;
      return bMod - aMod;
    });

    return allProps;
  }, [currentProps, modifications]);

  if (!selection) return null;

  return (
    <div className="absolute bottom-6 left-[calc(18rem+1.5rem)] right-6 max-h-[35vh] flex flex-col bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden z-40 text-slate-200 transition-all">
      <div className="flex items-center justify-between px-5 py-3 bg-slate-800/40 border-b border-slate-700/50 shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-sm text-slate-200 flex items-center gap-2">
            <Info size={16} className="text-blue-400" />
            Element Properties
          </h3>
          <span className="text-xs font-mono text-slate-400 bg-slate-900/50 px-2 py-0.5 rounded-md border border-slate-700/50">
            {selection}
          </span>
        </div>
        <button onClick={() => setSelection(null)} className="text-slate-400 hover:text-slate-200 transition-colors bg-slate-800/50 hover:bg-slate-700/50 p-1.5 rounded-md border border-transparent hover:border-slate-600/50">
          <X size={16} />
        </button>
      </div>

      <div className="p-5 overflow-y-auto min-h-0 custom-scrollbar">
        {displayProps.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {displayProps.map(([k, v]) => {
              const mod = modifications?.attributes?.[k];
              if (mod) {
                return (
                  <div key={k} className="p-0 rounded-lg border border-slate-700/60 overflow-hidden bg-slate-800/40 col-span-1 md:col-span-2 shadow-sm">
                    <div className="bg-slate-800/60 px-3 py-2 border-b border-slate-700/60 font-medium text-slate-300 text-[11px] flex justify-between items-center">
                      <span>{k}</span>
                      <span className="text-[9px] uppercase tracking-wider text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                        Modified
                      </span>
                    </div>
                    <div className="font-mono text-[11px] leading-relaxed flex flex-col sm:flex-row">
                      <div className="flex-1 flex items-start bg-[#3b1212]/30 text-[#ff8b8b] border-b sm:border-b-0 sm:border-r border-red-900/30">
                        <div className="w-8 shrink-0 text-center border-r border-red-900/30 text-red-500/50 select-none py-2">-</div>
                        <div className="py-2 px-3 break-all">{fmt(mod.old)}</div>
                      </div>
                      <div className="flex-1 flex items-start bg-[#0e2a18]/30 text-[#85e89d]">
                        <div className="w-8 shrink-0 text-center border-r border-emerald-900/30 text-emerald-500/50 select-none py-2">+</div>
                        <div className="py-2 px-3 break-all">{fmt(mod.new)}</div>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={k} className="px-3 py-2.5 rounded-lg border text-xs bg-slate-800/20 border-slate-700/50 flex flex-col justify-center hover:bg-slate-800/40 transition-colors">
                  <div className="font-medium mb-1 text-slate-400 text-[10px] uppercase tracking-wider">{k}</div>
                  <div className="text-slate-200 break-all font-mono text-[11px]">{fmt(v)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-slate-500 text-sm py-8">
            No properties found for this element.
          </div>
        )}
      </div>
    </div>
  );
};
