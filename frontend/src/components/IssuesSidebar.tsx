import React, { useMemo, useState } from "react";
import { X, ListTree, ChevronRight, ChevronDown, Check, Trash2 } from "lucide-react";
import { useAppStore, type IfcIssue } from "../store/useAppStore";

function issueRowTitle(title: string, max = 52) {
  if (title.length <= max) return title;
  return `${title.slice(0, max)}…`;
}

interface IssueNode {
  issue: IfcIssue;
  children: IssueNode[];
}

function buildIssueTree(issues: IfcIssue[]): IssueNode[] {
  const roots: IssueNode[] = [];
  const map = new Map<string, IssueNode>();

  issues.forEach((issue) => {
    map.set(issue.title, { issue, children: [] });
  });

  issues.forEach((issue) => {
    const node = map.get(issue.title)!;
    // Parent title might be after " — "
    const match = issue.title.match(/^.* ×\d+ — (.*)$/);
    if (match) {
      const parentTitle = match[1];
      const parentNode = map.get(parentTitle);
      if (parentNode) {
        parentNode.children.push(node);
        return;
      }
    }
    roots.push(node);
  });

  return roots;
}

function getAllDescendantIds(node: IssueNode): number[] {
  const ids = [node.issue.id];
  for (const child of node.children) {
    ids.push(...getAllDescendantIds(child));
  }
  return ids;
}

