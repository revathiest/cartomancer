import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type {
  Building,
  BuildingShape,
  BusinessType,
  District,
  DistrictType,
  GenParams,
  MapScene,
  Point,
  RoadKind,
  RoadNodeKind,
} from '../shared/types.ts'
import { DEFAULT_PARAMS, PIER_DISTRICT_TYPES, isOuterDistrict } from '../shared/types.ts'
import { estimatePopulation } from '../analysis/population.ts'
import {
  centroid,
  clipPolygonConvex,
  closestPointOnPolygon,
  dist,
  offsetPolygonRobust,
  pointInPolygon,
  unionPolygonsRobust,
} from '../shared/geometry.ts'
import { generateCity } from '../generation/generateCity.ts'
import { bevelCorners, findDistrictLotAt, generateDistrictBuildings } from '../generation/buildings.ts'
import { makePiers, seaDirection } from '../generation/coast.ts'
import { generateWall, wallGateAnchors } from '../generation/wall.ts'
import { computeBridges, generateRiver } from '../generation/river.ts'
import {
  WATER_BUFFER,
  buildRoadNetwork,
  crossesWallAwayFromGate,
  derivedRoads,
  gateTolerance,
  segCrossesPolygon,
  segmentBreachesObstacles,
  wallCrossingPoints,
} from '../generation/roads.ts'
import { hashString, makeRng } from '../generation/rng.ts'
import { cloneScene, emptyHistory, record, type History } from './history.ts'

/** Recompute derived road polylines, wall gates, and river bridges from the
 *  road graph — so all three track the roads when nodes move. */
function rebuildDerived(scene: MapScene) {
  scene.roads = derivedRoads(scene.roadNodes, scene.roadEdges, scene.coast?.water ?? null)
  if (scene.wall) {
    // Gates ARE the gate-kind road nodes on the wall — one concept, not two.
    scene.wall.gates = scene.roadNodes
      .filter((n) => n.kind === 'gate')
      .map((n) => ({ id: n.id, point: n.point }))
  }
  if (scene.river) {
    scene.river.bridges = computeBridges(scene.river.points, scene.roads, scene.river.width)
  }
}

/**
 * Regenerate every district's procedural buildings against the current roads
 * (keeping hand-placed ones). Each district uses a deterministic per-district
 * RNG, so districts the roads didn't touch reproduce byte-identical buildings —
 * only the districts a moved road actually crosses visibly reflow.
 */
function reflowBuildingsInScene(scene: MapScene) {
  const custom = scene.buildings.filter((b) => b.isCustom)
  const walledPolys = scene.districts.filter((d) => d.walled).map((d) => d.polygon)
  const proc: typeof scene.buildings = []
  const lanes: typeof scene.lanes = []
  for (const d of scene.districts) {
    const rng = makeRng((scene.params.seed ^ hashId(d.id)) >>> 0)
    const r = generateDistrictBuildings(d, scene.roads, scene.river, scene.wall, walledPolys, rng, scene.params.buildingDensity)
    proc.push(...r.buildings)
    lanes.push(...r.lanes)
  }
  const water = scene.coast?.water
  const onLand = (b: { x: number; y: number }) => !water || !pointInPolygon({ x: b.x, y: b.y }, water)
  scene.buildings = [
    ...proc.filter(onLand),
    ...custom.map((b) => ({ ...b, districtId: districtAt(scene, { x: b.x, y: b.y }) })),
  ]
  scene.lanes = lanes
}

/**
 * After a landmark building is moved, resized, or rotated, its district's
 * ordinary (procedural, non-landmark) lot-fill buildings need to make way for
 * its new footprint — and may reclaim lots it used to sit on. Replays that
 * district's own per-district RNG stream (same as a fresh generate would) but
 * carves lots around the landmark's ACTUAL current placement instead of one
 * computed fresh — so every other lot's subdivision and fill roll lands
 * exactly where it already was; only what the landmark's footprint excludes
 * changes. A hand-placed lane-locked building is fitted to a lot exactly like
 * a procedural one, so it's held to the same rule: one the landmark's new
 * footprint now overlaps is evicted, same as procedural generation would
 * simply never have filled that lot — it doesn't matter how a building ended
 * up on the map, only whether its lot still exists. Anything NOT fitted to a
 * lot (another landmark, a freely-placed inn, etc.) is left alone either way.
 */
function reflowDistrictForLandmark(scene: MapScene, districtId: string, landmark: Building) {
  const district = scene.districts.find((d) => d.id === districtId)
  if (!district) return
  const walledPolys = scene.districts.filter((d) => d.walled).map((d) => d.polygon)
  const rng = makeRng((scene.params.seed ^ hashId(district.id)) >>> 0)
  const fresh = generateDistrictBuildings(
    district,
    scene.roads,
    scene.river,
    scene.wall,
    walledPolys,
    rng,
    scene.params.buildingDensity,
    { x: landmark.x, y: landmark.y, w: landmark.w, h: landmark.h, rotation: landmark.rotation },
  )
  const cos = Math.cos(landmark.rotation)
  const sin = Math.sin(landmark.rotation)
  const ux = { x: cos, y: sin }
  const uy = { x: -sin, y: cos }
  const hw = landmark.w / 2
  const hh = landmark.h / 2
  const landmarkCorners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => ({
    x: landmark.x + sx * hw * ux.x + sy * hh * uy.x,
    y: landmark.y + sx * hw * ux.y + sy * hh * uy.y,
  }))
  scene.buildings = scene.buildings.filter((b) => {
    if (b.id === landmark.id || b.districtId !== districtId) return true
    if (b.isCustom && !b.laneSnapped) return true // freely-placed — never lot-bound
    if (!b.laneSnapped) return true // shouldn't happen for a non-custom building, but be safe
    return clipPolygonConvex(absoluteFootprint(b), landmarkCorners).length < 3
  })
  scene.buildings.push(...fresh.buildings.filter((b) => !b.isLandmark))
  scene.lanes = scene.lanes.filter((l) => l.districtId !== districtId).concat(fresh.lanes)
}

/** Rebuild the waterfront piers from the current district types: working-boat
 *  waterfronts (docks/fishmarket/shipyard) get piers, everything else has none.
 *  Called after a coastal district's type changes so docks appear/disappear to
 *  match. No-op on landlocked scenes. */
function recomputePiers(scene: MapScene) {
  if (!scene.coast) return
  // Per-district RNG (mirrors generateCity) so only the changed district's piers
  // move — every other waterfront reproduces byte-identical piers.
  scene.coast.piers = scene.districts
    .filter((d) => PIER_DISTRICT_TYPES.has(d.type))
    .flatMap((d) => makePiers(d.polygon, scene.params.coastSide, scene.footprintRadius, makeRng((scene.params.seed ^ hashString(d.id)) >>> 0)))
}

