# Dual IFC Viewer with synchronized diff visualization (frontend-only)

## Context

This feature is part of an openBIM hackathon application focused on enabling a human-in-the-loop workflow to review and validate changes applied by an AI agent over IFC models.

Originally designed with a backend for IFC processing, this version removes backend dependencies and implements all functionality directly in the browser.

The system:

* Loads two IFC models directly in the browser
* Parses and analyzes them client-side
* Computes differences locally
* Visualizes results in real time

The implementation uses the ecosystem of That Open Company (IFC.js + Open BIM Components) while remaining rendering-engine agnostic.

## Objectives

* Fully client-side IFC comparison
* No backend dependency
* Immediate interaction and feedback
* Maintain extensibility for future engines (IFClite, etc.)
* Provide usable UI for diff inspection

## Functional requirements

### Dual viewer layout

* Two viewers:

  * Left: Old model
  * Right: New model
* Split screen layout

### Navigation and interaction

Each viewer supports:

* Orbit
* Pan
* Zoom

Additional:

* Element selection
* Highlight on selection
* Property inspection panel

### Camera synchronization

* Bidirectional synchronization
* Parameters:

  * Position
  * Target
  * Projection type
  * Zoom / FOV

Behavior:

* Sync enabled by default
* Can be disabled per viewer
* Re-enabling sync aligns to active camera

### Camera types

* Perspective and orthographic
* Switching propagates to both viewers

### Model loading

* User uploads or selects:

  * Old IFC
  * New IFC

* Default paths optional but not required

## Element comparison

### Matching strategy

* Match via `GlobalId`
* Rules:

  * Only in old → Deleted
  * Only in new → Added
  * In both → Compare

### Comparison types (user-controlled)

* Geometry (bounding box)
* Placement
* Properties (Psets)
* IFC attributes

### Comparison depth

* Deep comparison:

  * Exact property differences
  * Attribute differences
  * Placement changes
  * Geometry differences (bounding box level)

### Diff classification

* Deleted
* Added
* Modified

All differences count (no tolerance threshold)

### Visual encoding

Configured via `.env` (or frontend config)

Defaults:

* Deleted → Red
* Added → Green
* Modified → Amber

### Property inspection panel

Displays:

* GlobalId
* IFC class
* Status

If modified:

```id="2m2k2w"
Field
Old value
New value
```

## Technical requirements

## Architecture overview

Pure frontend application:

```id="rj6jxy"
UI (React recommended)
   ↓
Application logic (diff + state)
   ↓
ViewerAdapter
   ↓
Rendering engine (OBC / IFC.js)
```

## Critical design principle: rendering abstraction

Define:

```id="e4gnfw"
ViewerAdapter
  - loadModel(ifcFile)
  - setCamera(params)
  - getCamera()
  - highlightElement(globalId, color)
  - isolateElement(globalId)
  - onElementSelect(callback)
  - getElementData(globalId)
```

### Adapter implementation (current)

```id="x3b6kx"
OBCViewerAdapter
```

Responsibilities:

* Wrap IFC.js / OBC viewer
* Map `GlobalId ↔ ExpressID`
* Handle highlighting
* Provide element data access

### Future adapters

```id="k3v98f"
IfcLiteAdapter
OtherViewerAdapter
```

## IFC processing (client-side)

All IFC parsing and comparison happens in browser.

Use:

* `web-ifc` (WASM)

Extract:

* GlobalId
* IFC class
* Attributes
* Property sets
* Placement
* Bounding box (computed)

## Diff computation (client-side)

### DiffService

```id="6w7d3p"
DiffService
  - buildIndex(ifcModel)
  - compare(oldModel, newModel, options)
```

### Internal model structure

```id="dljtq1"
{
  GlobalId: {
    type: "IfcWall",
    attributes: {...},
    properties: {...},
    placement: {...},
    bbox: {...}
  }
}
```

### Diff output

```id="qkq2cz"
{
  added: [],
  deleted: [],
  modified: {
    GlobalId: {
      attributes: {...},
      properties: {...},
      placement: {...},
      geometry: {...}
    }
  }
}
```

## Mapping layer

Required:

```id="k9x1fw"
MappingService
  - globalIdToExpressId
  - expressIdToGlobalId
```

## Highlighting strategy (IFC.js)

* Convert `GlobalId → ExpressID`
* Apply subset or material override

## Frontend responsibilities

* Load IFC files
* Build internal data structures
* Compute diff
* Render viewers
* Sync cameras
* Handle selection
* Display property panel
* Apply color states

## Synchronization mechanism

```id="5k5d9o"
onCameraChange(viewerA):
  if syncEnabled:
    viewerB.setCamera(viewerA.getCamera())
```

* Use lock flag to avoid loops

## State management

Suggested structure:

```id="6q1g1u"
AppState
  - models (old, new)
  - diff
  - selection
  - cameraState
  - syncEnabled
  - comparisonOptions
```

## Performance considerations

* Use web workers for diff computation (recommended)
* Avoid blocking UI thread
* Cache parsed IFC data
* Incremental processing where possible

## Configuration

```id="8oy3yk"
COLOR_ADDED=#00FF00
COLOR_DELETED=#FF0000
COLOR_MODIFIED=#FFC107

DEFAULT_CAMERA=perspective
SYNC_ENABLED=true
```

## UX considerations

* Immediate feedback after loading models
* Clear color distinction
* Smooth navigation
* Fast selection and response
* Visible sync state

## Non-goals

* Backend processing
* Persistent storage
* Advanced geometry diff
* Accept/reject workflow

## Future extensions

* Optional backend for heavy models
* BCF integration
* AI explanation layer
* Migration to IFClite
* Advanced filtering

## Key design decision

All logic (parsing, diff, visualization state) is executed client-side.

Rendering engine is replaceable and fully abstracted.