import type { IfcIssue } from "../store/useAppStore";

export async function fetchIfcAsFile(url: string, filename: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], filename, { type: "application/octet-stream" });
}

export function parseIssuesPayload(data: unknown): IfcIssue[] | null {
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
    const idx =
      typeof rec.index === "number" && Number.isFinite(rec.index) ? Math.floor(rec.index) : i;
    out.push({ id: idx, title, description, elementIds });
    i++;
  }
  return out;
}

export async function fetchIssuesJsonFromUrl(url: string): Promise<IfcIssue[] | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return parseIssuesPayload(data);
  } catch {
    return null;
  }
}
