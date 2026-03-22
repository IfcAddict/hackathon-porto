import { useEffect, useRef } from "react";
import { useAppStore } from "../store/useAppStore";

const META_URL = "/api/ifc-meta";
const POLL_MS = 2000;

export interface IfcMetaResponse {
  baseline: { filename: string; mtimeMs: number } | null;
  current: { filename: string; mtimeMs: number } | null;
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

async function fetchIfcAsFile(url: string, filename: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], filename, { type: "application/octet-stream" });
}

/**
 * Dev/preview: poll `/api/ifc-meta` (Vite `ifc-dirs` plugin) and fetch changed IFCs.
 * Baseline comes from `backend/rsc`, current from `backend/output` (same basename).
 * Updates store files when mtimes change so DiffService and the viewer stay in sync.
 */
export function usePollBackendIfcFiles() {
  const setBaseline = useAppStore((s) => s.setBaselineIfcFile);
  const setCurrent = useAppStore((s) => s.setCurrentIfcFile);
  const lastKeysRef = useRef<{ baseline: string | null; current: string | null }>({
    baseline: null,
    current: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function pullIfNew(
      entry: { filename: string; mtimeMs: number } | null,
      urlFor: (filename: string) => string,
      slot: "baseline" | "current",
      apply: (file: File) => void
    ) {
      const k = metaKey(entry);
      if (!k || !entry || k === lastKeysRef.current[slot]) return;
      try {
        const file = await fetchIfcAsFile(urlFor(entry.filename), entry.filename);
        if (cancelled) return;
        lastKeysRef.current[slot] = k;
        apply(file);
      } catch (e) {
        console.warn(`IFC auto-load (${slot}) failed:`, e);
      }
    }

    const tick = async () => {
      const meta = await fetchMeta();
      if (cancelled || !meta) return;
      await pullIfNew(
        meta.baseline,
        (f) => `/rsc/${encodeURIComponent(f)}`,
        "baseline",
        setBaseline
      );
      await pullIfNew(
        meta.current,
        (f) => `/output/${encodeURIComponent(f)}`,
        "current",
        setCurrent
      );
    };

    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [setBaseline, setCurrent]);
}
