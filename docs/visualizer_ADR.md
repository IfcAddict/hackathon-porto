# IFC visualizer

Architecture and behavior of the browser-based IFC diff UI are maintained here:

**[frontend/docs/ADR.md](../frontend/docs/ADR.md)**

**Current shape:** one 3D viewport loads the **current** IFC; a **baseline** IFC is held only for client-side diff (added / modified highlights in the viewer; deleted items in the sidebar). There is no split layout or camera sync between two viewers.

Older dual-viewer requirements in this file were removed to avoid contradicting the implementation; use `frontend/docs/ADR.md` as the source of truth.
