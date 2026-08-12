# Cartomancer User Guide

A complete reference for every button, slider, and option in the app. If you're just
getting started, read the **Quick Start** section first — everything else is here for when
you want to know exactly what a specific control does.

## Contents

- [Quick start](#quick-start)
- [Toolbar (always visible)](#toolbar-always-visible)
- [Generate mode](#generate-mode)
  - [City & Layout](#city--layout)
  - [Population](#population)
- [Edit mode](#edit-mode)
  - [Select tool](#select-tool)
  - [Districts tool](#districts-tool)
  - [Roads tool](#roads-tool)
  - [Place tool](#place-tool)
- [Merging buildings](#merging-buildings)
- [Saving, loading, and exporting](#saving-loading-and-exporting)
- [Reporting a bug](#reporting-a-bug)
- [Reference: building types, shapes, and district types](#reference-building-types-shapes-and-district-types)
- [Keyboard shortcuts](#keyboard-shortcuts)

---

## Quick start

1. In **Generate** mode, set a city name and seed, adjust the sliders to taste, and click
   **⟳ Regenerate**.
2. Switch to **Edit** mode to hand-tune anything: drag districts and roads, place named
   buildings, merge adjoining buildings into one, rename things.
3. Click **⬇ Export PNG** to save a full-resolution image of the map, or **💾 Save** to save
   your work as a file you can reopen later with **📂 Load**.

Every generated map is **deterministic**: the same seed and settings always produce the
exact same city. Change the seed (or click the 🎲 button) to get a different layout without
changing anything else.

---

## Toolbar (always visible)

The bar across the top is always visible, in both Generate and Edit mode.

| Control | What it does |
|---|---|
| **Generate** / **Edit** | Switches the app's mode. Generate mode is for setting overall city parameters and regenerating; Edit mode is for hand-editing the map directly. Switching modes clears your current selection. |
| **Select / Districts / Roads / Place** | Only shown in Edit mode. Chooses which editing tool is active — see [Edit mode](#edit-mode) below for what each one does. |
| **↶ / ↷ (Undo / Redo)** | Steps backward/forward through your edit history. Greyed out when there's nothing to undo/redo. Almost every action — dragging, typing, toggling — is a single undo step. |
| **👥 ≈ N** | Shows the estimated population of the city. Hover it to see the size classification (e.g. hamlet, town, city). This is just an estimate for flavor — see [Population](#population) for how it's calculated. |
| **District fills: on/off** | Purely visual — toggles the colored background tint under each district. Doesn't change anything about the map itself. |
| **💾 Save** | Saves your entire map — including every hand edit — to a file you can load again later. See [Saving, loading, and exporting](#saving-loading-and-exporting). |
| **📂 Load** | Opens a previously saved map file, replacing everything currently on screen. Asks for confirmation first if you have unsaved changes. |
| **⬇ Export PNG** | Renders the map at high resolution (3000×3000 pixels) and saves it as an image — the edit handles and selection outlines are stripped out first, so it looks clean. |
| **🐛 Report Issue** | Opens a pre-filled bug report on GitHub with your browser and current city settings already filled in, so you don't have to type them out. See [Reporting a bug](#reporting-a-bug). |

---

## Generate mode

Generate mode has two sections in the sidebar: **City & Layout** settings, and a
**Population** estimate at the bottom.

### City & Layout

**Generation**

| Control | Range | Default | What it does |
|---|---|---|---|
| **City name** | text | — | Just a label — used in the map's title banner and in Save/Export file names. |
| **Seed** | any whole number | — | The single number that determines the entire city layout. Same seed + same settings = same city, always. Type a specific number, or click the 🎲 button for a random one. |
| **Districts** | 5 – 28 | 12 | How many districts (neighborhoods) the city is divided into. |

**Building layout (all districts)**

These settings apply to every district at once. You can override any of them for an
individual district in **Edit → Districts** (see below) — that per-district value takes
priority over the citywide one here.

| Control | Range | Default | What it does |
|---|---|---|---|
| **Lane spacing** | 1.5× – 4.5× | 2.6× | How far apart the interior lanes (footpaths between buildings) are spaced, as a multiple of a typical building plot. Higher = larger blocks with more buildings packed between lanes. |
| **Lane width** | 2 – 22 | 7 | How wide the walkway/gap is between blocks. |
| **Building spacing** | 0 – 8 | 1.5 | The gap left between neighboring buildings within a block. |
| **Building density** | 0.5× – 1.8× | 1× | A global multiplier on how tightly buildings are packed into each block. |
| **City wall** | on/off | on | Adds or removes the wall around the city core. Toggling this reflows buildings immediately (removing the wall frees up the land it used to occupy, and vice versa). |
| **River / stream** | on/off | on | Adds or removes a river running through the city, with bridges where roads cross it. |
| **River width** | 8 – 80 | 30 | Only shown when the river is on. How wide the river is drawn. |
| **Coast (open water)** | on/off | off | Adds a coastline (open sea or a bay) along one edge of the map, with waterfront districts (docks, shipyards, etc.) gravitating toward it. |
| **Water** | Open sea / Bay | Open sea | Only shown when Coast is on. Open sea is a straight shoreline; Bay curves inland. |
| **Side** | N / E / S / W | W | Only shown when Coast is on. Which edge of the map the coastline sits on. |
| **⟳ Regenerate** | button | — | Rebuilds the entire city from scratch using the current settings and seed. If you've made hand edits in Edit mode, this discards them (you'll be asked to confirm first). |

> **Note:** Wall and River toggles take effect immediately. Coast changes only apply the
> next time you click Regenerate.

### Population

Shown below City & Layout, always visible in Generate mode.

| Control | Range | Default | What it does |
|---|---|---|---|
| **Population total** | read-only | — | An estimate based on building count, size, use, and district type, with an average number of residents assumed per inhabited building. It's flavor, not a strict simulation. |
| **Target population** + **Match** | any number | — | Type a population you want the city to have, then click **Match**. The app searches different combinations of district count and building density to find the closest match, then regenerates the city with that combination. This discards hand edits (with a confirmation first). If it can't get exactly to your target, it tells you what it found and why (e.g. it hit the maximum district count). |
| **Crowding** | 0.5× – 2× | 1× | A pure population-estimate multiplier — it does **not** change the map or add/remove any buildings, only the number shown for population. Use it to represent a city that's more/less densely inhabited than its building count alone would suggest. |
| **Population by district type** | read-only table | — | Breaks the population estimate down by district type, showing building count and estimated people for each. |

**General rule of thumb:** population goes up by adding more districts, raising a
district's density, or raising crowding. Slum districts pack in the most people per
building; noble and civic districts the fewest.

---

## Edit mode

Edit mode has four tools, switched via the toolbar: **Select**, **Districts**, **Roads**,
and **Place**. Only one is active at a time, and it determines both what's shown in the
sidebar and how clicking on the map behaves.

### Select tool

The default tool. Click anything on the map — a building, a road, or the river — to select
it and see its details in the sidebar.

| Control | What it does |
|---|---|
| **Select only: All / Buildings / River** | Restricts what a click on the map can grab. Useful when things overlap and you keep selecting the wrong one. Roads can always be clicked regardless of this setting. |

**When a building is selected**, you'll see:

| Control | What it does |
|---|---|
| **Name** | A label for the building, shown as a legend number on the map if it's a district's landmark. |
| **Type** | The building's business type (generic, inn, smithy, temple, shop, tavern, market, guild). See [reference table](#reference-building-types-shapes-and-district-types) below. |
| **Shape** | Only shown for landmark buildings. Sets the footprint silhouette — see [reference table](#reference-building-types-shapes-and-district-types). |
| **🔗 Merge with adjacent building** | Only shown for lane-locked buildings (see [Merging buildings](#merging-buildings) below). |
| **Width / Height / Rotation** | Only shown for freely-placed buildings (landmarks and hand-placed non-generic buildings) — lane-locked buildings are fit to a real plot and can't be resized or rotated. Width and Height range 16–200; Rotation is −180° to 180°. |
| **🗑 Delete building** | Removes the building entirely. |

> Lane-locked buildings (the ones generated automatically, and any hand-placed "generic"
> building) are fitted precisely to a real building lot and can't be moved, resized, or
> rotated — only merged with a neighbor or deleted. Landmarks and other hand-placed
> buildings are free-standing and can be dragged, resized, and rotated freely.

**When a road is selected**, you'll see its kind (main road / side street) and a
**🗑 Delete street** button. Reshape roads using the **Roads tool** instead of here.

**When the river is selected**, drag a handle on the map to reroute it, click the small
square marker at the midpoint of a segment to add a new bend, or right-click a handle to
remove it. Bridges update automatically to stay wherever a road crosses the river.

### Districts tool

Click a district's circular marker on the map to select it and edit its details.

| Control | What it does |
|---|---|
| **＋ Add district** | Adds a new residential district near the center of the map, then re-tessellates all district boundaries around it. |
| **Drag a district marker** | Moves that district's center point. On release, the entire city's district boundaries, roads, wall, river, and buildings are rebuilt around the new position — your hand-placed custom buildings are preserved. |
| **Name** | A label for the district, shown on the map. |
| **🗑 (delete)** | Removes the district. Disabled once you're down to 3 districts (the generator needs at least that many). |
| **Type** | Which of the 17 district types this is — see [reference table](#reference-building-types-shapes-and-district-types). Changing it re-rolls that district's buildings immediately. |
| **Size (area)** | 0.4× – 3×, default 1×. How much territory this district claims relative to its neighbors when boundaries are recalculated. |
| **Density** | 0.2× – 4×, default 1×. This district's own building density multiplier (overrides the citywide "Building density" setting for just this district). |
| **Building size** | 0.5× – 2×, default 1×. Scales this district's building footprints up or down. |
| **Lane spacing** | 1.5× – 4.5×, default 2.6×. Per-district override of the citywide Lane spacing setting. |
| **Lane width** | 2 – 22, default 10. Per-district override of the citywide Lane width setting. |
| **Building spacing** | 0 – 8, default 1.5. Per-district override of the citywide Building spacing setting. |
| **Walled** | on/off, default off. Encloses just this one district in its own inner wall, with gates automatically added wherever a road crosses it — independent of the citywide wall. |

### Roads tool

Roads are made of **nodes** (intersections, dead-ends, plazas, gates) connected by
**streets**.

| Control | What it does |
|---|---|
| **New node type: Junction / Exit / Plaza** | Chooses what kind of node the next "Add node" click creates. Junction is an ordinary intersection or bend; Exit is a road-end that leads out of the map; Plaza is a larger hub/square. (Gates aren't chosen here — they're created automatically wherever a street crosses the wall.) |
| **＋ Add {type} node** | Drops a new node of the chosen type near the center of the map. |
| **🔗 Connect nodes** | Toggles connect mode. While active, click two nodes in a row on the map to draw a street between them. If that street crosses the wall, a gate is automatically inserted at the crossing point. Click a further node afterward to keep chaining connections without re-toggling. |
| **Drag a node** | Moves it. Buildings along that road refit to the new path on release. |
| **Selected node type** | If a non-gate node is selected, lets you change its type after the fact. Gate nodes show "Gate (automatic)" instead — delete the gate to close up the wall there. |
| **Selected street: Main road (wide) / Side street (narrow)** | Changes the width/prominence of a selected street. |
| **🗑 Delete selected node/street** | Removes whichever is currently selected. |
| **⟳ Regenerate roads** | Rebuilds the *entire* road network from scratch based on the current districts, discarding all manual road edits. Normally not needed — road edits now survive district moves and resizes — but useful if you want to start the road layout over completely. Asks for confirmation first. |

> Streets can never be routed across open water, and connecting across the city wall
> always opens (or reuses) a gate automatically.

### Place tool

Configures what the *next click on the map* will create.

| Control | What it does |
|---|---|
| **Kind: Lane-locked / Landmark** | Lane-locked buildings fit into a real plot along a lane, just like generated buildings, and can't be moved or resized afterward. Landmarks are placed freely wherever you click and can be dragged, resized, and rotated like any other free-standing building. |
| **Type** (Lane-locked) | generic, inn, tavern, smithy, shop, market, temple, or guild. Choosing **generic** requires clicking on an actual valid lot along a lane — the click is silently ignored if you click somewhere that isn't a real building plot. Any other type places a plain movable rectangle wherever you click, no lot required. |
| **Type** (Landmark) | Same list, used for flavor/labeling only — a landmark doesn't need to sit on a real lot regardless of type. |
| **Shape** (Landmark only) | The footprint silhouette for the new landmark — see [reference table](#reference-building-types-shapes-and-district-types). |
| **Click on the map** | Places a new building of the configured kind/type/shape at that spot (or does nothing, if you chose generic lane-locked and clicked somewhere invalid). Clicking on an *existing* building selects it instead of placing a new one on top. Placing a landmark keeps you in the Place tool (so you can drop several in a row); placing anything else switches you to the Select tool afterward so you can immediately fine-tune it. |

---

## Merging buildings

Two adjacent lane-locked buildings (generated buildings, or hand-placed "generic"
buildings) that share a wall can be merged into a single, larger building — useful for
turning several small shops into one big inn, guildhall, or manor.

1. Switch to the **Select tool** and click one of the two buildings.
2. In the sidebar, click **🔗 Merge with adjacent building**. The cursor changes to a
   crosshair over other lane-locked buildings.
3. Click the **adjacent** building you want to merge it with. If they genuinely share a
   wall, they're combined into one building shaped to fill the space between them exactly
   (closing the small gap that's normally left between neighboring buildings).
4. If the merge can't be done — the buildings aren't actually next to each other, they're
   in different districts, or one of them isn't lane-locked — you'll see a message
   explaining why, and you can try a different building instead.
5. To back out without merging anything, click the **Cancel merge** button, click the same
   building you started from, or press **Escape**.

You can merge more than two buildings by repeating the process on the result — merge A
into B, then merge that combined building into C, and so on.

If a merge attempt fails for a geometry-related reason (not because the buildings simply
aren't adjacent), technical details are automatically recorded on your device. If you hit
one of these, please [report it](#reporting-a-bug) — the report includes a note of how many
were recorded, which helps track the bug down.

---

## Saving, loading, and exporting

| Action | File produced | Notes |
|---|---|---|
| **💾 Save** | `<city-name>.dndmap.json` | Captures the *entire* map exactly as it is — every generated element and every hand edit — so loading it later restores your work precisely, not just the generation settings. |
| **📂 Load** | reads a `.dndmap.json` file | Replaces everything currently on screen. You'll be asked to confirm first if you have unsaved changes. Files from a newer version of the app than you're running, or files that aren't a Cartomancer save, are rejected with a clear error message rather than loaded incorrectly. |
| **⬇ Export PNG** | `<city-name>-map.png` | A clean, high-resolution (3000×3000px) image of the map with all editing handles and selection outlines removed — ready to drop into World Anvil, a VTT, or anywhere else. |

On browsers that support it (Chromium-based ones — Chrome, Edge, Brave, etc.), **Save** and
**Export PNG** open a native "Save As" dialog so you can choose exactly where the file
goes. On browsers without that support (Firefox, Safari), the file downloads to your
browser's normal downloads folder instead.

---

## Reporting a bug

Click **🐛 Report Issue** in the toolbar. This opens a new tab to a pre-filled bug report on
GitHub with your browser, window size, and current city settings (seed, district count, and
all the layout sliders) already filled in — you just need to describe what happened and,
ideally, the steps to reproduce it. Nothing is sent automatically; you review the report
and submit it yourself on GitHub.

---

## Reference: building types, shapes, and district types

**Business types** (selectable on any hand-placed building): generic, inn, smithy, temple,
shop, tavern, market, guild.

**Landmark shapes** (selectable only on landmark buildings): Keep (towers), Temple (apse),
Courtyard (a shape with a central open square), Hall (pitched ends), Tower (round),
Round, Octagon, U-shaped, T-shaped, L-shaped, Rectangle.

**District types**, grouped by where they appear:

- **Inner / walled-core** (always inside the city wall): Castle, Noble, Temple, Market,
  Residential, Slum, Industrial.
- **Outer / sprawl** (always outside the wall): Suburb, Docks, Shanty, Farmland, Cemetery,
  Tannery, Fairground.
- **Waterfront** (a subset of the outer types that hug the coastline when Coast is
  enabled, and get physical piers if the type is Docks, Fishmarket, or Shipyard):
  Docks, Fishmarket, Shipyard, Warehouse.

Each district type has its own typical building shapes and its own population density —
Castle districts favor keep-shaped landmarks, Temple districts favor apse-shaped ones, and
so on; Slum districts pack in the most residents per building, Noble and civic districts
the fewest.

---

## Keyboard shortcuts

These work anywhere except while typing in a text field.

| Shortcut | Action |
|---|---|
| **Delete** / **Backspace** | Delete whatever's currently selected. |
| **Escape** | Cancel an in-progress building merge, and clear the current selection. |
| **Ctrl/Cmd + Z** | Undo. |
| **Ctrl/Cmd + Y** or **Ctrl/Cmd + Shift + Z** | Redo. |
