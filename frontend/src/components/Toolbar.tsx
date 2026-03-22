import React from "react";
import { Upload, Camera, Link, Unlink } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

export const Toolbar: React.FC = () => {
  const { oldModelFile, newModelFile, setOldModelFile, setNewModelFile, syncEnabled, setSyncEnabled } = useAppStore();

  const handleOldUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setOldModelFile(e.target.files[0]);
    }
  };

  const handleNewUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setNewModelFile(e.target.files[0]);
    }
  };

  return (
    <div className="fixed top-0 left-0 w-full bg-slate-900 border-b border-slate-700 p-3 z-50 flex items-center justify-between shadow-md text-slate-200">
      <div className="flex gap-4">
        <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded cursor-pointer transition-colors border border-slate-600">
          <Upload size={18} />
          <span className="text-sm font-medium">{oldModelFile ? oldModelFile.name : "Load Old IFC"}</span>
          <input type="file" accept=".ifc" className="hidden" onChange={handleOldUpload} />
        </label>
        
        <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded cursor-pointer transition-colors border border-slate-600">
          <Upload size={18} />
          <span className="text-sm font-medium">{newModelFile ? newModelFile.name : "Load New IFC"}</span>
          <input type="file" accept=".ifc" className="hidden" onChange={handleNewUpload} />
        </label>
      </div>

      <div className="flex items-center gap-4">
        <button 
          onClick={() => setSyncEnabled(!syncEnabled)}
          className={`flex items-center gap-2 px-4 py-2 rounded font-medium transition-colors border ${
            syncEnabled 
              ? "bg-blue-600 hover:bg-blue-700 border-blue-500 text-white" 
              : "bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-300"
          }`}
        >
          {syncEnabled ? <Link size={18} /> : <Unlink size={18} />}
          {syncEnabled ? "Sync Enabled" : "Sync Disabled"}
        </button>
      </div>
    </div>
  );
};
