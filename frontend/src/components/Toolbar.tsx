import React from "react";
import { Upload } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

function fmtDiff(diff: {
  added: string[];
  deleted: string[];
  modified: Record<string, unknown>;
} | null) {
  if (!diff) return null;
  const m = Object.keys(diff.modified).length;
  if (diff.added.length + diff.deleted.length + m === 0) return "No changes";
  const parts: string[] = [];
  if (diff.deleted.length) parts.push(`${diff.deleted.length} deleted`);
  if (diff.added.length) parts.push(`${diff.added.length} added`);
  if (m) parts.push(`${m} modified`);
  return parts.join(" · ");
}

export const Toolbar: React.FC = () => {
  const {
    baselineIfcFile,
    currentIfcFile,
    diff,
    setBaselineIfcFile,
    setCurrentIfcFile,
  } = useAppStore();

  const handleBaselineUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setBaselineIfcFile(e.target.files[0]);
    }
  };

  const handleCurrentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCurrentIfcFile(e.target.files[0]);
    }
  };

  return (
    <div className="fixed top-0 left-0 w-full bg-slate-900 border-b border-slate-700 p-3 z-50 flex items-center justify-between shadow-md text-slate-200">
      <div className="flex gap-4">
        <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded cursor-pointer transition-colors border border-slate-600">
          <Upload size={18} />
          <span className="text-sm font-medium">
            {baselineIfcFile ? baselineIfcFile.name : "Baseline IFC (for diff)"}
          </span>
          <input type="file" accept=".ifc" className="hidden" onChange={handleBaselineUpload} />
        </label>

        <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded cursor-pointer transition-colors border border-slate-600">
          <Upload size={18} />
          <span className="text-sm font-medium">
            {currentIfcFile ? currentIfcFile.name : "Current IFC (shown in viewer)"}
          </span>
          <input type="file" accept=".ifc" className="hidden" onChange={handleCurrentUpload} />
        </label>
      </div>

      {baselineIfcFile && currentIfcFile && (
        <div
          className="hidden sm:block text-xs text-slate-400 max-w-[280px] truncate text-right"
          title={fmtDiff(diff) ?? ""}
        >
          {fmtDiff(diff) ?? "Computing diff…"}
        </div>
      )}
    </div>
  );
};
