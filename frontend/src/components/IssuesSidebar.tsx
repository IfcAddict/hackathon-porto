import React, { useMemo, useState } from "react";
import {
  X,
  ListTree,
  ChevronRight,
  ChevronDown,
  Check,
  Trash2,
  PlayCircle,
  Loader2,
  AlertCircle,
  Save,
} from "lucide-react";
import { useAppStore, type IfcIssue } from "../store/useAppStore";
import { useAgentSession } from "../hooks/useAgentSession";

function issueRowTitle(issue: IfcIssue, hasChildren: boolean, max = 65) {
  let display = issue.title;
  
  if (hasChildren && issue.description) {
    const lines = issue.description.split('\n');
    const ruleLine = lines.find(l => l.trim().startsWith('- '));
    if (ruleLine) {
      // Remove the "- " prefix and the "(XXX failures)" suffix
      display = ruleLine.replace(/^\s*-\s*/, '').replace(/\s*\(\d+\s*failures\)/i, '').trim();
    } else if (lines.length > 0 && lines[0].length > 10) {
      display = lines[0].trim();
    }
  } else if (!hasChildren && display.includes(' — ')) {
    // For children, show just the entity part, e.g. "IfcSpaceType ×102"
    display = display.split(' — ')[0].trim();
  }

  if (display.length <= max) return display;
  return `${display.slice(0, max)}…`;
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
                {issueRowTitle(issue, hasChildren)}
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
  const { issues, issueFocus, setIssueFocus, setSelection, issueResolutions } = useAppStore();
  const {
    phase: agentPhase,
    errorMessage: agentError,
    lastReport,
    startAgentRun,
    finishSession,
    applyStagedResolutions,
    resetComplete,
  } = useAgentSession();

  const canStartAgent =
    agentPhase === "idle" || agentPhase === "error" || agentPhase === "complete";
  const agentBusy =
    agentPhase === "connecting" || agentPhase === "running" || agentPhase === "finalizing";
  const canSendReview = agentPhase === "awaiting_review";

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

  const showRunButton = canStartAgent;

  const agentPanel = (
    <div className="flex flex-col items-center justify-center py-2 w-full space-y-3">
      {showRunButton && (
        <button
          type="button"
          onClick={() => {
            if (agentPhase === "complete") resetComplete();
            startAgentRun();
          }}
          className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-md text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 transition-all"
        >
          <PlayCircle size={18} />
          Run fix agent
        </button>
      )}

      {agentBusy && (
        <div className="flex flex-col items-center justify-center gap-3 py-4 text-violet-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-xs font-medium">Agent is working...</span>
        </div>
      )}

      {agentError && (
        <div className="flex gap-2 text-xs text-red-300 bg-red-950/40 border border-red-900/50 rounded-lg p-3 w-full">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span className="leading-relaxed break-words">{agentError}</span>
        </div>
      )}

      {agentPhase === "complete" && (
        <div className="space-y-3 w-full">
          <p className="text-xs text-emerald-400/90 leading-relaxed text-center">
            Output IFC and <code className="text-emerald-300/80">*_issues.json</code> saved.
          </p>
          <button
            type="button"
            onClick={resetComplete}
            className="w-full py-2 rounded text-xs font-medium border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {lastReport && agentPhase === "awaiting_review" && (
        <details className="text-xs border border-slate-700/60 rounded-md overflow-hidden w-full">
          <summary className="cursor-pointer px-3 py-2 bg-slate-800/50 text-slate-400 hover:text-slate-200 transition-colors">
            Latest agent report
          </summary>
          <pre className="max-h-48 overflow-auto p-3 text-slate-500 whitespace-pre-wrap break-words font-mono leading-relaxed">
            {lastReport}
          </pre>
        </details>
      )}

      {canSendReview && (
        <div className="flex flex-col gap-2 w-full">
          <button
            type="button"
            onClick={finishSession}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs font-medium border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <Save size={14} />
            Finish session (save, no more passes)
          </button>
        </div>
      )}
    </div>
  );

  if (agentPhase !== "awaiting_review") {
    return (
      <aside className="w-72 shrink-0 border-r border-slate-700 bg-slate-950 flex flex-col justify-center items-center p-4 min-h-0 text-slate-200">
        {agentPanel}
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 border-r border-slate-700 bg-slate-950 flex flex-col min-h-0 text-slate-200">
      <div className="p-3 border-b border-slate-800 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-sm text-slate-100">Issues</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {issues ? issues.length : 0} validation task{issues?.length === 1 ? "" : "s"}
            </p>
          </div>
          {issueFocus !== null && (
            <button
              type="button"
              onClick={clearFocus}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2 py-1 rounded border border-slate-700 hover:bg-slate-800 shrink-0"
            >
              <X size={14} />
              Clear focus
            </button>
          )}
        </div>
        {agentPanel}
      </div>

      {issues && issues.length > 0 && (
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
      )}

      {totalStaged > 0 && (
        <div className="p-3 border-t border-slate-800 shrink-0 bg-slate-900 flex flex-col gap-2">
          <div className="flex justify-between text-[10px] uppercase font-bold tracking-wide px-1">
            <span className="text-emerald-500">{acceptedCount} accepted</span>
            <span className="text-red-500">{rejectedCount} rejected</span>
          </div>
          <button
            type="button"
            disabled={!canSendReview}
            title={
              canSendReview
                ? "Send staged accept/reject to the agent for another pass"
                : "Wait until the agent is ready for review (see status above)"
            }
            onClick={applyStagedResolutions}
            className="w-full py-2 rounded text-xs font-bold transition-all bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none text-white shadow-lg shadow-emerald-500/20 flex justify-center items-center gap-2"
          >
            <Check size={14} />
            Send review to agent
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
