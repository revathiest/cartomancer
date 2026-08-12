# Decisions

A running log of the non-obvious calls made while building the map editor, and why — so a future request doesn't accidentally undo one without realizing it was deliberate. Newest at the bottom.

## Generation determinism

- **A given seed must always regenerate the exact same city.** District ids are derived deterministically from `(params.seed, index)`, never from a random id generator — building generation seeds each district's own RNG off its district id (`seed ^ hash(districtId)`), so a random id would make the same seed draw different buildings on every regenerate. This was a real regression once (ids were briefly `nanoid()`-based) and was fixed.
- **Every district gets its own independent RNG stream**, seeded from `(seed, districtId)`, rather than one continuous stream threaded across all districts. This is what makes it possible to reproducibly ask "what would procedural generation place at this exact point in this district" — required by lot-conforming placement, landmark-move reflow, and single-district regeneration — without one district's layout shifting because an earlier district in iteration order consumed a different number of random draws.

## Roads

- **`regenerateRoads` must apply the same coastal cleanup as full city generation**: drop `gate` nodes that land in water, and drop `exit` nodes that are in water or point seaward. Originally `regenerateRoads` skipped this, which could leave a road exit stranded inside a waterfront district's own polygon.
- Road edits (dragged nodes, added/removed nodes) persist through district/wall/river edits; "Regenerate roads" is the explicit, confirmed-with-a-prompt action for discarding them and rebuilding from scratch.

## Buildings — general

- **A building's editability depends on its ROLE, never on where it came from.** If you can move, resize, rotate, rename, retype, or delete one building, you can do the same to any other building playing the same role — a hand-placed building and a procedurally generated one are functionally identical once they're on the map. Concretely: the `laneSnapped` lock and the `isLandmark`-driven behaviors apply based on those flags, not on `isCustom`. `isCustom` exists only so the generator knows which buildings are safe to regenerate when a district reflows (roads/density/landmark changes) — it is bookkeeping for the system, not a capability gate for the user.
- **A lane-fitted ("lane-locked") building — whether procedurally generated or hand-placed via "generic" — is geometrically locked.** Its `x/y/w/h/rotation/footprint` are derived from the exact lot it tiles; moving, resizing, or rotating it would desync its drawn footprint from its editable bounding box. Only Name, Type (see below), and Delete remain editable.
- **A hand-placed "generic" building must conform to a real lot**, using the exact same rules procedural generation would (must front a lane, can't sit inside one, must clear corridors/water/walls). If no valid lot exists where the user clicks, placement is silently refused (stays in the Place tool) rather than falling back to a floating rectangle.
- **Clicking an existing building while the Place tool is active selects it instead of stacking a duplicate on top of it** — the placement-capture surface covers the whole canvas, so a click meant to reopen a building (e.g. to name it) would otherwise add a new one on top of it.
- **Deleting a district's landmark reflows that district as if it had never had one** (`district.noLandmark = true`, ordinary lots claim the freed space) rather than leaving a permanent gap.
- **Business-type visual language: color, not labels.** A hand-placed or retyped building is tinted its business type's color (`BUSINESS_COLOR`) instead of getting a name plastered on the map — district names already crowd the map enough. A *named* building additionally gets a small centered number badge; a bottom-right legend (grouped by type, alphabetical within a group) spells out what each badge means. `generic` deliberately has no distinct color — it's meant to blend into its district like an ordinary building.

## Landmarks

- **A landmark's Shape and Type are chosen independently.** Shape (Keep, Temple, Courtyard/O, Hall, Tower, Round, Octagon, U, T, L, Rectangle) determines its silhouette; Type is the same business-type list as any other building (generic, inn, tavern, smithy, shop, market, temple, guild) and only affects its tint/legend entry — a Keep can be flavored as a Guild Hall, etc.
- **"landmark" itself is never an assignable Type** — it's chosen once, up front, via the Place tool's Lane-locked/Landmark mode toggle, and never reappears as an option in the building-edit panel's Type dropdown. Changing an existing landmark's Type to something else (e.g. "inn") also clears its `isLandmark` flag — it stops behaving like a landmark (no more Shape field, no more district-reflow-on-move) the moment it's relabeled away from one.
- **A landmark is placed freely** (not lot-conforming) and stays movable/resizable/rotatable afterward — unlike a lane-locked building, it has no lot to desync from.
- **Moving, resizing, or rotating a landmark reflows its district's ordinary (procedural, non-landmark) buildings around its new footprint** — lots it now overlaps clear out, lots it vacated may fill back in — while replaying the exact same per-district RNG stream, so every OTHER lot's subdivision and fill roll lands exactly where it already was. Only what the landmark's footprint excludes changes; lanes and unrelated buildings are untouched.
- Placing a landmark **stays in the Place tool** afterward (placing several landmarks, or trying different shapes, in a row is a normal workflow); placing a lane-locked building still hands off to the Select tool, since that's normally a one-off "add it, then immediately name/edit it" action.

## UI structure

- **Each tool's options live in its own dedicated sidebar panel** (Districts, Roads, Place), matching the existing pattern — not crammed into the top toolbar, which is easy to miss and has no room to grow. The Place panel resolves *what* will be dropped (Lane-locked type, or Landmark type + shape) entirely before the user clicks a location on the map.
