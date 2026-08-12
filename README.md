# DnD City Map Maker

An interactive, client-side tool for generating and editing fantasy **city maps** for
tabletop RPGs (D&D etc.), styled to look hand-drawn on parchment and exportable as a
large PNG for upload to World Anvil or any VTT.

> Scope: **city maps only.** A separate dungeon-map generator is planned but deliberately
> out of scope here (see `../dnd-map-maker/PLAN.md`).

## Quick start

```bash
npm install
npm run dev      # local dev server (Vite)
npm run build    # type-check + production build to dist/
npm run lint     # oxlint
```

Open the dev URL (default http://localhost:5173).

## What it does

- **Procedural generation** (deterministic from an integer seed):
  - Voronoi **districts** (`d3-delaunay`) scattered by Poisson-disc sampling, typed
    (castle / noble / temple / market / residential / slum / industrial) with a central bias.
  - **Roads** that follow district borders — radial primaries routed gate→centre via
    Dijkstra over the Voronoi edge graph, plus probabilistic secondary streets.
  - A **city wall** tracing the district boundary, with gates, so it always encloses the city.
  - A perturbed **river** with bridge markers where roads cross it.
  - Per-district **buildings** via BSP subdivision, density controlled by district type.
- **Styled rendering** in SVG: parchment background + grain + vignette, hand-drawn wobble,
  district hatching, crenellated wall, gradient river, medieval-styled labels, compass rose,
  scale bar, and a city-name banner.
- **Editing** (Edit mode): drag vertices of districts/roads/wall/river, move whole districts
  and buildings, add/remove road vertices, place named buildings (inns, smithies, temples,
  landmarks…), rename districts, undo/redo, zoom/pan.
- **PNG export** at 3000×3000 (SVG → offscreen canvas → PNG download), with edit handles
  stripped from the output.

## Workflow

1. In **Generate** mode, set the city name, seed, district/gate counts, wall/river toggles,
   and building density, then **Regenerate**.
2. Switch to **Edit** mode to fine-tune: drag geometry, place and name buildings.
3. **Export PNG** and manually upload the image into World Anvil's map feature.

## Project layout

```
src/
  state/        zustand store (single MapScene source of truth) + undo/redo history
  generation/   rng, districts, roads, wall, river, buildings, generateCity (orchestrator)
  rendering/    MapCanvas (SVG root, zoom/pan) + layers/ + style/ (theme, wobble, filters)
  editor/       editable vertices/polygons/polylines, building placer, selection panel
  ui/           Toolbar, ParamPanel
  export/       exportPng (SVG → canvas → PNG)
  shared/       geometry helpers + MapScene types (kept generic for a future dungeon tool)
```

`shared/geometry.ts`, `shared/types.ts`, and `export/exportPng.ts` are intentionally generic
(they operate on plain polygons/polylines) so a future dungeon generator can reuse them.

## Notes

- All generation is seeded (`mulberry32` + seeded simplex noise); the same params always
  reproduce the same city. The only `Math.random()` use is the seed **randomize** button.
- The parchment background has a marked SWAP POINT in `rendering/layers/Background.tsx` for
  dropping in a real texture image later.
- Medieval fonts load from Google Fonts when online; otherwise the map falls back to a serif
  stack (still fully legible, including in the exported PNG).