/** Proper segment crossing (shared endpoints / touching do not count). */
function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const d1 = d(p3, p4, p1)
  const d2 = d(p3, p4, p2)
  const d3 = d(p1, p2, p3)
  const d4 = d(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/**
 * True if moving `nodeId` to `p` would make any of its streets cross another
 * street. Streets are treated as straight node-to-node segments; segments that
 * share a node meet (they don't cross) and are excluded.
 */
function moveWouldCross(scene: MapScene, nodeId: string, p: Point): boolean {
  const byId = new Map(scene.roadNodes.map((n) => [n.id, n]))
  const incident = scene.roadEdges.filter((e) => e.a === nodeId || e.b === nodeId)
  for (const ie of incident) {
    const otherId = ie.a === nodeId ? ie.b : ie.a
    const other = byId.get(otherId)
    if (!other) continue
    for (const e of scene.roadEdges) {
      if (e.id === ie.id) continue
      // Skip edges that share a node with this incident edge (they only meet).
      if (e.a === nodeId || e.b === nodeId || e.a === otherId || e.b === otherId) continue
      const a = byId.get(e.a)
      const b = byId.get(e.b)
      if (!a || !b) continue
      if (segmentsCross(p, other.point, a.point, b.point)) return true
    }
  }
  return false
}

/**
 * EDIT-TIME WALL/WATER MODEL — keep this in sync with generation's own rules in
 * generation/roads.ts (segmentBreachesObstacles / wallCrossingPoints), which
 * enforce the identical thing when a city is first generated:
 *  - A street may NEVER cross open water, full stop. `moveRoadNode` rejects a
 *    drag and `addRoadNode` rejects a placement that would do this; `connectNodes`
 *    refuses to create such an edge at all.
 *  - A street may cross the city wall ONLY as a gate. There is no manually
 *    placeable "gate" node kind in the UI — gates are created AUTOMATICALLY:
 *    `connectNodes` splices a gate node in at the exact point(s) where the new
 *    street crosses the wall, and that street is forced PRIMARY (only main roads
 *    breach the wall). Dragging a node (`moveRoadNode`) is NOT allowed to punch a
 *    NEW hole in the wall — live-splicing gates mid-drag would be chaotic — so a
 *    drag that would breach the wall is simply rejected; use Connect nodes to
 *    deliberately breach it instead.
 * If you touch road editing, preserve these invariants — regressing them lets
 * roads run straight through solid wall or across the sea with no visible cause.
 */

/**
 * Constrain a road node's position by its kind: gates are locked onto the wall,
 * plazas are kept inside the city. Other kinds are unconstrained.
 */
function constrainNodePosition(scene: MapScene, kind: RoadNodeKind, p: Point): Point {
  const wall = scene.wall
  if (!wall || wall.polygon.length < 3) return p
  if (kind === 'gate') return closestPointOnPolygon(p, wall.polygon)
  if (kind === 'plaza' || kind === 'exit') {
    const inside = pointInPolygon(p, wall.polygon)
    // Plazas must stay inside; exits must stay outside.
    if (kind === 'plaza' ? inside : !inside) return p
    const edge = closestPointOnPolygon(p, wall.polygon)
    const ctr = centroid(wall.polygon)
    // Nudge inward for a plaza, outward for an exit.
    const sign = kind === 'plaza' ? 1 : -1
    const dx = (ctr.x - edge.x) * sign
    const dy = (ctr.y - edge.y) * sign
    const len = Math.hypot(dx, dy) || 1
    return { x: edge.x + (dx / len) * 12, y: edge.y + (dy / len) * 12 }
  }
  return p
}

/**
 * True if `p` is inside the water, or merely close enough to it that a road
 * node/stroke sitting there would still visibly touch the sea — a road is
 * painted with real width (and gets smoothed again at render time), so "not
 * technically inside the water polygon" isn't the same as "looks fine". Mirrors
 * the buffer generation uses for the rendered curve itself (see WATER_BUFFER /
 * chainPolyline in generation/roads.ts) so edits and generation agree.
 */
function tooCloseToWater(p: Point, water: Point[] | null | undefined): boolean {
  if (!water || water.length < 3) return false
  if (pointInPolygon(p, water)) return true
  return dist(p, closestPointOnPolygon(p, water)) < WATER_BUFFER
}

/**
 * True if moving `nodeId` to `cp` would send any of its streets across open
 * water, or across the wall anywhere that isn't an existing gate. Dragging never
 * creates a new gate (see the edit-time model comment above `constrainNodePosition`).
 */
function moveWouldBreachObstacles(scene: MapScene, nodeId: string, cp: Point): boolean {
  const water = scene.coast?.water ?? null
  const wall = scene.wall && scene.wall.polygon.length >= 3 ? scene.wall.polygon : null
  if (!water && !wall) return false
  // The candidate point itself must not be submerged, or even close to the
  // water. This is NOT redundant with the incident-edge crossing check below: if
  // the node's neighbor also happens to sit near/inside the water, the segment
  // between them can end up fully submerged without ever crossing the polygon
  // BOUNDARY (a "proper crossing" only fires on a transition, so two points both
  // already inside register zero crossings) — that's exactly how a node could be
  // dragged into the sea between two waterfront districts without tripping the
  // edge check.
  if (tooCloseToWater(cp, water)) return true
  const gates = scene.roadNodes.filter((n) => n.kind === 'gate').map((n) => n.point)
  const tol = gateTolerance(scene.footprintRadius)
  const byId = new Map(scene.roadNodes.map((n) => [n.id, n]))
  const incident = scene.roadEdges.filter((e) => e.a === nodeId || e.b === nodeId)
  for (const e of incident) {
    const otherId = e.a === nodeId ? e.b : e.a
    const other = byId.get(otherId)
    if (!other) continue
    if (segmentBreachesObstacles(cp, other.point, { water, wall }, gates, tol)) return true
  }
  return false
}

/** Stable 32-bit hash of a string id, for per-district deterministic RNG. */
function hashId(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export type EditMode = 'generate' | 'edit'
export type EditTool = 'select' | 'place' | 'district' | 'roads'

export type SelectionKind = 'building' | 'district' | 'road' | 'roadNode' | 'river' | 'wall'
export type Selection = { kind: SelectionKind; id: string } | null

/** In the Select tool, restrict what a click can grab (avoids grabbing the wrong thing). */
export type SelectFilter = 'all' | 'building' | 'river'

type MapState = {
  scene: MapScene
  params: GenParams
  mode: EditMode
  tool: EditTool
  /** Broad kind the Place tool is set to drop: a lot-conforming/plain-rect
   *  building, or a freely-placed landmark. Independent of `placeType` — a
   *  landmark picks its OWN business type (see `placeLandmarkType`) so it can
   *  be flavoured (e.g. "this Keep is also a Guild Hall") same as any other
   *  building. */
  placeMode: 'lane' | 'landmark'
  placeType: BusinessType
  /** Business type applied to a hand-placed landmark — same list as ordinary
   *  buildings (a landmark can be an inn, a guild hall, etc.), just never
   *  'landmark' itself (that's `placeMode`, not a type). */
  placeLandmarkType: BusinessType
  /** Silhouette used for a hand-placed landmark — it has no lot to conform
   *  to, so the shape is picked by hand instead. */
  placeShape: BuildingShape
  selection: Selection
  /** Id of the lane-locked building waiting to be merged with a second one —
   *  set by starting a merge from the building panel, cleared on completion
   *  or cancellation. */
  mergeFrom: string | null
  hasManualEdits: boolean
  history: History

  // --- params & generation ---
  setParams: (partial: Partial<GenParams>) => void
  randomizeSeed: () => void
  regenerate: () => void
  /** Replace the whole scene wholesale — used to load a previously saved map.
   *  Resets selection/history/tool the same way a fresh regenerate does,
   *  since none of that is meaningful for a scene the editor didn't just
   *  build itself. */
  loadScene: (scene: MapScene) => void
  /** Show/hide the city wall live (no full regeneration). */
  toggleWall: (on: boolean) => void
  /** Show/hide the river live (no full regeneration). */
  toggleRiver: (on: boolean) => void
  /** Set the river's drawn width live (updates bridges + building clearance). */
  setRiverWidth: (w: number) => void
  /** Set block size / lane width / building gap on ALL districts at once and
   * reflow live (the generate-panel sliders; per-district overrides live in the
   * Districts panel). */
  setLayoutAll: (partial: Partial<Pick<GenParams, 'blockSize' | 'laneWidth' | 'buildingGap'>>) => void
  /** Set the global building-density multiplier live (reflows buildings only —
   * doesn't touch districts/roads/wall). */
  setBuildingDensity: (v: number) => void
  /** Search district count and building density for the combination that
   * lands closest to a target population, then regenerate with it. Returns
   * what was actually achieved so the UI can report it. */
  matchPopulation: (target: number) => {
    achieved: number
    districtCount: number
    buildingDensity: number
    /** True if the closest possible result is pinned at the generator's floor
     * or ceiling — the target is outside what it can produce at all. */
    clamped: boolean
  }

  // --- modes / selection ---
  setMode: (mode: EditMode) => void
  setTool: (tool: EditTool) => void
  setPlaceMode: (m: 'lane' | 'landmark') => void
  setPlaceType: (t: BusinessType) => void
  setPlaceLandmarkType: (t: BusinessType) => void
  setPlaceShape: (s: BuildingShape) => void
  select: (sel: Selection) => void

  /** Push the current scene onto the undo stack. Call once at the start of a
   * continuous gesture (e.g. a drag) so the whole gesture is one undo step. */
  snapshot: () => void

  // --- district layout (user-dictated placement/naming/typing) ---
  updateDistrict: (
    districtId: string,
    partial: Partial<
      Pick<District, 'name' | 'type' | 'density' | 'size' | 'buildingSize' | 'blockSize' | 'laneWidth' | 'buildingGap' | 'walled'>
    >,
  ) => void
  /** Live-move a district's generator point (marker feedback; no re-tessellation). */
  moveDistrictSeed: (districtId: string, p: Point) => void
  /** Rebuild districts/roads/wall/river/procedural buildings from the current
   * seed layout, preserving hand-placed (custom) buildings. */
  retessellate: () => void
  /** Re-roll ONLY one district's procedural buildings (for density/type changes)
   * without touching any other district. */
  regenerateDistrictBuildings: (districtId: string) => void
  /** Rebuild the auto road graph for the current districts (discards road edits). */
  regenerateRoads: () => void
  /** Add a new district generator point at `p` (then re-tessellate). */
  addDistrictSeed: (p: Point, type?: DistrictType) => void
  /** Remove a district by id (then re-tessellate). Requires at least 3 to remain. */
  removeDistrict: (districtId: string) => void

  // --- geometry edits ---
  updateDistrictPoint: (districtId: string, index: number, p: Point) => void
  moveDistrict: (districtId: string, dx: number, dy: number) => void
  updateRiverPoint: (index: number, p: Point) => void
  insertRiverPoint: (afterIndex: number) => void
  removeRiverPoint: (index: number) => void
  updateWallPoint: (index: number, p: Point) => void

  // --- road graph (nodes = intersections/dead-ends/gates, edges = streets) ---
  connectMode: boolean
  connectFrom: string | null
  setConnectMode: (on: boolean) => void
  setConnectFrom: (id: string | null) => void

  // --- view options ---
  /** When false, district background fills/hatching are hidden (transparent). */
  showDistrictFills: boolean
  setShowDistrictFills: (v: boolean) => void
  /** When true, the Generate City button picks a new random seed first;
   *  when false, it regenerates with whatever seed is currently entered. */
  randomizeSeedOnGenerate: boolean
  setRandomizeSeedOnGenerate: (v: boolean) => void
  /** Select-tool click filter — restricts what a click can grab. */
  selectFilter: SelectFilter
  setSelectFilter: (f: SelectFilter) => void
  moveRoadNode: (id: string, p: Point) => void
  addRoadNode: (p: Point, kind?: RoadNodeKind) => void
  setRoadNodeKind: (id: string, kind: RoadNodeKind) => void
  connectNodes: (a: string, b: string) => void
  setRoadEdgeKind: (id: string, kind: RoadKind) => void
  deleteRoadNode: (id: string) => void
  deleteRoadEdge: (id: string) => void
  /** Reflow procedural buildings to the current roads (call after a road-node drag). */
  reflowBuildings: () => void

  // --- buildings ---
  addBuilding: (b: Omit<Building, 'id' | 'districtId'>) => void
  /** Place a generic building conforming to the district's own lot/lane layout
   * at `p` — same rules as procedural generation (must land in a real,
   * lane-fronting, corridor-clear lot). Returns false (places nothing) if `p`
   * isn't in a usable lot. */
  placeConformingBuilding: (p: Point) => boolean
  updateBuilding: (id: string, partial: Partial<Building>) => void
  moveBuilding: (id: string, dx: number, dy: number) => void
  deleteBuilding: (id: string) => void
  /** Arms merge mode from building `id` — the next building clicked on the
   *  canvas (via mergeBuildings) is the other half. */
  startMerge: (id: string) => void
  cancelMerge: () => void
  /** Merges the pending `mergeFrom` building with `id` into one building
   *  shaped like the two joined where their shared wall met (a convex hull of
   *  both footprints, closing the small gap the lot layout leaves between
   *  neighbours). Both must be lane-locked and in the same district; only
   *  these two buildings are touched — nothing else in the district reflows. */
  mergeBuildings: (id: string) => { ok: boolean; reason?: string }
  deleteSelected: () => void

  // --- history ---
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

function districtAt(scene: MapScene, p: Point): string | null {
  for (const d of scene.districts) {
    if (pointInPolygon(p, d.polygon)) return d.id
  }
  return null
}

/** A building's footprint (or, absent one, its plain w/h box) in world space. */
function absoluteFootprint(b: Building): Point[] {
  const fp: Point[] =
    b.footprint && b.footprint.length >= 3
      ? b.footprint
      : [
          { x: -b.w / 2, y: -b.h / 2 },
          { x: b.w / 2, y: -b.h / 2 },
          { x: b.w / 2, y: b.h / 2 },
          { x: -b.w / 2, y: b.h / 2 },
        ]
  const cos = Math.cos(b.rotation)
  const sin = Math.sin(b.rotation)
  return fp.map((p) => ({ x: b.x + p.x * cos - p.y * sin, y: b.y + p.x * sin + p.y * cos }))
}

/** The block (lane-outline polygon) a point falls in, within one district —
 *  two buildings can only merge if they're in the SAME one, so merging never
 *  reaches across a lane into a neighbouring block. */
function blockContaining(scene: MapScene, districtId: string, p: Point) {
  return scene.lanes.find((l) => l.districtId === districtId && pointInPolygon(p, l.points)) ?? null
}

const MERGE_FAILURE_LOG_KEY = 'dnd-map-maker:merge-failure-log'
const MERGE_FAILURE_LOG_MAX = 500

/** Everything needed to reproduce a merge attempt standalone, without the
 *  rest of the scene — the exact fields `mergeBuildings` reads from a
 *  building (raw lot, footprint, position) plus enough identity to tell
 *  entries apart. */
function snapshotForMergeLog(b: Building) {
  return {
    id: b.id,
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    rotation: b.rotation,
    districtId: b.districtId,
    businessType: b.businessType,
    name: b.name,
    isCustom: b.isCustom,
    laneSnapped: b.laneSnapped,
    footprint: b.footprint,
    lot: b.lot,
  }
}

/** Records every failed merge attempt (geometry-related ones — not "no
 *  building armed" or "pick a different building", which aren't reproducible
 *  bugs) to localStorage with full detail on both buildings involved, so a
 *  rare failure encountered during ordinary use can be handed back for
 *  offline repro instead of needing to be caught live. Call
 *  `downloadMergeFailureLog()` from the console to pull the accumulated log
 *  out as a JSON file. */
function logMergeFailure(reason: string, a: Building, b: Building) {
  const entry = { timestamp: new Date().toISOString(), reason, a: snapshotForMergeLog(a), b: snapshotForMergeLog(b) }
  console.error('[mergeBuildings] failed:', entry)
  try {
    const raw = localStorage.getItem(MERGE_FAILURE_LOG_KEY)
    const log = raw ? JSON.parse(raw) : []
    log.push(entry)
    while (log.length > MERGE_FAILURE_LOG_MAX) log.shift()
    localStorage.setItem(MERGE_FAILURE_LOG_KEY, JSON.stringify(log))
  } catch {
    // localStorage full/unavailable — the console.error above still has it.
  }
}

/** Downloads every merge failure recorded this browser (across sessions,
 *  since it's localStorage-backed) as a single JSON file. Call from the
 *  browser console: `downloadMergeFailureLog()`. */
export function downloadMergeFailureLog(): void {
  const raw = localStorage.getItem(MERGE_FAILURE_LOG_KEY)
  const log = raw ? JSON.parse(raw) : []
  const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `merge-failures-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Clears the accumulated merge-failure log. Call from the console:
 *  `clearMergeFailureLog()`. */
export function clearMergeFailureLog(): void {
  localStorage.removeItem(MERGE_FAILURE_LOG_KEY)
}

export const useMapStore = create<MapState>((set, get) => {
  /** Apply a scene mutation WITHOUT recording history. Used for continuous
   * gestures where the caller has already taken a snapshot(). */
  const mutate = (fn: (scene: MapScene) => MapScene) => {
    set((state) => ({ scene: fn(cloneScene(state.scene)), hasManualEdits: true }))
  }

  /** Record history, then apply a scene mutation. Used for discrete edits
   * (add/delete/insert) that are a single undo step on their own. */
  const recordMutate = (fn: (scene: MapScene) => MapScene) => {
    set((state) => {
      const history = record(state.history, state.scene)
      return { scene: fn(cloneScene(state.scene)), history, hasManualEdits: true }
    })
  }

  return {
    scene: generateCity(DEFAULT_PARAMS),
    params: { ...DEFAULT_PARAMS },
    mode: 'generate',
    tool: 'select',
    placeMode: 'lane',
    placeType: 'generic',
    placeLandmarkType: 'generic',
    placeShape: 'keep',
    selection: null,
    mergeFrom: null,
    hasManualEdits: false,
    history: emptyHistory(),
    connectMode: false,
    connectFrom: null,
    showDistrictFills: true,
    setShowDistrictFills: (showDistrictFills) => set({ showDistrictFills }),
    randomizeSeedOnGenerate: false,
    setRandomizeSeedOnGenerate: (randomizeSeedOnGenerate) => set({ randomizeSeedOnGenerate }),
    selectFilter: 'all',
    setSelectFilter: (selectFilter) => set({ selectFilter, selection: null }),

    setParams: (partial) => set((s) => ({ params: { ...s.params, ...partial } })),

    randomizeSeed: () =>
      set((s) => ({ params: { ...s.params, seed: Math.floor(Math.random() * 1_000_000) } })),

    regenerate: () =>
      set((s) => ({
        scene: generateCity(s.params),
        selection: null,
        hasManualEdits: false,
        history: emptyHistory(),
      })),

    loadScene: (scene) =>
      set({
        scene,
        params: { ...scene.params },
        mode: 'edit',
        tool: 'select',
        selection: null,
        hasManualEdits: false,
        history: emptyHistory(),
        connectMode: false,
        connectFrom: null,
        selectFilter: 'all',
      }),

    toggleWall: (on) =>
      set((state) => {
        const history = record(state.history, state.scene)
        const scene = cloneScene(state.scene)
        scene.params.hasWall = on
        const core = scene.wallBoundary?.length >= 3 ? scene.wallBoundary : scene.boundary
        scene.wall = on && core.length >= 3 ? generateWall(core) : null
        rebuildDerived(scene) // repopulates wall.gates from gate nodes
        reflowBuildingsInScene(scene) // buildings reclaim/vacate the wall clearance
        return { scene, params: { ...state.params, hasWall: on }, history, hasManualEdits: true }
      }),

    toggleRiver: (on) =>
      set((state) => {
        const history = record(state.history, state.scene)
        const scene = cloneScene(state.scene)
        scene.params.hasRiver = on
        if (on) {
          // Restore the exact river that was there before it was last turned
          // off, rather than generating a new one — a fresh generateRiver
          // call uses its own independent RNG draw, which (unlike the wall,
          // whose shape is a pure function of the boundary) doesn't reproduce
          // the river's original path.
          if (scene.riverCache) {
            scene.river = scene.riverCache
            scene.river.bridges = computeBridges(scene.river.points, scene.roads, scene.river.width)
            scene.riverCache = undefined
          } else {
            const center = { x: scene.bounds.width / 2, y: scene.bounds.height / 2 }
            const rng = makeRng((scene.params.seed ^ 0x51e7) >>> 0)
            scene.river = generateRiver(center, scene.footprintRadius, scene.bounds.width, scene.roads, rng, scene.params.riverWidth)
          }
        } else {
          scene.riverCache = scene.river
          scene.river = null
        }
        reflowBuildingsInScene(scene)
        return { scene, params: { ...state.params, hasRiver: on }, history, hasManualEdits: true }
      }),

    setRiverWidth: (w) =>
      set((state) => {
        const scene = cloneScene(state.scene)
        if (scene.river) {
          scene.river.width = w
          scene.river.bridges = computeBridges(scene.river.points, scene.roads, w)
          reflowBuildingsInScene(scene) // building clearance from the water changes
        }
        return { scene, params: { ...state.params, riverWidth: w }, hasManualEdits: true }
      }),

    setLayoutAll: (partial) =>
      set((s) => {
        const history = record(s.history, s.scene)
        const scene = cloneScene(s.scene)
        for (const d of scene.districts) Object.assign(d, partial)
        for (const seed of scene.seeds) Object.assign(seed, partial)
        Object.assign(scene.params, partial)
        reflowBuildingsInScene(scene)
        return { params: { ...s.params, ...partial }, scene, history, hasManualEdits: true }
      }),

    setBuildingDensity: (v) =>
      set((s) => {
        const scene = cloneScene(s.scene)
        scene.params.buildingDensity = v
        reflowBuildingsInScene(scene)
        return { scene, params: { ...s.params, buildingDensity: v }, hasManualEdits: true }
      }),

    matchPopulation: (target) => {
      const state = get()
      const baseParams = state.params
      const MIN_COUNT = 5
      const MAX_COUNT = 28
      const MIN_DENSITY = 0.5
      const MAX_DENSITY = 1.8

      type Candidate = { districtCount: number; buildingDensity: number; pop: number; scene: MapScene }
      const tried = new Map<string, Candidate>()
      const evaluate = (districtCount: number, buildingDensity: number): Candidate => {
        const key = `${districtCount}|${buildingDensity.toFixed(3)}`
        const cached = tried.get(key)
        if (cached) return cached
        const scene = generateCity({ ...baseParams, districtCount, buildingDensity })
        const pop = estimatePopulation(scene).total
        const c = { districtCount, buildingDensity, pop, scene }
        tried.set(key, c)
        return c
      }
      const closeEnough = (p: number) => Math.abs(p - target) / target < 0.03
      const better = (a: Candidate, b: Candidate) => Math.abs(a.pop - target) < Math.abs(b.pop - target)

      const startDensity = Math.max(MIN_DENSITY, Math.min(MAX_DENSITY, baseParams.buildingDensity))
      const startCount = Math.max(MIN_COUNT, Math.min(MAX_COUNT, baseParams.districtCount))

      // Phase 1: sweep district count in a WINDOW around a proportional guess —
      // not the full 5..28 range (too slow to do on every click), but not a
      // narrow hill-climb either (population isn't monotonic in count, since
      // district-type mix is randomized per count, so a greedy climb can get
      // stuck tens of percent off — confirmed by testing). Full coverage of a
      // wide local window avoids that trap while keeping a typical search fast.
      const probe = evaluate(startCount, startDensity)
      const ratio = probe.pop > 0 ? target / probe.pop : 1
      const guess = Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.round(startCount * ratio)))
      let best = probe
      for (let c = Math.max(MIN_COUNT, guess - 6); c <= Math.min(MAX_COUNT, guess + 6); c++) {
        const candidate = evaluate(c, startDensity)
        if (better(candidate, best)) best = candidate
      }
      // The true optimum can still be past the window's edge — extend once more
      // in that direction if the best found is sitting right on it.
      if (best.districtCount === Math.max(MIN_COUNT, guess - 6) && best.districtCount > MIN_COUNT) {
        for (let c = Math.max(MIN_COUNT, best.districtCount - 6); c < best.districtCount; c++) {
          const candidate = evaluate(c, startDensity)
          if (better(candidate, best)) best = candidate
        }
      } else if (best.districtCount === Math.min(MAX_COUNT, guess + 6) && best.districtCount < MAX_COUNT) {
        for (let c = best.districtCount + 1; c <= Math.min(MAX_COUNT, best.districtCount + 6); c++) {
          const candidate = evaluate(c, startDensity)
          if (better(candidate, best)) best = candidate
        }
      }

      // Phase 2: fine-tune with building density at the chosen district count,
      // to close whatever gap district count alone couldn't (it only moves in
      // whole districts, a coarse step).
      for (let i = 0; i < 6 && !closeEnough(best.pop); i++) {
        const r = best.pop > 0 ? target / best.pop : 1
        const guessD = Math.max(MIN_DENSITY, Math.min(MAX_DENSITY, best.buildingDensity * r))
        if (Math.abs(guessD - best.buildingDensity) < 0.02) break // converged
        const candidate = evaluate(best.districtCount, guessD)
        if (!better(candidate, best)) break // not improving
        best = candidate
      }

      set({
        scene: best.scene,
        params: { ...baseParams, districtCount: best.districtCount, buildingDensity: best.buildingDensity },
        selection: null,
        hasManualEdits: false,
        history: emptyHistory(),
      })

      // Pinned against both the smallest or both the largest possible settings
      // in the direction of the gap means the target is outside what the
      // generator can produce at all — worth telling the user why it's off.
      const clamped =
        (best.districtCount === MIN_COUNT && best.buildingDensity === MIN_DENSITY && best.pop > target) ||
        (best.districtCount === MAX_COUNT && best.buildingDensity === MAX_DENSITY && best.pop < target)

      return { achieved: best.pop, districtCount: best.districtCount, buildingDensity: best.buildingDensity, clamped }
    },

    setMode: (mode) => set({ mode, selection: null, tool: 'select', connectMode: false, connectFrom: null }),
    setTool: (tool) => set({ tool, connectMode: false, connectFrom: null }),
    setPlaceMode: (placeMode) => set({ placeMode }),
    setPlaceType: (placeType) => set({ placeType }),
    setPlaceLandmarkType: (placeLandmarkType) => set({ placeLandmarkType }),
    setPlaceShape: (placeShape) => set({ placeShape }),
    select: (selection) => set({ selection }),

    snapshot: () =>
      set((state) => ({ history: record(state.history, state.scene), hasManualEdits: true })),

    updateDistrict: (districtId, partial) =>
      mutate((scene) => {
        // Keep the district and its seed (the source of truth for re-tessellation)
        // in sync for name/type.
        const d = scene.districts.find((x) => x.id === districtId)
        const typeChanged = !!d && partial.type !== undefined && partial.type !== d.type
        if (d) Object.assign(d, partial)
        const seed = scene.seeds.find((x) => x.id === districtId)
        if (seed) Object.assign(seed, partial)
        // A new type means new buildings (each type has its own profile) and, on a
        // coast, docks that appear or disappear to match the new use.
        if (typeChanged) {
          reflowBuildingsInScene(scene)
          recomputePiers(scene)
        }
        return scene
      }),

    moveDistrictSeed: (districtId, p) =>
      mutate((scene) => {
        const seed = scene.seeds.find((x) => x.id === districtId)
        if (seed) seed.site = p
        // Move the label site too for immediate visual feedback.
        const d = scene.districts.find((x) => x.id === districtId)
        if (d) d.site = p
        return scene
      }),

    // Rebuild districts/wall/river/buildings from the current seed layout, but
    // PRESERVE the user's road graph (only a full Regenerate or the explicit
    // "Regenerate roads" action rebuilds roads). Does NOT record history itself —
    // callers snapshot() first so a whole gesture is one undo step.
    retessellate: () =>
      set((state) => {
        const fresh = generateCity(state.params, state.scene.seeds, state.scene.coast)
        // Keep the existing road nodes/edges; re-snap constrained nodes onto the
        // reshaped wall (gates on the wall, plazas inside, exits outside).
        fresh.roadNodes = state.scene.roadNodes.map((n) => ({ ...n, point: { ...n.point } }))
        fresh.roadEdges = state.scene.roadEdges.map((e) => ({ ...e }))
        for (const n of fresh.roadNodes) n.point = constrainNodePosition(fresh, n.kind, n.point)
        rebuildDerived(fresh)
        // Keep hand-placed buildings; regenerate procedural against the kept roads.
        fresh.buildings = state.scene.buildings.filter((b) => b.isCustom).map((b) => ({ ...b }))
        reflowBuildingsInScene(fresh)
        return { scene: fresh, hasManualEdits: true }
      }),

    regenerateRoads: () =>
      recordMutate((scene) => {
        // Build the road graph against the CURRENT wall/districts (not a
        // regenerated-from-seeds city), so gate nodes land on the wall as it is
        // now — not where it used to be.
        const rng = makeRng(scene.params.seed >>> 0)
        const hasWall = !!scene.wall && scene.wall.polygon.length >= 3
        const center = hasWall
          ? centroid(scene.wall!.polygon)
          : centroid(scene.districts.map((d) => d.site))
        const anchors = hasWall
          ? wallGateAnchors(scene.wall!.polygon, center, scene.params.gateCount, rng)
          : []
        const siteCenters = scene.districts.map((d) => d.site)
        const siteIsInner = scene.districts.map((d) => !isOuterDistrict(d.type))
        const net = buildRoadNetwork(center, siteCenters, anchors, scene.footprintRadius, rng, siteIsInner, {
          water: scene.coast?.water ?? null,
          wall: hasWall ? scene.wall!.polygon : null,
        })
        let roadNodes = net.nodes
        let roadEdges = net.edges
        // Mirror generateCity's coastal cleanup (it's otherwise only applied on a
        // full generate): drop gates that land in the sea, and exits that are in
        // the sea OR point seaward. A gate facing the coastline would otherwise
        // plant its exit stub straight out through the waterfront strip, landing
        // inside a docks/fishmarket/shipyard/warehouse district instead of past
        // the sprawl — exits are always leaves, so removing one never strands
        // anything else.
        if (scene.coast) {
          const water = scene.coast.water
          const dir = seaDirection(scene.coast.side)
          const seaward = (p: Point) => (p.x - center.x) * dir.x + (p.y - center.y) * dir.y > 0
          const remove = new Set(
            roadNodes
              .filter((n) => {
                if (n.kind === 'gate') return pointInPolygon(n.point, water)
                if (n.kind === 'exit') return pointInPolygon(n.point, water) || seaward(n.point)
                return false
              })
              .map((n) => n.id),
          )
          if (remove.size) {
            roadNodes = roadNodes.filter((n) => !remove.has(n.id))
            roadEdges = roadEdges.filter((e) => !remove.has(e.a) && !remove.has(e.b))
          }
        }
        scene.roadNodes = roadNodes
        scene.roadEdges = roadEdges
        rebuildDerived(scene)
        scene.buildings = scene.buildings.filter((b) => b.isCustom)
        reflowBuildingsInScene(scene)
        return scene
      }),

    regenerateDistrictBuildings: (districtId) =>
      mutate((scene) => {
        const district = scene.districts.find((d) => d.id === districtId)
        if (!district) return scene
        // Keep every other district's buildings and all hand-placed ones.
        scene.buildings = scene.buildings.filter(
          (b) => b.isCustom || b.districtId !== districtId,
        )
        const rng = makeRng((scene.params.seed ^ hashId(districtId)) >>> 0)
        const walledPolys = scene.districts.filter((d) => d.walled).map((d) => d.polygon)
        const fresh = generateDistrictBuildings(
          district,
          scene.roads,
          scene.river,
          scene.wall,
          walledPolys,
          rng,
          scene.params.buildingDensity,
        )
        scene.buildings.push(...fresh.buildings)
        scene.lanes = scene.lanes.filter((l) => l.districtId !== districtId).concat(fresh.lanes)
        return scene
      }),

    addDistrictSeed: (p, type = 'residential') => {
      get().snapshot()
      set((state) => {
        const scene = cloneScene(state.scene)
        scene.seeds.push({
          id: nanoid(8),
          site: p,
          type,
          name: 'New District',
          density: 1,
          size: 1,
          buildingSize: 1,
          blockSize: scene.params.blockSize,
          laneWidth: scene.params.laneWidth,
          buildingGap: scene.params.buildingGap,
          walled: false,
        })
        const custom = scene.buildings.filter((b) => b.isCustom)
        const fresh = generateCity(state.params, scene.seeds, scene.coast)
        fresh.buildings = [
          ...fresh.buildings,
          ...custom.map((b) => ({ ...b, districtId: districtAt(fresh, { x: b.x, y: b.y }) })),
        ]
        return { scene: fresh, hasManualEdits: true }
      })
    },

    removeDistrict: (districtId) => {
      if (get().scene.seeds.length <= 3) return
      get().snapshot()
      set((state) => {
        const scene = cloneScene(state.scene)
        scene.seeds = scene.seeds.filter((s) => s.id !== districtId)
        const custom = scene.buildings.filter((b) => b.isCustom)
        const fresh = generateCity(state.params, scene.seeds, scene.coast)
        fresh.buildings = [
          ...fresh.buildings,
          ...custom.map((b) => ({ ...b, districtId: districtAt(fresh, { x: b.x, y: b.y }) })),
        ]
        const selection =
          state.selection?.id === districtId ? null : state.selection
        return { scene: fresh, hasManualEdits: true, selection }
      })
    },

    updateDistrictPoint: (districtId, index, p) =>
      mutate((scene) => {
        const d = scene.districts.find((x) => x.id === districtId)
        if (d && d.polygon[index]) d.polygon[index] = p
        return scene
      }),

    moveDistrict: (districtId, dx, dy) =>
      mutate((scene) => {
        const d = scene.districts.find((x) => x.id === districtId)
        if (d) {
          d.polygon = d.polygon.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
          d.site = { x: d.site.x + dx, y: d.site.y + dy }
        }
        return scene
      }),

    updateRiverPoint: (index, p) =>
      mutate((scene) => {
        if (scene.river && scene.river.points[index]) {
          scene.river.points[index] = p
          // Bridges follow the river as it's reshaped.
          scene.river.bridges = computeBridges(scene.river.points, scene.roads, scene.river.width)
        }
        return scene
      }),

    insertRiverPoint: (afterIndex) =>
      recordMutate((scene) => {
        const r = scene.river
        if (r && r.points[afterIndex] && r.points[afterIndex + 1]) {
          const a = r.points[afterIndex]
          const b = r.points[afterIndex + 1]
          r.points.splice(afterIndex + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
          r.bridges = computeBridges(r.points, scene.roads, r.width)
        }
        return scene
      }),

    removeRiverPoint: (index) =>
      recordMutate((scene) => {
        const r = scene.river
        if (r && r.points.length > 2) {
          r.points.splice(index, 1)
          r.bridges = computeBridges(r.points, scene.roads, r.width)
        }
        return scene
      }),

    updateWallPoint: (index, p) =>
      mutate((scene) => {
        if (scene.wall && scene.wall.polygon[index]) scene.wall.polygon[index] = p
        // Keep the wall nodes on the wall: re-snap gates onto the reshaped wall
        // (and plazas inside / exits outside), then re-derive gates from them.
        for (const n of scene.roadNodes) n.point = constrainNodePosition(scene, n.kind, n.point)
        rebuildDerived(scene)
        return scene
      }),

    // --- road graph ---
    setConnectMode: (on) => set({ connectMode: on, connectFrom: null }),
    setConnectFrom: (id) => set({ connectFrom: id }),

    moveRoadNode: (id, p) => {
      const scene0 = get().scene
      const node = scene0.roadNodes.find((x) => x.id === id)
      if (!node) return
      // Gates lock to the wall, plazas stay inside the city.
      const cp = constrainNodePosition(scene0, node.kind, p)
      // Reject the move if it would make this node's streets cross others — the
      // node simply stays at its last valid position (add a node to cross).
      if (moveWouldCross(scene0, id, cp)) return
      // Reject a drag that would send a street across open water, or punch a NEW
      // hole in the wall (dragging never creates a gate — see the edit-time model
      // comment above constrainNodePosition; use Connect nodes to breach the wall).
      if (moveWouldBreachObstacles(scene0, id, cp)) return
      mutate((scene) => {
        const n = scene.roadNodes.find((x) => x.id === id)
        if (n) n.point = cp
        rebuildDerived(scene)
        return scene
      })
    },

    addRoadNode: (p, kind = 'junction') => {
      const scene0 = get().scene
      // Never let a placed node land in (or hug) open water.
      if (tooCloseToWater(p, scene0.coast?.water)) return
      recordMutate((scene) => {
        scene.roadNodes.push({ id: nanoid(8), point: constrainNodePosition(scene, kind, p), kind })
        rebuildDerived(scene)
        return scene
      })
    },

    setRoadNodeKind: (id, kind) =>
      recordMutate((scene) => {
        const n = scene.roadNodes.find((x) => x.id === id)
        if (n) {
          n.kind = kind
          // Re-apply the new kind's constraint (e.g. a junction becoming a gate
          // snaps onto the wall).
          n.point = constrainNodePosition(scene, kind, n.point)
        }
        // A gate node becomes a wall opening; re-derive so the wall reflects it.
        rebuildDerived(scene)
        return scene
      }),

    connectNodes: (a, b) => {
      if (a === b) return
      const scene0 = get().scene
      const na = scene0.roadNodes.find((n) => n.id === a)
      const nb = scene0.roadNodes.find((n) => n.id === b)
      if (!na || !nb) return
      const exists = scene0.roadEdges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))
      if (exists) return
      // A street may never cut across (or hug) open water — refuse outright.
      // Check both endpoints directly too: a segment between two points already
      // inside the water registers zero boundary crossings (crossing detection
      // only fires on a transition), so the plain crossing test alone would miss it.
      const water = scene0.coast?.water
      if (water && water.length >= 3) {
        if (tooCloseToWater(na.point, water) || tooCloseToWater(nb.point, water)) return
        if (segCrossesPolygon(na.point, nb.point, water)) return
      }
      recordMutate((scene) => {
        const A = scene.roadNodes.find((n) => n.id === a)!
        const B = scene.roadNodes.find((n) => n.id === b)!
        const wall = scene.wall && scene.wall.polygon.length >= 3 ? scene.wall.polygon : null
        if (wall) {
          const gates = scene.roadNodes.filter((n) => n.kind === 'gate').map((n) => n.point)
          const tol = gateTolerance(scene.footprintRadius)
          if (crossesWallAwayFromGate(A.point, B.point, wall, gates, tol)) {
            // This street breaches the wall somewhere new: splice in a real gate
            // node at each crossing point and force the whole run primary — a
            // street through the wall is automatically a main road (see the
            // edit-time model comment above constrainNodePosition).
            const hits = wallCrossingPoints(A.point, B.point, wall)
            let prevId = a
            for (const hit of hits) {
              const gateId = nanoid(8)
              scene.roadNodes.push({ id: gateId, point: hit, kind: 'gate' })
              scene.roadEdges.push({ id: nanoid(8), a: prevId, b: gateId, kind: 'primary' })
              prevId = gateId
            }
            scene.roadEdges.push({ id: nanoid(8), a: prevId, b, kind: 'primary' })
            rebuildDerived(scene)
            reflowBuildingsInScene(scene)
            return scene
          }
        }
        // A street touching a plaza or gate defaults to a main (primary) road.
        const primary = A.kind === 'plaza' || A.kind === 'gate' || B.kind === 'plaza' || B.kind === 'gate'
        scene.roadEdges.push({ id: nanoid(8), a, b, kind: primary ? 'primary' : 'secondary' })
        rebuildDerived(scene)
        reflowBuildingsInScene(scene)
        return scene
      })
    },

    setRoadEdgeKind: (id, kind) =>
      recordMutate((scene) => {
        const e = scene.roadEdges.find((x) => x.id === id)
        if (e) e.kind = kind
        rebuildDerived(scene)
        reflowBuildingsInScene(scene)
        return scene
      }),

    deleteRoadNode: (id) =>
      recordMutate((scene) => {
        scene.roadNodes = scene.roadNodes.filter((n) => n.id !== id)
        scene.roadEdges = scene.roadEdges.filter((e) => e.a !== id && e.b !== id)
        rebuildDerived(scene)
        reflowBuildingsInScene(scene)
        return scene
      }),

    deleteRoadEdge: (id) =>
      recordMutate((scene) => {
        scene.roadEdges = scene.roadEdges.filter((e) => e.id !== id)
        rebuildDerived(scene)
        reflowBuildingsInScene(scene)
        return scene
      }),

    reflowBuildings: () =>
      mutate((scene) => {
        reflowBuildingsInScene(scene)
        return scene
      }),

    addBuilding: (b) =>
      recordMutate((scene) => {
        const districtId = districtAt(scene, { x: b.x, y: b.y })
        scene.buildings.push({ ...b, id: nanoid(8), districtId })
        return scene
      }),

    placeConformingBuilding: (p) => {
      const scene0 = get().scene
      const districtId = districtAt(scene0, p)
      const district = districtId ? scene0.districts.find((d) => d.id === districtId) : undefined
      // No district here at all (open ground) — a generic building always has
      // to conform to a real lot, so there's nothing to conform to and nothing
      // gets placed, same as a lot that fails any other procedural rule.
      if (!district) return false
      const rng = makeRng((scene0.params.seed ^ hashId(district.id)) >>> 0)
      const walledPolys = scene0.districts.filter((d) => d.walled).map((d) => d.polygon)
      const lot = findDistrictLotAt(
        district,
        scene0.roads,
        scene0.river,
        scene0.wall,
        walledPolys,
        rng,
        scene0.params.buildingDensity,
        p,
      )
      if (!lot) return false
      recordMutate((scene) => {
        scene.buildings.push({
          id: nanoid(8),
          x: lot.x,
          y: lot.y,
          w: lot.w,
          h: lot.h,
          rotation: 0,
          footprint: lot.footprint,
          districtId: district.id,
          isCustom: true,
          businessType: 'generic',
          name: undefined,
          laneSnapped: true,
          lot: lot.lot,
        })
        return scene
      })
      return true
    },

    startMerge: (id) => set({ mergeFrom: id }),
    cancelMerge: () => set({ mergeFrom: null }),

    mergeBuildings: (id) => {
      const fromId = get().mergeFrom
      set({ mergeFrom: null })
      if (!fromId) return { ok: false, reason: 'No building armed to merge from.' }
      if (fromId === id) return { ok: false, reason: 'Pick a different building to merge with.' }
      const scene0 = get().scene
      const a = scene0.buildings.find((x) => x.id === fromId)
      const b = scene0.buildings.find((x) => x.id === id)
      if (!a || !b) return { ok: false, reason: 'Building not found.' }
      // From here on, both buildings are known — log every failure with full
      // repro detail on both (see `logMergeFailure`), since these are all
      // potentially-reproducible geometry bugs rather than ordinary UI
      // misclicks like "no building armed".
      const fail = (reason: string) => {
        logMergeFailure(reason, a, b)
        return { ok: false, reason }
      }
      if (!a.laneSnapped || !b.laneSnapped) {
        return fail('Only lane-locked buildings can be merged.')
      }
      if (!a.districtId || a.districtId !== b.districtId) {
        return fail('Buildings must be in the same district to merge.')
      }
      // Same BLOCK, not just close — otherwise two lots facing each other
      // across a lane would count as "adjacent".
      const blockA = blockContaining(scene0, a.districtId, { x: a.x, y: a.y })
      const blockB = blockContaining(scene0, a.districtId, { x: b.x, y: b.y })
      if (!blockA || blockA !== blockB) {
        return fail("Those buildings aren't in the same block.")
      }
      // Both buildings must still carry the raw LOT they were fitted to (see
      // `Building.lot`) — lot-fill generation, a hand-placed conforming
      // building, and a previous merge (whose own `lot` is the union of its
      // two source lots) all set one. Adjacent lots tile their block edge to
      // edge with NO gap, unlike their beveled/inset footprints, so merging
      // them is a plain, exact polygon union — no gap to bridge, no bevel
      // notches to patch, none of the hand-rolled stitching this feature used
      // to need. A building without one (e.g. loaded from a map saved before
      // this field existed) simply can't be merged; there's no bevel-bridging
      // fallback anymore.
      if (!a.lot || !b.lot) {
        return fail("This building predates lot data and can't be merged.")
      }
      const unioned = unionPolygonsRobust([a.lot, b.lot])
      if (unioned.length > 1) {
        // More than one ring means the lots didn't fuse into a single shape
        // — usually because they simply aren't next to each other, more
        // rarely because they'd enclose empty space between them (a
        // courtyard-shaped hole, which this app's single-ring footprints
        // can't represent) or because of a real geometry bug in the merge
        // itself. All three look the same from here, so the log (see
        // `logMergeFailure`) is what actually distinguishes them, not this
        // message.
        return fail("Those buildings aren't next to each other.")
      }
      if (unioned.length !== 1 || unioned[0].length < 3) {
        return fail("Those buildings aren't next to each other.")
      }
      const mergedLot = unioned[0]
      const district = scene0.districts.find((d) => d.id === a.districtId)
      const buildingGap = district?.buildingGap ?? scene0.params.buildingGap ?? 1.5
      const wallGap = Math.max(0.4, buildingGap / 2)
      // Same inset + bevel a freshly-generated lot gets (buildings.ts) — via
      // Clipper's offsetting, which (unlike `insetPolygon`) resolves the
      // "split events" a concave merged-lot shape (an L or U from several
      // merges) can produce, instead of silently folding.
      const inset = offsetPolygonRobust(mergedLot, -wallGap)
      if (inset.length !== 1 || inset[0].length < 3) {
        return fail("Those buildings don't share a wall.")
      }
      const footprintAbs = bevelCorners(inset[0], 0.08)
      if (footprintAbs.length < 3) {
        return fail("Those buildings don't share a wall.")
      }
      const name = a.name && b.name ? `${a.name} & ${b.name}` : (a.name ?? b.name)
      const businessType = a.businessType ?? b.businessType
      const c = centroid(footprintAbs)
      const xs = footprintAbs.map((p) => p.x)
      const ys = footprintAbs.map((p) => p.y)
      const w = Math.max(...xs) - Math.min(...xs)
      const h = Math.max(...ys) - Math.min(...ys)
      const footprint = footprintAbs.map((p) => ({ x: p.x - c.x, y: p.y - c.y }))
      recordMutate((scene) => {
        scene.buildings = scene.buildings.filter((x) => x.id !== fromId && x.id !== id)
        scene.buildings.push({
          id: nanoid(8),
          x: c.x,
          y: c.y,
          w,
          h,
          rotation: 0,
          footprint,
          districtId: a.districtId,
          isCustom: true,
          laneSnapped: true,
          businessType,
          name,
          lot: mergedLot,
        })
        return scene
      })
      return { ok: true }
    },

    updateBuilding: (id, partial) =>
      mutate((scene) => {
        const idx = scene.buildings.findIndex((x) => x.id === id)
        if (idx >= 0) {
          const original = scene.buildings[idx]
          const merged = { ...original, ...partial }
          // Re-derive owning district if the building moved.
          if (partial.x !== undefined || partial.y !== undefined) {
            merged.districtId = districtAt(scene, { x: merged.x, y: merged.y })
          }
          scene.buildings[idx] = merged
          // A landmark's footprint governs which of its district's ordinary
          // lots get carved out — resized/rotated/moved (without crossing
          // into a different district, which is left alone as too rare an
          // edge case to chase here), the rest of the district must reflow
          // around it.
          const isLandmarkLike = merged.isLandmark || merged.businessType === 'landmark'
          const geometryChanged =
            partial.x !== undefined ||
            partial.y !== undefined ||
            partial.w !== undefined ||
            partial.h !== undefined ||
            partial.rotation !== undefined
          if (isLandmarkLike && geometryChanged && merged.districtId && merged.districtId === original.districtId) {
            reflowDistrictForLandmark(scene, merged.districtId, merged)
          }
        }
        return scene
      }),

    moveBuilding: (id, dx, dy) =>
      mutate((scene) => {
        const b = scene.buildings.find((x) => x.id === id)
        if (b) {
          const oldDistrictId = b.districtId
          b.x += dx
          b.y += dy
          b.districtId = districtAt(scene, { x: b.x, y: b.y })
          const isLandmarkLike = b.isLandmark || b.businessType === 'landmark'
          if (isLandmarkLike && b.districtId && b.districtId === oldDistrictId) {
            reflowDistrictForLandmark(scene, b.districtId, b)
          }
        }
        return scene
      }),

    deleteBuilding: (id) =>
      recordMutate((scene) => {
        const removed = scene.buildings.find((x) => x.id === id)
        scene.buildings = scene.buildings.filter((x) => x.id !== id)
        // Deleting a procedural landmark reflows its district from scratch
        // without one — ordinary lot-fill buildings claim the space, as if the
        // district never had a landmark, rather than leaving a bare gap.
        if (removed?.isLandmark && removed.districtId) {
          const district = scene.districts.find((d) => d.id === removed.districtId)
          if (district) {
            district.noLandmark = true
            const seed = scene.seeds.find((x) => x.id === district.id)
            if (seed) seed.noLandmark = true
            scene.buildings = scene.buildings.filter((b) => b.isCustom || b.districtId !== district.id)
            const rng = makeRng((scene.params.seed ^ hashId(district.id)) >>> 0)
            const walledPolys = scene.districts.filter((d) => d.walled).map((d) => d.polygon)
            const fresh = generateDistrictBuildings(
              district,
              scene.roads,
              scene.river,
              scene.wall,
              walledPolys,
              rng,
              scene.params.buildingDensity,
            )
            scene.buildings.push(...fresh.buildings)
            scene.lanes = scene.lanes.filter((l) => l.districtId !== district.id).concat(fresh.lanes)
          }
        }
        return scene
      }),

    deleteSelected: () => {
      const sel = get().selection
      if (!sel) return
      if (sel.kind === 'building') {
        get().deleteBuilding(sel.id)
      } else if (sel.kind === 'road') {
        // A "road" selection is a graph edge (road id === edge id).
        get().deleteRoadEdge(sel.id)
      } else if (sel.kind === 'roadNode') {
        get().deleteRoadNode(sel.id)
      } else if (sel.kind === 'district') {
        get().removeDistrict(sel.id)
      }
      set({ selection: null })
    },

    undo: () =>
      set((state) => {
        if (state.history.past.length === 0) return {}
        const past = [...state.history.past]
        const prev = past.pop()!
        const future = [cloneScene(state.scene), ...state.history.future]
        return { scene: prev, history: { past, future }, selection: null }
      }),

    redo: () =>
      set((state) => {
        if (state.history.future.length === 0) return {}
        const future = [...state.history.future]
        const next = future.shift()!
        const past = [...state.history.past, cloneScene(state.scene)]
        return { scene: next, history: { past, future }, selection: null }
      }),

    canUndo: () => get().history.past.length > 0,
    canRedo: () => get().history.future.length > 0,
  }
})

// Dev-only: expose the store for manual/automated verification in the browser,
// plus console commands for pulling the merge-failure log (see
// `logMergeFailure`) — run `downloadMergeFailureLog()` in devtools to get a
// JSON file with everything needed to reproduce every merge failure hit this
// browser, or `clearMergeFailureLog()` to start fresh.
if (import.meta.env.DEV) {
  ;(
    window as unknown as {
      mapStore?: typeof useMapStore
      downloadMergeFailureLog?: typeof downloadMergeFailureLog
      clearMergeFailureLog?: typeof clearMergeFailureLog
    }
  ).mapStore = useMapStore
  ;(window as unknown as { downloadMergeFailureLog?: typeof downloadMergeFailureLog }).downloadMergeFailureLog =
    downloadMergeFailureLog
  ;(window as unknown as { clearMergeFailureLog?: typeof clearMergeFailureLog }).clearMergeFailureLog =
    clearMergeFailureLog
}
