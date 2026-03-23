import { useEffect, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { fetchIfcAsFile } from "../services/backendIfcFiles";

const META_URL = "/api/ifc-meta";
const POLL_MS = 2000;

export interface IfcMetaResponse {
  baseline: { filename: string; mtimeMs: number } | null;
  current: { filename: string; mtimeMs: number } | null;
  issues: { filename: string; mtimeMs: number } | null;
}

function metaKey(entry: { filename: string; mtimeMs: number } | null): string | null {
  if (!entry) return null;
  return `${entry.filename}:${entry.mtimeMs}`;
}

async function fetchMeta(): Promise<IfcMetaResponse | null> {
  try {
    const res = await fetch(META_URL);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) return null;
    return (await res.json()) as IfcMetaResponse;
  } catch {
    return null;
  }
}

/**
 * Poll `/api/ifc-meta`: load **baseline** IFC from `backend/rsc` only.
 * Output IFC and `*_issues.json` are loaded when the agent WebSocket signals
 * `awaiting_review` / `session_complete` (see `useAgentOutputSync`).
 */
export function usePollBackendIfcFiles() {
  const setBaselineIfcFile = useAppStore((s) => s.setBaselineIfcFile);
  const lastBaselineKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const meta = await fetchMeta();
      if (cancelled || !meta) return;

      const k = metaKey(meta.baseline);
      if (!k || !meta.baseline || k === lastBaselineKeyRef.current) return;
      try {
        const file = await fetchIfcAsFile(
          `/rsc/${encodeURIComponent(meta.baseline.filename)}`,
          meta.baseline.filename
        );
        if (cancelled) return;
        lastBaselineKeyRef.current = k;
        setBaselineIfcFile(file);
      } catch (e) {
        console.warn("IFC baseline auto-load failed:", e);
      }
    };

    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [setBaselineIfcFile]);
}
