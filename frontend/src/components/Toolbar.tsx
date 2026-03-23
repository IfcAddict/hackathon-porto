import React from "react";
import { Upload } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export const Toolbar: React.FC = () => {
  const { ifcFile, issues, setIfcFile } = useAppStore();

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIfcFile(e.target.files[0]);
    }
  };

  return (
    <div className="fixed top-0 left-0 w-full bg-slate-900 border-b border-slate-700 p-3 z-50 flex items-center justify-between shadow-md text-slate-200">
      <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded cursor-pointer transition-colors border border-slate-600">
        <Upload size={18} />
        <span className="text-sm font-medium">
          {ifcFile ? ifcFile.name : "Open IFC (or use backend/output auto-load)"}
        </span>
        <input type="file" accept=".ifc" className="hidden" onChange={handleUpload} />
      </label>

      {issues && issues.length > 0 && (
        <div className="hidden sm:block text-xs text-slate-400 max-w-[280px] truncate text-right">
          {issues.length} issue{issues.length === 1 ? "" : "s"} loaded
        </div>
      )}
    </div>
  );
};
