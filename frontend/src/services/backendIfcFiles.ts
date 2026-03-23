import type { IfcIssue } from "../store/useAppStore";

export async function fetchIfcAsFile(url: string, filename: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const blob = await res.blob();
  return new File([blob], filename, { type: "application/octet-stream" });
}

export function parseIssuesPayload(data: unknown): IfcIssue[] | null {
  if (!Array.isArray(data)) return null;
  const rawIssues: IfcIssue[] = [];
  let nextId = 0;
  
  for (const item of data) {
    if (!item || typeof item !== "object") return null;
    const rec = item as Record<string, unknown>;
    const title = rec.title;
    const description = rec.description;
    const elementIds = rec.elementIds;
    if (typeof title !== "string" || typeof description !== "string") return null;
    if (!Array.isArray(elementIds) || !elementIds.every((x) => typeof x === "string")) return null;
    const idx =
      typeof rec.index === "number" && Number.isFinite(rec.index) ? Math.floor(rec.index) : nextId++;
    if (idx >= nextId) nextId = idx + 1;
    rawIssues.push({ id: idx, title, description, elementIds: [...elementIds] });
  }

  const out: IfcIssue[] = [];
  const parents = new Map<string, IfcIssue>();

  // Add explicit parents first
  for (const issue of rawIssues) {
    parents.set(issue.title, issue);
  }

  let nextNegativeId = -1;

  for (const issue of rawIssues) {
    const match = issue.title.match(/^.* ×\d+ — (.*)$/);
    if (match) {
      const parentTitle = match[1].trim();
      let parent = parents.get(parentTitle);

      if (!parent) {
        parent = {
          id: nextNegativeId--,
          title: parentTitle,
          description: "",
          elementIds: []
        };
        parents.set(parentTitle, parent);
        out.push(parent);
      }

      const existingIds = new Set(parent.elementIds);
      issue.elementIds.forEach(id => existingIds.add(id));
      parent.elementIds = Array.from(existingIds);
    }
    out.push(issue);
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
