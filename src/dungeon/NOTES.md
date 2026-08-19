# Dungeon tool — requirements & decisions log

Running log of what's been asked for and decided, so work can resume across
sessions without losing context. Update this as requirements evolve.

## Status legend
- ✅ done and verified
- 🚧 in progress / partially done
- ⏳ decided, not yet implemented
- ❓ open question

## Core generation
- ✅ BSP room+corridor layout, grid-based pathfinding so corridors never cut
  through an unrelated room's floor (`generateDungeon.ts`).
- ✅ Corridor rectangles merged into full 2D runs (not per-cell strips) so the
  "rough" hand-drawn filter doesn't turn them into a ladder-rung mess.
- ✅ **Touching/adjacent corridor pieces fused into one outline** (2026-08-18):
  even after the 2D-run merge above, an L-bend or a loop shortcut still left
  multiple rectangles meeting at a seam, each stroked independently — visible
  border where two pieces of the "same" hallway met. Fixed by unioning every
  corridor rect for the whole generated dungeon via `unionPolygonsRobust`
  (`shared/geometry.ts` — the same Clipper-based robust union the city tool
  uses to fuse adjacent lots), memoized in `DungeonCanvas.tsx`, then stroking
  only the resulting merged ring(s) as `<path>`. A fully-connected corridor
  network reads as one hallway with a single outline; genuinely separate
  connections (that don't physically touch) correctly stay separate shapes.
- ✅ Default corridor width changed from 2 to 1 cell — hallways read as
  passageways, not wide boulevards.
- ✅ Parchment/road styling matching the city tool (rooms = stone, corridors =
  road palette).
- ✅ Lock/randomize checkboxes per generation slider; all locked by default.
  Locking only blocks auto-randomize on Generate — manual dragging always
  works regardless of lock state.
- ✅ One-click random-seed generate + "Reroll Encounters" (keeps layout,
  rerolls monster/loot notes only, via a separate `encounterSeed`).

## Party / encounters
- ✅ Party level (1–20) and party size (1–8) sliders — drive monster CR range
  and headcount.
- ✅ Per-room note: monster group(s) description (e.g. "3 CR2 monsters and a
  CR4 monster") + optional loot-table tier pointer (not an actual item roll).
- ✅ "Chance of monsters in a room" and "Chance of a loot hoard" are **separate
  sliders** (previously conflated into one).
- ✅ Loot is NOT flat-independent of monsters: an unguarded room's effective
  loot chance is scaled down (×0.3) vs a monster-occupied room's — hoards are
  much more likely guarded than sitting out alone.
- ✅ Room notes shrink-to-fit within the room (canvas-measured) and are
  hard-clipped to the room rect so text can never spill past the walls.

## Doors — full rewrite done (2026-08-14)
- ✅ Doors are positioned exactly on the room/corridor wall boundary (the
  midpoint between the last room cell and first non-room cell along the
  path).
- ✅ **New door model**, replacing the old mutually-exclusive `state` enum.
  Every flag is independent and combinable (verified in-browser: found a door
  with secret + locked + trapped + stuck all active at once, rendering all
  four icons correctly):
  - `open: boolean` — forces `stuck=false`, `locked='none'`, `trapped='none'`
    when true (an open door can't also be locked/trapped/stuck). Still
    combines with `secret`.
  - `secret: boolean`
  - `stuck: boolean`
  - `locked: 'none' | 'mundane' | 'magical'`
  - `trapped: 'none' | 'mundane' | 'magical'`
  - Roll weights (in `rollDoorFlags`, `generateDungeon.ts`): open 15%, secret
    6%, stuck 10%, locked none/mundane/magical 70/22/8, trapped
    none/mundane/magical 85/10/5. All independent rolls (not TBD anymore —
    picked reasonable defaults; adjust if they feel off in play).
- ✅ **Icon style — segmented capsule** (2026-08-18, workshopped via a 4-style
  Artifact comparison — branded plate / segmented capsule / layered stack /
  banner pennants — picked after two rounds of size feedback on the winner):
  the door itself IS a capsule, split into one colored segment per active
  flag, fused edge to edge (not floating badges beside the door). A plain
  door is a single ink segment. Capsule is fixed at `CAPSULE_LEN=18` /
  `CAPSULE_THICK=8` world units (stays inside the default 20-unit corridor
  width); icon scale steps down slightly as more segments pack in (1.3× for
  one flag, 1.0× for two, 0.8× for three) rather than growing the capsule
  past the doorway. Glyphs are bold silhouettes in parchment on top of each
  segment's color — a real keyhole shape (circle + tapered body) for locked,
  a triangle with a bold "!" for trapped, a thick rounded X for stuck.
  Colors are bold/saturated on purpose, not the muted wall/ink tones the rest
  of the map uses: `MUNDANE_COLOR = #a5691f` (bronze), `MAGICAL_COLOR =
  #7c3aed` (violet), `STUCK_COLOR = #8b3a2f` (rust) — three-way distinguishable
  by color AND shape. Open doors keep the separate swung-open glyph (a line
  hinged at the wall, angled into the room, plus a faint swing arc — fades/
  dashes when combined with secret). Legend rewritten to match: one row per
  flag, each rendered via the exact same `DoorCapsule` component the map
  uses, so it can never drift out of sync.
- ✅ **Open and secret are mutually exclusive** (2026-08-18 correction): an
  open door is demonstrably not hidden, and a secret door is by definition
  closed. `rollDoorFlags` only rolls `secret` in the non-open branch now;
  `OpenDoorGlyph` dropped its dead `secret` parameter entirely.
- ✅ **Real wall gaps, not a color-patch hack.** First attempt at fixing "the
  wall line shows through open/secret door glyphs" was a flat-colored patch
  rect drawn on top — user feedback: "looks like garbage," obscured wall
  that should've stayed visible, obscured room background, wrong color
  entirely. Fixed properly instead: `RoomShape` in `DungeonCanvas.tsx` draws
  each room's outline as real line segments per side (top/bottom/left/right)
  with an actual gap cut out wherever a door sits on that wall — computed via
  `subtractIntervals`, one call per side, gap width `DOOR_GAP_HALF=10` on
  each side of the door's position. No patch needed for the closed/capsule
  case either (removed `DoorWallPatch` entirely) — verified via DOM query
  that zero wall-line segments pass through any door position (both capsule
  and open-glyph doors), across a real generated map. Corridor-side lines
  aren't gapped (would require cutting into the Clipper-merged polygon,
  which wasn't necessary in practice — the room-side gap eliminated the
  visible problem).
- ✅ **Entrance is a real door, not hardcoded to "always open."** First pass
  just drew an `OpenDoorGlyph` at the entrance room's outer wall unconditionally
  — user caught it: "if a door is open, how is it locked and/or trapped?"
  Fixed: the entrance now gets its own `rollDoorFlags(rng)` roll and is
  pushed into the same `doors` array as every interior door (in
  `generateDungeon.ts`, right after `findEntrance`), positioned at the
  midpoint of whichever wall (`entranceSide`) faces the grid boundary. It
  renders through the exact same `DoorMark` component as any other door, so
  it can come up locked, trapped, stuck, or secret exactly like an interior
  door — no special-casing in the renderer at all anymore.
- ✅ **Badge text vertical centering** (2026-08-19): the ENTRANCE/BOSS badge
  label sat visibly high in its pill. `dominantBaseline="middle"` doesn't
  reliably center in every renderer/font combination (MedievalSharp's
  metrics apparently push it up) — switched to `dominantBaseline="central"`
  in `RoomBadge`, verified via `getBBox()` that the text's vertical center
  now matches the badge rect's center to within floating-point noise.
- ✅ **Z-order: door markers now draw on top of the entrance/boss outline**
  (2026-08-19). `RoomBadge`'s colored room-outline rect was rendered AFTER
  doors, so it visually covered any door sitting on that room's boundary.
  Moved the badge render to right after the room/corridor group and before
  `{doors.map(...)}`, so doors always draw on top regardless of which room
  they're on.
- 🚧 **"At most one door per hallway/room pair"** (2026-08-19, new rule).
  Two contributing causes identified and fixed:
  1. `addLoops` could connect a room pair that the spanning tree (`connectTree`)
     already connected directly — a straightforward duplicate. Fixed: `addLoops`
     now builds a `connected` set from the tree's `edges` first and skips any
     pair already in it.
  2. The bigger cause: separate corridors (different tree edges, or a tree
     edge and a loop) could physically touch or run alongside each other
     even between DIFFERENT room pairs, and the corridor-union rendering
     (see above) then fuses them into one blob — making a room's two
     genuinely-different doors look like they both open onto "the same
     hallway." Fixed by having every successful `connect()` call mark its
     corridor's footprint PLUS a 1-cell buffer as occupied
     (`markCorridorOccupied`, sentinel value `-4` in the owner grid); later
     `connect()` calls treat that as impassable, so distinct corridors get a
     genuine gap and can't fuse. To avoid ever breaking full connectivity,
     `findPath` first tries a route that respects the buffer, and only falls
     back to one that may touch existing corridors if no buffer-respecting
     route exists at all (`connect()`'s `findPath(...) ?? findPath(..., true)`).
  - **Verified, not just assumed:** a DOM-based check (group doors per room
    by which rendered corridor `<path>` they land in, via `isPointInFill`,
    flag any room with 2+ doors landing in the same path) went from
    violations in ~8 of 12 random generations (some with 20+ duplicate
    doors) down to 0 in most runs, with rare small residuals (1-2 duplicate
    doors) in a minority of runs — almost certainly natural corridor
    junctions near a room rather than a leftover bug. Room/corridor overlap
    was independently re-verified at 0 via point-sampling (not just bbox)
    to confirm the buffer logic didn't reintroduce the overlap bug from
    earlier in the session.
  - Not chased further this session: eliminating that last residual would
    mean giving loop connections (or even tree edges) a stricter "never
    join a room already fed by a corridor that becomes part of the same
    fused network" rule, which risks connectivity fragility for a cosmetic
    edge case. Flagging for a future pass if it turns out to matter more
    than expected once actually played with.
- ✅ **Two real regressions found and fixed while chasing the above**
  (2026-08-19), both caught by the user actually looking at the map, not by
  my own testing:
  1. **Orphaned, doorless hallway fragments.** The buffer fix's fallback path
     (used when no buffer-respecting route exists) was allowed to CROSS
     another corridor's claimed territory for pathfinding, but `widenPath`
     still refused to draw floor on those cells — so the path was graph-valid
     (an edge got recorded, doors got placed) while the rendered geometry had
     a hole in it, leaving a disconnected floor fragment with no door.
     Fixed: `widenPath` now takes the same `allowOccupied` flag the
     successful `findPath` pass used, so rendering is always consistent with
     the path that was actually taken. Also had to fix door placement
     alongside it — the naive "any ownership change" check would otherwise
     place a spurious door at a free↔occupied boundary (corridor floor
     meeting more corridor floor, not a wall); replaced with a `roomOf()`
     normalization so only a transition into/out of an ACTUAL room counts.
  2. **A whole room fully covered by corridor fill.** Independent, likely
     pre-existing bug (not caused by today's changes) — when corridors wrap
     around a room (which the user confirmed is fine and even desirable),
     Clipper's union correctly returns that as an outer ring plus a
     hole-ring for the room. The renderer drew every ring from
     `unionPolygonsRobust` as its own independently-solid-filled `<path>`,
     so the hole-ring painted solid corridor color right over the room.
     Fixed: combined all rings into ONE `<path>` with `fillRule="evenodd"`,
     which correctly treats alternating-winding rings as holes while still
     rendering genuinely separate (non-overlapping) corridor networks as
     independent solid shapes.
  - Verified via `getBBox()`/`isPointInFill` point-sampling across 15+
    generations at high density (up to 50 rooms, 100×100 grid, 40% loop
    chance): 0 orphaned fragments, 0 room/corridor overlap, in every run.
- ✅ **Long wraparound hallways** (2026-08-19) — a direct side effect of the
  corridor-buffer fix above: once corridors start claiming territory, a
  LATER connection sometimes has to detour a long way around already-claimed
  space even when its two rooms are close together. Fixed with two changes,
  per user's explicit direction ("tree edges skip the buffer, loops get
  capped"):
  1. `connectTree` (required, spanning-tree edges) now always uses
     `respectBuffer: false` — a required connection is never distorted or
     forced into a long detour just to avoid touching another corridor. It
     still marks its own corridor as occupied afterward, so loops routing
     later still avoid it.
  2. `addLoops` (optional shortcuts) keeps `respectBuffer: true`, but now
     ALSO discards the connection outright if the actual routed path is
     more than `loopMaxDetour` times the straight-line cell distance between
     the two rooms — a "shortcut" that winds halfway around the map isn't a
     shortcut. New slider: **Loop max detour** (range 1.5–6×, default 3×,
     lockable/randomizable like the others). Answered user's question on
     impact of setting it too low: no safety/connectivity risk either way
     (tree edges are unaffected), just makes `loopChance` feel like it's
     doing nothing since nearly every candidate loop gets vetoed by too
     tight a cap.
  - Verified visually and via the same overlap/orphan checks at high
    density (100×100 grid, depth 8, 40% loop chance): corridors read as
    direct connections between neighboring rooms in every generation
    checked, no sprawling wraparound routes, 0 overlap/orphan regressions.
- ❓ Still open / worth revisiting later: are the roll weights in
  `rollDoorFlags` actually good defaults? Should `secret` door flags
  (locked/trapped/stuck) be hidden from the DM-facing map until "found", or
  is showing everything upfront (current behavior — this is a DM reference
  tool, not player-facing) right?

## Map chrome
- ✅ Door legend, collapsible, rendered as part of the map itself (pure SVG,
  anchored in world coordinates like the city's building legend) so it pans
  and scales with zoom instead of sitting fixed as a screen overlay.
- ✅ **Legend reservation** — a grid-cell rectangle at the bottom-right corner
  (sized to the legend's EXPANDED footprint, `legendLayout.ts`, regardless of
  its current collapsed/expanded runtime state) is marked off-limits before
  any room is placed or corridor is routed. Verified across 12 randomized
  generations (3 to 63 rooms) with zero legend/room/corridor overlaps in
  every case.

## Dungeon entrance & boss room — done (2026-08-14)
- ✅ **Entrance room**: the room closest to the outer edge of the grid (min
  distance to any boundary). Outlined + labeled "ENTRANCE" on the map.
- ✅ **Boss room**: the room with the greatest corridor-hop distance from the
  entrance (BFS over a room-adjacency graph built from every successful
  `connect()` call — tracked as `edges` through `connectTree`/`addLoops`).
  Gets a guaranteed strong encounter (`generateBossEncounter` in
  `encounters.ts`: one monster at CR = party level + 3, plus escort monsters
  at party-level-ish CR if party size ≥ 3) and guaranteed loot at that CR's
  tier — this overrides the normal random roll for that one room only, both
  on full generate and on "Reroll Encounters" (which preserves which room is
  boss, since that's a layout property, not a content-reroll property).
  Outlined + labeled "BOSS" on the map.
- Verified present in every test generation, including tiny 3-4-room ones.

## Future ideas (raised, not yet scoped)
- ❌ **Alternate map "themes" — tried and reverted** (2026-08-19). Built a pure
  rendering-only "cave" toggle (`mapTheme: 'dungeon' | 'cave'` in the store,
  zero changes to generation): earthier gray-brown palette, room/corridor
  outlines pushed through the existing `wobblePath` hand-drawn-line utility.
  Bug found during review: room fill was wobbled as one closed-loop pass and
  the wall segments were wobbled as separate independent passes, so the two
  didn't share the same perturbed points and could visibly diverge — user
  caught this as "wobble in the walls opposite to the wobble in the
  background, or room fill." Before that was fixed, user decided against the
  reskin outright ("I'm not convinced on this reskin" / "remove the cave
  mode. I dont like it.") — reverted in full: store state, param panel
  toggle, and all cave-specific rendering code removed from
  `DungeonCanvas.tsx`. Back to a single dungeon rendering style.
  - If a cave/alternate-theme look is revisited later, the open framing
    question from the original discussion still applies: a straight visual
    reskin of the rectangular BSP layout doesn't really read as a cave no
    matter how well the wobble is done — a convincing cave probably needs a
    genuinely different generation algorithm (e.g. cellular automata),
    which is a separate generator to build, not a rendering tweak.

## Multiple generator "modes" (2026-08-19)
User's stated direction: three map styles, each needing its OWN generator
(not a shared algorithm with a rendering toggle, unlike the cave attempt
above) because the geometry itself differs:
- **Catacombs** — the existing BSP generator (rectangular rooms, straight
  corridors). Kept as-is; this is what "Dungeon" mode already is. Fits the
  theme because BSP naturally produces built/planned-looking structure —
  same reasoning extends to prisons, vaults, timbered mines, sewers.
- **Keep** — a tightly-packed building: no dead space, cohesive full-footprint
  tiling instead of BSP's leftover gaps. Still rectangular rooms. Not started.
- **Cave** — irregular caverns joined by tunnels, needs a genuinely different
  algorithm (e.g. cellular automata), not rectangular Room/Corridor geometry.
  Not started. (The reverted reskin above was the wrong way to get here.)

Decision on sequencing: build a shared `DungeonKind` architecture later:
each mode produces the same `DungeonScene` shape so rendering/legend/
doors/encounters stay shared code. Immediate priority was multi-level
support for Catacombs instead (below) — Keep/Cave generators still unbuilt.

## Multi-level dungeons (2026-08-19)
Catacombs can now stack multiple independent levels, joined by stairs.
- `DungeonParams.levelCount` (slider, range 1–6, default 1) — each level runs
  the existing single-level BSP generator (`buildLevelLayout`) independently
  over the SAME grid footprint, so levels don't share room layouts.
- `Room`/`Corridor`/`Door` all carry a `level: number` tag. `DungeonScene`
  keeps flat `rooms`/`corridors`/`doors` arrays (all levels combined, level-
  tagged) rather than nesting into per-level arrays — less invasive than
  restructuring every consumer, and filtering by level is a one-line
  `.filter()` in the canvas.
- New `Stair` type: `{ levelFrom, levelTo, roomFromId, roomToId, posFrom,
  posTo }` — TWO positions, because each level is its own independent
  layout, so a stair is really two linked points rather than one shared
  coordinate. One stair per level transition (level 0→1, 1→2, etc.),
  connecting a random room on the level above (excluding that level's own
  entry point, so the two stairs don't land in the same room) to a random
  room on the level below, which becomes THAT level's entry point.
- Entrance is always level 0 (found via the existing `findEntrance`, closest
  room to the outer edge). Boss is always the deepest level, found via
  `findBossIndex` using THAT level's own entry point (the arrival room of
  its incoming stair) as the BFS-distance origin, exactly the same logic
  previously anchored to the entrance.
- Rendering (`DungeonCanvas.tsx`): rooms/corridors/doors filtered to
  `currentLevel` (new store state); stairs shown as a labeled badge — not a
  bare arrow, which user feedback flagged as too easy to misread ("not super
  clear... a DM may struggle to understand what it means"). The badge reads
  e.g. "▼ LVL 2", has a hover `<title>` spelling it out in full ("Stairs
  down to Level 2"), uses its own color (`STAIR_COLOR`, slate blue) distinct
  from every door color, and got two rows in the map's legend ("Stairs
  down"/"Stairs up"). The legend header was renamed "Doors" → "Legend" since
  it's no longer door-only, and `LEGEND_ROWS` bumped 8→10 to fit.
  - The stair's stored position (`posFrom`/`posTo`) is its room's center —
    same anchor point `RoomNote` uses for the encounter text, so the two
    always collided. Fixed by rendering the stair badge anchored to the
    room's bottom-right corner instead (mirroring how entrance/boss badges
    already anchor top-left), and by giving `RoomNote` a `reserveCorner`
    flag — when the room also holds a stair, the note's available
    width/height shrinks and its vertical center shifts up to clear that
    corner, instead of both fighting over the exact same point.
  - Confirmed acceptable trade-off (user, 2026-08-19): since every level is
    its own independently-generated layout over the same footprint, a
    stair's two ends don't line up at the same on-screen spot between
    floors (different room shapes level to level). Not a bug — inherent to
    independent per-level generation — and the user is fine with it for now.
- UI: a "Level 1 / Level 2 / ..." segmented switcher in the toolbar
  (`DungeonApp.tsx`), shown only when `levelCount > 1`. The room-count chip
  now reflects the CURRENT level, not the whole dungeon.
- Verified in-browser at levelCount=3: correct per-level room counts,
  entrance badge only on level 1, boss badge only on the deepest level,
  down/up stair glyphs matched on both sides of each transition, level
  switcher working, deterministic regenerate-with-same-seed reproducing
  identical output.

## Planned next feature: DM display / player reveal mode (raised 2026-08-19,
not started)
User wants a separate window (controlled from the main web UI) that shows
the dungeon map to players, with rooms/doors/corridors progressively
revealed as the party discovers them — not the full DM map dumped at once.
Needs: some kind of cross-window sync (a second `window.open`'d view kept in
sync with the DM's controls — BroadcastChannel or a shared store are the
obvious candidates), plus a reveal/fog-of-war data model (which rooms/doors/
corridors are currently visible to players) and DM controls to reveal/hide
them, likely per-room and per-door rather than an automatic "line of sight"
system. Independent of the multi-level and multi-generator-mode work above —
not yet scoped in detail.

## Landing page copy (2026-08-19, app-wide, not dungeon-specific)
User asked for the landing page (`src/ui/Landing.tsx`/`Landing.css`) to
welcome the user and explain Cartomancer's intent, not just present bare
City/Dungeon picker cards. Added a hero section above the existing picker:
title, a "Welcome, Dungeon Master." tagline, and a short intro paragraph
stating the core philosophy established earlier in this project — generate
a usable map immediately, then keep every piece hand-editable for exactly
the parts a DM's story needs, without requiring any manual work at all.
Picker cards and their behavior unchanged; only added content above them
plus a divider before "What are you mapping today?". Verified in-browser
(both cards still navigate correctly, back button returns here).

## Everything above is implemented and verified (typecheck, lint, in-browser).
Still uncommitted on `feature/dungeon-builder` per standing preference — ask
before committing.
