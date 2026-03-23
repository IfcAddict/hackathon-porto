import { useEffect, useRef } from "react";
import { useAppStore, type IfcIssue } from "../store/useAppStore";

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

async function fetchIfcAsFile(url: string, filename: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], filename, { type: "application/octet-stream" });
}

function parseIssuesPayload(data: unknown): IfcIssue[] | null {
  if (!Array.isArray(data)) return null;
  const out: IfcIssue[] = [];
  let i = 0;
  for (const item of data) {
    if (!item || typeof item !== "object") return null;
    const rec = item as Record<string, unknown>;
    const title = rec.title;
    const description = rec.description;
    const elementIds = rec.elementIds;
    if (typeof title !== "string" || typeof description !== "string") return null;
    if (!Array.isArray(elementIds) || !elementIds.every((x) => typeof x === "string")) return null;
    out.push({ id: i++, title, description, elementIds });
  }
  return out;
}

async function fetchIssuesJson(url: string): Promise<IfcIssue[] | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return parseIssuesPayload(data);
  } catch {
    return null;
  }
}

/**
 * Poll `/api/ifc-meta` (Vite `ifc-dirs` plugin): load IFC from `backend/output`
 * and companion `*_issues.json` when mtimes change.
 */
export function usePollBackendIfcFiles() {
  const setBaselineIfcFile = useAppStore((s) => s.setBaselineIfcFile);
  const setIfcFile = useAppStore((s) => s.setIfcFile);
  const setIssues = useAppStore((s) => s.setIssues);
  const lastKeysRef = useRef<{
    baseline: string | null;
    current: string | null;
    issues: string | null;
  }>({
    baseline: null,
    current: null,
    issues: null,
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
        setBaselineIfcFile
      );
      await pullIfNew(
        meta.current,
        (f) => `/output/${encodeURIComponent(f)}`,
        "current",
        setIfcFile
      );

      const issuesK = metaKey(meta.issues);
      if (!issuesK || !meta.issues) {
        if (lastKeysRef.current.issues !== null) {
          lastKeysRef.current.issues = null;
          setIssues(null);
        }
      } else if (issuesK !== lastKeysRef.current.issues) {
        const url = `/output/${encodeURIComponent(meta.issues.filename)}`;
        const parsed = await fetchIssuesJson(url);
        if (cancelled) return;
        if (parsed) {
          lastKeysRef.current.issues = issuesK;
          setIssues(parsed);
        } else {
          console.warn("IFC issues JSON parse failed:", url);
        }
      }
    };

    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [setBaselineIfcFile, setIfcFile, setIssues]);
}