const IssueTreeNode: React.FC<{
  node: IssueNode;
  depth: number;
  issueFocus: number | null;
  onIssuePick: (id: number) => void;
}> = ({ node, depth, issueFocus, onIssuePick }) => {
  const { issue, children } = node;
  const isSelected = issueFocus === issue.id;
  const hasChildren = children.length > 0;
  const [expanded, setExpanded] = useState(true);

  const issueResolutions = useAppStore(s => s.issueResolutions);
  const setIssueResolution = useAppStore(s => s.setIssueResolution);
  const setMultipleResolutions = useAppStore(s => s.setMultipleResolutions);
  const resolution = issueResolutions[issue.id];

  const handleToggle = (status: 'accepted' | 'rejected', e: React.MouseEvent) => {
    e.stopPropagation();
    const isSetting = resolution?.status !== status;
    const newStatus = isSetting ? { status } : null;
    
    // Apply to this node and all descendants
    const ids = getAllDescendantIds(node);
    const updates: Record<number, any> = {};
    ids.forEach(id => {
      // Keep existing feedback if we are just switching back to rejected, or clear it if it's new
      const existing = issueResolutions[id];
      if (newStatus && newStatus.status === 'rejected' && existing?.feedback) {
        updates[id] = { status: 'rejected', feedback: existing.feedback };
      } else {
        updates[id] = newStatus;
      }
    });
    setMultipleResolutions(updates);
  };

  const handleFeedbackChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (resolution?.status === 'rejected') {
      setIssueResolution(issue.id, { ...resolution, feedback: e.target.value });
    }
  };

  return (
    <div className="flex flex-col">
      <div className={`flex items-start w-full mb-0.5 group`}>
        <div 
          style={{ width: `${depth * 16}px` }} 
          className="shrink-0 flex items-center justify-end pr-1 h-8"
        >
          {depth > 0 && (
            <div className="w-full h-1/2 border-l border-b border-slate-600/50 rounded-bl-sm opacity-50 ml-3" />
          )}
        </div>
        
        {hasChildren ? (
          <button 
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="shrink-0 p-1 mt-1 text-slate-500 hover:text-slate-300 transition-colors flex items-center justify-center"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <div className="w-[22px] shrink-0" />
        )}
        
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-start gap-1">
            <button
              type="button"
              title={issue.title}
              onClick={() => onIssuePick(issue.id)}
              className={`flex-1 text-left rounded px-2 py-1.5 text-xs border transition-colors ${
                isSelected
                  ? "bg-slate-800 border-violet-500/70 text-slate-100"
                  : "bg-slate-900/50 border-transparent text-slate-300 hover:bg-slate-800 hover:border-slate-600"
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <span className="font-mono text-violet-400 shrink-0">#{issue.id}</span>
                {resolution?.status === 'accepted' && <span className="text-[9px] uppercase font-bold text-emerald-400 bg-emerald-400/10 px-1 rounded border border-emerald-500/20 shrink-0">Accepted</span>}
                {resolution?.status === 'rejected' && <span className="text-[9px] uppercase font-bold text-red-400 bg-red-400/10 px-1 rounded border border-red-500/20 shrink-0">Rejected</span>}
              </div>
              <span className={`block font-sans text-[11px] mt-0.5 leading-snug ${resolution?.status === 'rejected' ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                {issueRowTitle(issue.title)}
              </span>
              <span className="block text-[10px] text-slate-500 mt-0.5">
                {issue.elementIds.length} element{issue.elementIds.length === 1 ? "" : "s"}
              </span>
            </button>

            <div className={`flex flex-col gap-1 shrink-0 ${resolution ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
              <button 
                onClick={(e) => handleToggle('accepted', e)}
                className={`p-1 rounded flex items-center justify-center transition-colors ${resolution?.status === 'accepted' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500 hover:text-emerald-400 hover:bg-slate-700'}`}
                title={resolution?.status === 'accepted' ? "Unstage" : "Accept change"}
              >
                <Check size={13} />
              </button>
              <button 
                onClick={(e) => handleToggle('rejected', e)}
                className={`p-1 rounded flex items-center justify-center transition-colors ${resolution?.status === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-slate-500 hover:text-red-400 hover:bg-slate-700'}`}
                title={resolution?.status === 'rejected' ? "Unstage" : "Reject change"}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          
          {/* Feedback input for rejected issues */}
          {resolution?.status === 'rejected' && !hasChildren && (
            <div className="mt-1 ml-1 mr-[26px]">
              <textarea
                value={resolution.feedback || ''}
                onChange={handleFeedbackChange}
                placeholder="Add feedback for the agent..."
                className="w-full bg-slate-900 border border-slate-700 rounded text-[10px] text-slate-300 p-1.5 focus:outline-none focus:border-red-500/50 resize-none"
                rows={2}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>
      </div>

      {expanded && hasChildren && (
        <div className="flex flex-col mt-0.5">
          {children.map(child => (
            <IssueTreeNode
              key={child.issue.id}
              node={child}
              depth={depth + 1}
              issueFocus={issueFocus}
              onIssuePick={onIssuePick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const IssuesSidebar: React.FC = () => {
  const { issues, issueFocus, setIssueFocus, setSelection, issueResolutions, commitResolutions } = useAppStore();

  const treeRoots = useMemo(() => issues ? buildIssueTree(issues) : [], [issues]);

  const clearFocus = () => setIssueFocus(null);

  const onIssuePick = (issueIndex: number) => {
    if (issueFocus === issueIndex) {
      setIssueFocus(null);
      return;
    }
    setIssueFocus(issueIndex);
    setSelection(null);
  };

  const acceptedCount = Object.values(issueResolutions).filter(r => r.status === 'accepted').length;
  const rejectedCount = Object.values(issueResolutions).filter(r => r.status === 'rejected').length;
  const totalStaged = acceptedCount + rejectedCount;

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
        <div className="space-y-0.5">
          {treeRoots.map((root) => (
            <IssueTreeNode
              key={root.issue.id}
              node={root}
              depth={0}
              issueFocus={issueFocus}
              onIssuePick={onIssuePick}
            />
          ))}
        </div>
      </div>

      {totalStaged > 0 && (
        <div className="p-3 border-t border-slate-800 shrink-0 bg-slate-900 flex flex-col gap-2">
          <div className="flex justify-between text-[10px] uppercase font-bold tracking-wide px-1">
            <span className="text-emerald-500">{acceptedCount} accepted</span>
            <span className="text-red-500">{rejectedCount} rejected</span>
          </div>
          <button
            onClick={commitResolutions}
            className="w-full py-2 rounded text-xs font-bold transition-all bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 flex justify-center items-center gap-2"
          >
            <Check size={14} />
            Apply changes
          </button>
        </div>
      )}

      <p className="text-[10px] text-slate-500 px-3 py-2 border-t border-slate-800 shrink-0 leading-relaxed">
        By default, all elements with issues are outlined in <span className="text-red-400">red</span>. 
        Active task: matching elements are outlined in <span className="text-violet-400">violet</span>.
        The rest of the model is dimmed. Click again to clear.
      </p>
    </aside>
  );
};
