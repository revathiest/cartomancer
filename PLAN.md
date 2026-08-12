# DnD City Map Generator/Editor — Phase 1 Plan

## Context

The user wants to build a system for creating D&D city and dungeon maps that are detailed enough to download and import into World Anvil. Two separate generators will eventually exist (city maps and dungeon maps have different enough layout logic to warrant separate tools), but **this plan covers the city map generator only** — the dungeon generator is deliberately out of scope for now and will be planned separately later.

Critically, the user doesn't just want a one-shot generator — they want a real editing tool: control over district count/placement, the ability to drag roads and streams around, move city walls, redefine district boundaries, and hand-place specific named buildings/businesses. That requirement rules out a static image generator or CLI script and points to an interactive local web app with an editable vector scene.

Output needs to be exportable as a PNG/JPG that the user manually uploads to World Anvil (no automated API push — manual upload is the user's chosen workflow, even though World Anvil MCP tools are available in this environment).

This is a greenfield build. New project folder: `D:\Claude\dnd-map-maker`. (Note: `D:\Claude\Emberune` is an existing Azgaar Fantasy Map Generator save file, unrelated format — not reused, but it confirms Voronoi-based region partitioning is a proven approach for this kind of tool.)

## 1. Tech Stack

- **React + Vite + TypeScript.** Pure client-side SPA, no backend needed — `npm run dev` for local iteration, `npm run build` for a static output.
- **Rendering: SVG-in-DOM** (not Canvas/Konva/Pixi). The core requirement is editable vector geometry — dragging polygon vertices, dragging road/river control points, clicking to select buildings. SVG gives every primitive (`path`, `polygon`, `circle`) a real DOM node with native hit-testing, so "which vertex did I grab" comes for free instead of requiring manual hit-test math. React binds declaratively to SVG elements driven by state — no imperative retained-mode scene graph library needed. Hand-drawn styling (wobble, texture, hatching) is achievable via SVG filters (`feTurbulence`, `feDisplacementMap`) without an external rendering pipeline. A city map's node count (dozens of districts, ~100-300 buildings, a street network) is well within safe SVG performance limits for a local desktop tool.
- **PNG export**: serialize the SVG DOM → draw into an offscreen `<canvas>` via `Image` + `drawImage` → `canvas.toBlob()` → download. No extra library needed.

## 2. Procedural Generation Algorithm

All generation is deterministic from an integer seed (seeded PRNG such as mulberry32, plus simplex-noise seeded the same way for jitter), so the same seed always reproduces the same city and generation can be safely re-run/tweaked.

1. **Base bounds**: fixed logical canvas (e.g. 2000×2000 world units), independent of on-screen zoom.
2. **Districts (Voronoi)**: scatter N seed points (N = user-controlled district count) via Poisson-disc-style min-distance rejection inside a rough city footprint. Compute a Voronoi diagram over those points with `d3-delaunay`, clipped to the city bounds — each cell becomes a district polygon. Assign each district a type (residential/market/noble/temple/slum/industrial) by weighted random, biasing the most central cell toward noble/castle.
3. **Roads**: radial primary roads from 2-4 gate anchor points (on the wall, see below) to the city center, following the Voronoi edge graph (greedy/Dijkstra walk along cell boundaries) so streets naturally trace district borders. Add secondary connector streets probabilistically along shared edges between adjacent cells. Apply small-amplitude simplex-noise lateral jitter per segment so streets aren't ruler-straight.
4. **City wall**: convex/concave hull of the district seed points, expanded outward with a margin and smoothed. Gates are the points where radial roads cross this hull — rendered as breaks in the wall stroke with a gate icon.
5. **River/stream**: a single perturbed cubic-bezier/Catmull-Rom polyline crossing or skirting the city footprint, noise-offset control points, with optional bridge markers where roads cross it.
6. **Buildings**: within each district polygon, recursive rectangular subdivision (BSP-style) at a density controlled by district type (dense grid for market, sparse for noble/slum). Buildings are stored as an editable list, not baked into a texture, so they can be individually moved/deleted/renamed afterward.

## 3. Styled Rendering Pass

- **Parchment background**: warm off-white/tan rect with a low-opacity `feTurbulence` grain filter and a radial vignette for an aged-paper look. Leave a clearly marked swap point in `rendering/background.tsx` for dropping in a real texture image later.
- **Hand-drawn wobble**: resample every path (roads, walls, river, district borders) into small segments and apply deterministic per-point simplex-noise perpendicular offset; optionally layer a coarser `feDisplacementMap` filter on top.
- **District fill**: semi-transparent flat color per district type plus a repeating diagonal-hatch SVG pattern, kept light enough that roads/buildings on top stay legible.
- **Buildings**: small rects with slight per-building rotation/corner jitter, colored by district type; text labels only for user-named/business buildings, using a medieval-styled Google Font (e.g. "MedievalSharp") via `@font-face`.
- **Labels & decoration**: district name centered per polygon, city name banner, compass rose and scale bar as static decorative SVG symbols added at export time.
- **Water/wall**: river as a gradient-filled wobble path with current-hatch lines; wall as a thick double-stroke path with crenellation ticks and gate icons.

## 4. Editing Model / Interaction Design

- **Single source of truth**: a `MapScene` object in a Zustand store — seed, generation params, `districts[]` (id, type, polygon points, name), `roads[]` (id, kind, points), `river` (points) or null, `wall` (polygon, gates) or null, `buildings[]` (id, x, y, w, h, rotation, districtId, name?, businessType?, isCustom). Generation writes a fresh `MapScene`; every manual edit is a mutation on the same shape, so the renderer never needs to know whether an object came from the algorithm or from a drag.
- **Modes**: "Generate" mode (parameter panel + Regenerate button, editing disabled) vs. "Edit" mode (drag handles active, parameter panel collapsed). Entering Edit mode freezes the current scene as the editable baseline.
- **Vertex dragging**: every polygon/polyline point renders an invisible-until-hover handle in Edit mode; pointer-capture drag updates that point's coordinates live in the store, which re-renders the path immediately. Add/remove vertices via right-click or edge-midpoint +/- controls.
- **Whole-object move**: dragging inside a district body translates all its vertices together; dragging a building rect moves it, with a small corner handle for rotation.
- **Building placement UI**: a "place building" tool — pick a palette item (generic house / named shop / landmark), click the map to drop it (point-in-polygon assigns the owning district automatically), then set name/business type/size via a side-panel form. Existing buildings are click-to-select and editable the same way.
- **Parameter panel**: sidebar with district count slider, wall/river toggles, gate count, seed field + randomize button, and a Regenerate action (confirms before discarding manual edits).

## 5. Project Structure

```
D:\Claude\dnd-map-maker\
  package.json, vite.config.ts, tsconfig.json, index.html
  src/
    main.tsx, App.tsx
    state/
      mapStore.ts        # zustand store: MapScene + params + mode
      history.ts         # optional stretch: simple undo/redo stack
    generation/
      rng.ts             # seeded PRNG (mulberry32) + seeded simplex noise wrapper
      districts.ts       # Voronoi seed scatter + d3-delaunay diagram + clipping
      roads.ts           # radial + edge-following road network builder
      wall.ts            # hull + inset/expand + gate placement
      river.ts           # perturbed bezier/polyline generator
      buildings.ts       # per-district BSP-based building placement
      generateCity.ts    # orchestrates the above into a MapScene
    rendering/
      MapCanvas.tsx       # top-level SVG root, viewBox/zoom/pan
      layers/             # Background, Districts, Roads, Wall, River, Buildings, Labels
      style/              # wobble.ts, filters.tsx, theme.ts
    editor/
      EditableVertex.tsx, EditablePolygon.tsx, EditablePolyline.tsx,
      BuildingPlacer.tsx, SelectionPanel.tsx
    ui/
      ParamPanel.tsx, Toolbar.tsx
    export/
      exportPng.ts        # SVG -> canvas -> PNG blob/download
    shared/
      geometry.ts         # point-in-polygon, centroid, clipping helpers
      types.ts            # MapScene types, kept generic enough for a future DungeonScene
  public/
    fonts/ (optional local font files)
```

Key npm packages: `react`, `react-dom`, `vite`, `typescript`, `zustand`, `d3-delaunay`, `simplex-noise`, `nanoid`. No backend, no routing library.

`shared/geometry.ts`, `shared/types.ts`, and `export/exportPng.ts` are kept generic (operating on generic polygons/polylines, not city-specific names) as the one deliberate hook for a future dungeon generator to reuse — no dungeon-specific scaffolding is built now.

## 6. Build Milestones

1. **M1** — Scaffold Vite+React+TS, render a static hardcoded test SVG (one polygon, one line) to confirm the pipeline works end-to-end.
2. **M2** — Voronoi district generation: seed scatter + `d3-delaunay`, render colored district polygons via `generateCity(seed)`.
3. **M3** — Road network: radial + edge-following secondary streets as plain lines over districts.
4. **M4** — City wall + gates: hull-based wall polygon with gate breaks where roads cross it.
5. **M5** — River/stream: perturbed bezier polyline, layered under roads.
6. **M6** — Styled rendering pass: parchment background, hand-drawn wobble, district hatching, wall crenellation, river texture, fonts/labels.
7. **M7** — Editable vertices/drag interactions: Edit mode toggle, draggable vertices on districts/roads/wall/river, whole-polygon move, add/remove vertex.
8. **M8** — Building generation + placement UI: procedural BSP buildings, manual placement tool with named/business-type side panel, select-to-edit.
9. **M9** — PNG export: SVG-to-canvas-to-PNG download at a large fixed size (e.g. 3000×3000) suitable for World Anvil upload.
10. **M10** — Parameter panel + Regenerate: district count, wall/river toggles, gate count, seed + randomize, Regenerate with confirmation if manual edits exist.

## 7. Verification Plan

- **Per milestone**: run `npm run dev`, open the local dev server in a browser, visually confirm the specific feature (e.g. at M2, N district polygons tile with no gaps/overlaps; at M4, the wall fully encloses all districts with gates aligned to road endpoints; at M7, dragging a vertex updates the path live with no console errors). Treat any console error/warning as a milestone blocker.
- **Determinism check** (M2-M5): reload with the same seed twice, confirm identical layout — validates no accidental `Math.random()` usage.
- **v1 acceptance test** (after M10):
  1. Generate a city with a chosen seed — confirm districts, roads, wall with gates, and a river all render with the styled parchment look.
  2. Switch to Edit mode, drag a road midpoint — confirm it updates live and persists.
  3. Use the building placement tool to add 3 named buildings (e.g. "The Gilded Boar Inn", "Ferrin's Smithy", "Temple of the Dawn") into different districts, each with a visible label.
  4. Click Export PNG, confirm a file downloads at the expected large resolution with all edits reflected and labels legible.
  5. Manually upload that PNG into World Anvil's map feature and confirm it displays correctly (manual step, outside this app).

### Critical files to start with
- [D:\Claude\dnd-map-maker\src\state\mapStore.ts](D:\Claude\dnd-map-maker\src\state\mapStore.ts)
- [D:\Claude\dnd-map-maker\src\generation\generateCity.ts](D:\Claude\dnd-map-maker\src\generation\generateCity.ts)
- [D:\Claude\dnd-map-maker\src\rendering\MapCanvas.tsx](D:\Claude\dnd-map-maker\src\rendering\MapCanvas.tsx)
- [D:\Claude\dnd-map-maker\src\editor\EditablePolygon.tsx](D:\Claude\dnd-map-maker\src\editor\EditablePolygon.tsx)
- [D:\Claude\dnd-map-maker\src\export\exportPng.ts](D:\Claude\dnd-map-maker\src\export\exportPng.ts)
