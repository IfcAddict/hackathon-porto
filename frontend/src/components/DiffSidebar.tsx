import React from "react";
import { MinusCircle, PlusCircle, AlertCircle, X } from "lucide-react";
import { useAppStore, type DiffFocus } from "../store/useAppStore";

function shortId(g: string) {
  if (g.length <= 14) return g;
  return `${g.slice(0, 6)}…${g.slice(-4)}`;
}

function isActive(focus: DiffFocus | null, globalId: string) {
  return focus?.globalId === globalId;
}

export const DiffSidebar: React.FC = () => {
  const { diff, diffFocus, setDiffFocus, setSelection } = useAppStore();

  const clearFocus = () => setDiffFocus(null);

  const onPick = (globalId: string) => {
    if (isActive(diffFocus, globalId)) {
      clearFocus();
      return;
    }
    setDiffFocus({ globalId });
    setSelection(globalId);
  };

  if (!diff) {
    return (
      <aside className="w-72 shrink-0 border-r border-slate-700 bg-slate-950 flex flex-col text-slate-400 text-sm p-4">
        <h2 className="text-slate-200 font-semibold text-sm mb-2">Diff</h2>
        <p className="text-xs leading-relaxed">
          Load baseline and current IFC files to compute a diff. Entries will appear here.
        </p>
      </aside>
    );
  }

  const modifiedEntries = Object.entries(diff.modified);
  const total =
    diff.added.length + diff.deleted.length + modifiedEntries.length;

  return (
    <aside className="w-72 shrink-0 border-r border-slate-700 bg-slate-950 flex flex-col min-h-0 text-slate-200">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div>
          <h2 className="font-semibold text-sm text-slate-100">Diff</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {total === 0 ? "No changes" : `${total} change${total === 1 ? "" : "s"}`}
          </p>
        </div>
        {diffFocus && (
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

      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-4">
        <Section
          title="Deleted"
          icon={<MinusCircle className="text-red-400" size={14} />}
          empty="None"
          color="text-red-300"
        >
          {diff.deleted.map((id) => (
            <DiffRow
              key={`d-${id}`}
              label={shortId(id)}
              title={id}
              active={isActive(diffFocus, id)}
              onClick={() => onPick(id)}
            />
          ))}
        </Section>

        <Section
          title="Added"
          icon={<PlusCircle className="text-emerald-400" size={14} />}
          empty="None"
          color="text-emerald-300"
        >
          {diff.added.map((id) => (
            <DiffRow
              key={`a-${id}`}
              label={shortId(id)}
              title={id}
              active={isActive(diffFocus, id)}
              onClick={() => onPick(id)}
            />
          ))}
        </Section>

        <Section
          title="Modified"
          icon={<AlertCircle className="text-amber-400" size={14} />}
          empty="None"
          color="text-amber-300"
        >
          {modifiedEntries.map(([id, detail]) => {
            const n =
              (detail.attributes && Object.keys(detail.attributes).length) ||
              (detail.properties && Object.keys(detail.properties).length) ||
              0;
            return (
              <DiffRow
                key={`m-${id}`}
                label={shortId(id)}
                subtitle={n ? `${n} field${n === 1 ? "" : "s"}` : undefined}
                title={id}
                active={isActive(diffFocus, id)}
                onClick={() => onPick(id)}
              />
            );
          })}
        </Section>
      </div>

      <p className="text-[10px] text-slate-500 px-3 py-2 border-t border-slate-800 shrink-0 leading-relaxed">
        Selecting an entry fades other geometry so the element is easier to see
        (deleted GUIDs are not in the current model). Click again to clear.
      </p>
    </aside>
  );
};

function Section(props: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  color: string;
  children: React.ReactNode;
}) {
  const hasChildren = React.Children.count(props.children) > 0;
  return (
    <div>
      <div
        className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide mb-1.5 px-1 ${props.color}`}
      >
        {props.icon}
        {props.title}
      </div>
      {!hasChildren ? (
        <p className="text-xs text-slate-600 px-1 py-1">{props.empty}</p>
      ) : (
        <ul className="space-y-0.5">{props.children}</ul>
      )}
    </div>
  );
}

function DiffRow(props: {
  label: string;
  title: string;
  subtitle?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        title={props.title}
        onClick={props.onClick}
        className={`w-full text-left rounded px-2 py-1.5 text-xs font-mono border transition-colors ${
          props.active
            ? "bg-slate-800 border-amber-500/60 text-slate-100"
            : "bg-slate-900/50 border-transparent text-slate-300 hover:bg-slate-800 hover:border-slate-600"
        }`}
      >
        <span className="block truncate">{props.label}</span>
        {props.subtitle && (
          <span className="block text-[10px] text-slate-500 font-sans mt-0.5">
            {props.subtitle}
          </span>
        )}
      </button>
    </li>
  );
}
