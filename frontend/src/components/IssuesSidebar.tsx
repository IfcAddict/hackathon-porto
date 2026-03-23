import React from "react";
import { X, ListTree } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

function issueRowTitle(title: string, max = 52) {
  if (title.length <= max) return title;
  return `${title.slice(0, max)}…`;
}

export const IssuesSidebar: React.FC = () => {
  const { issues, issueFocus, setIssueFocus, setSelection } = useAppStore();

  const clearFocus = () => setIssueFocus(null);

  const onIssuePick = (issueIndex: number) => {
    if (issueFocus === issueIndex) {
      setIssueFocus(null);
      return;
    }
    const issue = issues?.[issueIndex];
    setIssueFocus(issueIndex);
    setSelection(issue?.elementIds[0] ?? null);
  };

  if (!issues || issues.length === 0) {
    return (
      <aside className="w-72 shrink-0 border-r border-slate-700 bg-slate-950 flex flex-col text-slate-400 text-sm p-4">
        <h2 className="text-slate-200 font-semibold text-sm mb-2">Issues</h2>
        <p className="text-xs leading-relaxed">
          Load an IFC in the viewer. If a matching{" "}
          <code className="text-slate-500">*_issues.json</code> is in{" "}
          <code className="text-slate-500">backend/output</code>, tasks appear here automatically
          (dev server polls <code className="text-slate-500">/api/ifc-meta</code>).
        </p>
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 border-r border-slate-700 bg-slate-950 flex flex-col min-h-0 text-slate-200">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div>
          <h2 className="font-semibold text-sm text-slate-100">Issues</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {issues.length} validation task{issues.length === 1 ? "" : "s"}
          </p>
        </div>
        {issueFocus !== null && (
          <button
            type="button"
            onClick={clearFocus}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2 py-1 rounded border border-slate-700 hover:bg-slate-800"
          >
            <X size={14} />
            Clear focus
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide mb-1.5 px-1 text-violet-300">
          <ListTree size={14} className="text-violet-400" />
          Tasks (ids)
        </div>
        <ul className="space-y-0.5">
          {issues.map((issue) => (
            <li key={issue.id}>
              <button
                type="button"
                title={issue.title}
                onClick={() => onIssuePick(issue.id)}
                className={`w-full text-left rounded px-2 py-1.5 text-xs border transition-colors ${
                  issueFocus === issue.id
                    ? "bg-slate-800 border-violet-500/70 text-slate-100"
                    : "bg-slate-900/50 border-transparent text-slate-300 hover:bg-slate-800 hover:border-slate-600"
                }`}
              >
                <span className="font-mono text-violet-400">#{issue.id}</span>
                <span className="block font-sans text-[11px] text-slate-400 mt-0.5 leading-snug">
                  {issueRowTitle(issue.title)}
                </span>
                <span className="block text-[10px] text-slate-600 mt-0.5">
                  {issue.elementIds.length} element{issue.elementIds.length === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[10px] text-slate-500 px-3 py-2 border-t border-slate-800 shrink-0 leading-relaxed">
        By default, all elements with issues are outlined in <span className="text-red-400">red</span>. 
        Active task: matching elements are outlined in <span className="text-violet-400">violet</span>.
        The rest of the model is dimmed. Click again to clear.
      </p>
    </aside>
  );
};
