import React from "react";
import { Upload } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export const Toolbar: React.FC = () => {
  const { ifcFile, idsFiles, bcfFiles, issues, setIfcFile, setIdsFiles, setBcfFiles } = useAppStore();

  const handleUploadIfc = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIfcFile(e.target.files[0]);
    }
  };

  const handleUploadIds = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIdsFiles(Array.from(e.target.files));
    }
  };

  const handleUploadBcf = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setBcfFiles(Array.from(e.target.files));
    }
  };

  return (
    <div className="fixed top-0 left-0 w-full bg-slate-900 border-b border-slate-700 p-3 z-50 flex items-center justify-between shadow-md text-slate-200">
      <div className="flex-1"></div> {/* Spacer for left side */}
      
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded cursor-pointer transition-colors border border-slate-600">
          <Upload size={18} />
          <span className="text-sm font-medium">
            {ifcFile ? ifcFile.name : "IFC"}
          </span>
          <input type="file" accept=".ifc" className="hidden" onChange={handleUploadIfc} />
        </label>

        <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded cursor-pointer transition-colors border border-slate-600">
          <Upload size={18} />
          <span className="text-sm font-medium">
            {idsFiles.length > 0 ? `${idsFiles.length} IDS` : "IDS"}
          </span>
          <input type="file" accept=".ids" multiple className="hidden" onChange={handleUploadIds} />
        </label>

        <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded cursor-pointer transition-colors border border-slate-600">
          <Upload size={18} />
          <span className="text-sm font-medium">
            {bcfFiles.length > 0 ? `${bcfFiles.length} BCF` : "BCF"}
          </span>
          <input type="file" accept=".bcfzip,.bcf" multiple className="hidden" onChange={handleUploadBcf} />
        </label>
      </div>

      <div className="flex-1 flex justify-end">
        {issues && issues.length > 0 && (
          <div className="hidden sm:block text-xs text-slate-400 max-w-[280px] truncate text-right">
            {issues.length} issue{issues.length === 1 ? "" : "s"} loaded
          </div>
        )}
      </div>
    </div>
  );
};
