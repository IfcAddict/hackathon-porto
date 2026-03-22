import React from "react";
import { X, AlertCircle, PlusCircle, MinusCircle, Info } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export const PropertyPanel: React.FC = () => {
  const { selection, setSelection, diff } = useAppStore();

  if (!selection) return null;

  let status = "Unchanged";
  let statusColor = "text-slate-400";
  let Icon = Info;
  
  if (diff?.added.includes(selection)) {
    status = "Added";
    statusColor = "text-emerald-400";
    Icon = PlusCircle;
  } else if (diff?.deleted.includes(selection)) {
    status = "Deleted";
    statusColor = "text-red-400";
    Icon = MinusCircle;
  } else if (diff?.modified[selection]) {
    status = "Modified";
    statusColor = "text-amber-400";
    Icon = AlertCircle;
  }

  const modifications = diff?.modified[selection];

  const fmt = (v: unknown) => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "object") {
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    }
    return String(v);
  };

  return (
    <div className="absolute top-20 right-4 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-40 text-slate-200">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <h3 className="font-semibold text-sm">Element Properties</h3>
        <button onClick={() => setSelection(null)} className="text-slate-400 hover:text-white transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <div className="text-xs text-slate-400 font-medium mb-1">GlobalId</div>
          <div className="text-sm font-mono bg-slate-800 px-2 py-1 rounded border border-slate-700 truncate">
            {selection}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 p-2 bg-slate-800/50 rounded border border-slate-700">
           <Icon size={16} className={statusColor} />
           <span className={`text-sm font-semibold ${statusColor}`}>{status}</span>
        </div>

        {modifications?.attributes && (
          <div className="mt-4 border-t border-slate-700 pt-4">
            <h4 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-3">
              Changed IFC attributes
            </h4>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {Object.entries(modifications.attributes).map(([field, data]) => (
                <div
                  key={field}
                  className="bg-slate-800 rounded p-2 border border-slate-700 text-xs"
                >
                  <div className="font-semibold text-slate-300 mb-1 break-all">{field}</div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 mt-2">
                    <span className="text-red-400 shrink-0">Old:</span>
                    <span className="text-slate-300 break-all">{fmt(data.old)}</span>
                    <span className="text-emerald-400 shrink-0">New:</span>
                    <span className="text-slate-300 break-all">{fmt(data.new)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {modifications?.properties && (
          <div className="mt-4 border-t border-slate-700 pt-4">
            <h4 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-3">
              Modified property sets
            </h4>
            <div className="space-y-3">
              {Object.entries(modifications.properties).map(([field, data]: [string, any]) => (
                <div key={field} className="bg-slate-800 rounded p-2 border border-slate-700 text-xs">
                  <div className="font-semibold text-slate-300 mb-1">{field}</div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 mt-2">
                    <span className="text-red-400">Old:</span>
                    <span className="text-slate-300 truncate">{fmt(data.old)}</span>
                    <span className="text-emerald-400">New:</span>
                    <span className="text-slate-300 truncate">{fmt(data.new)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
