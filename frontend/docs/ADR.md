# Single IFC viewer with client-side diff (frontend-first)

## Context

This feature supports a human-in-the-loop workflow to review changes on IFC models (e.g. after an AI-assisted edit). The app runs primarily in the browser: it loads IFCs, compares them locally, and shows **one** 3D view of the **current** model with highlights for **added** and **modified** elements. **Deleted** elements appear in the diff list only (they are not present in the current file).

The stack uses That Open Company tooling (IFC.js / Open BIM Components) behind a small `ViewerAdapter` so the renderer can be swapped later.

## Objectives

- Fully client-side IFC comparison (no server required for parsing/diff)
- One viewport: orbit, pan, zoom, select, property panel
- Clear visual encoding for changes that exist in the loaded model
- Extensible adapter boundary for other engines later

## Functional requirements

### IFC inputs (two files, one viewport)

- **Baseline IFC** — used only to compute the diff (what existed before).
- **Current IFC** — loaded into the **single** 3D viewer; diff against baseline drives sidebar and highlights.

Users can upload both files from the toolbar. In dev/preview, a hook can poll the backend folders (see below) and populate the same two `File` handles in the store.

### Navigation and interaction

- Orbit, pan, zoom on the one viewer
- Element selection and highlight
- Property / diff-detail panel for the selected `GlobalId`
- Diff sidebar: deleted / added / modified lists; row focus can isolate an element in the viewer when it exists in the current model

### What is not in scope anymore

- Split-screen or second viewer
- Camera sync between viewers (removed with the second viewer)

## Element comparison

### Matching strategy

- Match by `GlobalId`
- Only in baseline → **Deleted**
- Only in current → **Added**
- In both → attribute-level compare → **Modified** when IFC line data differs

### Diff classification

- **Deleted** / **Added** / **Modified**
- Modified detail can include attribute-level `{ old, new }` pairs (domain language; not “two viewers”)

### Visual encoding (3D)

Configured in frontend config (e.g. `diffVisual.ts`):

- **Added** and **Modified** are highlighted on the loaded (current) model
- **Deleted** is not drawn in the current model; listed in the UI only

## Technical architecture

```text
UI (React)
   ↓
Zustand store (baseline file, current file, diff, selection, focus)
   ↓
DiffService (web-ifc)          ViewerAdapter → OBCViewerAdapter
```

### ViewerAdapter (current responsibilities)

- `init`, `loadModel`, selection callback
- Diff overlay: `applyDiffAndIsolate`, `reapplyDiffHighlighterLayer`, `setFragmentIsolate`, highlights
- No camera replication API (single viewer)

### DiffService

- `init()` WASM
- `compare(baselineFile, currentFile)` → `{ added, deleted, modified }`

### Dev/preview: backend folder polling

The Vite plugin `ifc-dirs` exposes:

- `GET /api/ifc-meta` — JSON `{ baseline, current }` with first `.ifc` in `backend/rsc` and matching basename in `backend/output` (mtime for change detection)
- `GET /rsc/:file.ifc` and `GET /output/:file.ifc` — raw IFC bytes

The hook `usePollBackendIfcFiles` polls `/api/ifc-meta` and updates `baselineIfcFile` / `currentIfcFile` in the store when files change. This replaces any older “left/right viewer” auto-load wording; it is **one mechanism for two input files**, not two viewports.

## State shape (conceptual)

- `baselineIfcFile`, `currentIfcFile`
- `diff`, `diffFocus`, `selection`

## Performance notes

- Large models: consider Web Workers for diff (not required for the initial hackathon scope)
- Parse/cache strategies can live behind `DiffService` later

## Configuration

Colors and similar defaults live in frontend source (e.g. `src/config/diffVisual.ts`), not in a dual-viewer sync flag.

## Non-goals

- Server-side IFC diff in this ADR path
- Persistent storage
- Full geometric diff (beyond what the diff service implements today)

## Key design decision

All parsing and diff logic for comparison runs in the browser. **Two IFC files** are required for **semantic** diff; **one** Three.js/OBC world shows the **current** revision and paints modifications that exist in that file.
