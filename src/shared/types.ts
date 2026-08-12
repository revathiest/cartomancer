// Core data model for a map scene. Kept intentionally generic where practical
// (Point, Polygon, Polyline) so a future DungeonScene generator can reuse the
// same geometry/export primitives without city-specific coupling.

export type Point = { x: number; y: number }
export type Polygon = Point[]
export type Polyline = Point[]

export const DISTRICT_TYPES = [
  // Inner (walled-core) types.
  'castle',
  'noble',
  'temple',
  'market',
  'residential',
  'slum',
  'industrial',
  // Outer (outside-the-wall) types — sprawl, agriculture, and noxious trades.
  'suburb',
  'docks',
  'shanty',
  'farmland',
  'cemetery',
  'tannery',
  'fairground',
  // Waterfront types — sit against the shore, outside the wall.
  'fishmarket',
  'shipyard',
  'warehouse',
] as const

export type DistrictType = (typeof DISTRICT_TYPES)[number]

/** District types that grow OUTSIDE the city wall (sprawl / fields / waterfront). */
export const OUTER_DISTRICT_TYPES = new Set<DistrictType>([
  'suburb',
  'docks',
  'shanty',
  'farmland',
  'cemetery',
  'tannery',
  'fairground',
  'fishmarket',
  'shipyard',
  'warehouse',
])

/** True when this district type belongs outside the wall rather than in the core. */
export function isOuterDistrict(type: DistrictType): boolean {
  return OUTER_DISTRICT_TYPES.has(type)
}

/** District types that sit AGAINST the water (get a shore-following strip). */
export const WATERFRONT_DISTRICT_TYPES = new Set<DistrictType>(['docks', 'fishmarket', 'shipyard', 'warehouse'])

export function isWaterfrontDistrict(type: DistrictType): boolean {
  return WATERFRONT_DISTRICT_TYPES.has(type)
}

/** Waterfront types that get piers (working boat frontage); warehouses don't. */
export const PIER_DISTRICT_TYPES = new Set<DistrictType>(['docks', 'fishmarket', 'shipyard'])

export type District = {
  id: string
  type: DistrictType
  polygon: Polygon
  /** Voronoi seed / centroid used for labelling and road anchoring. */
  site: Point
  name: string
  /** Per-district building density multiplier (1 = the district type's default). */
  density: number
  /** Relative size weight (1 = neutral); larger claims more area from neighbours. */
  size: number
  /** Per-district building footprint scale (1 = the type's default). */
  buildingSize: number
  /** Block size between lanes (× a building plot). */
  blockSize: number
  /** Walkway width left between blocks. */
  laneWidth: number
  /** Gap kept between buildings within a block. */
  buildingGap: number
  /** Whether this district is enclosed by its own wall (with gates where roads cross). */
  walled: boolean
  /** Set once its procedurally-placed landmark is deleted, so a reflow doesn't
   *  just put another one back — ordinary lot-fill buildings claim the space
   *  instead, as if the district never had a landmark. */
  noLandmark?: boolean
}

/**
 * The user-controllable definition of a district: where its Voronoi generator
 * point sits, plus its type, name, size, and density. Editing these and
 * re-tessellating lets the user dictate district placement, count, type,
 * naming, and how much area each claims.
 */
export type DistrictSeed = {
  id: string
  /** Voronoi generator point — this is what the user drags to place a district. */
  site: Point
  type: DistrictType
  name: string
  /** Per-district building density multiplier (1 = the district type's default). */
  density: number
  /** Relative size weight (1 = neutral) used by the weighted power diagram. */
  size: number
  /** Per-district building footprint scale (1 = the type's default). */
  buildingSize: number
  /** Block size between lanes (× a building plot). */
  blockSize: number
  /** Walkway width left between blocks. */
  laneWidth: number
  /** Gap kept between buildings within a block. */
  buildingGap: number
  /** Whether this district is enclosed by its own wall. */
  walled: boolean
  /** See District.noLandmark. */
  noLandmark?: boolean
}

export type RoadKind = 'primary' | 'secondary'

/**
 * A road-network node the user can place and drag: an intersection, a dead-end,
 * a plaza, or a gate/exit. Roads are edges between nodes.
 */
export type RoadNodeKind = 'plaza' | 'gate' | 'exit' | 'junction'

export type RoadNode = {
  id: string
  point: Point
  kind: RoadNodeKind
}

/** A road segment connecting two nodes. Rendered as an organic wavy path. */
export type RoadEdge = {
  id: string
  a: string
  b: string
  kind: RoadKind
}

/** Derived renderable polyline for one edge (recomputed from node positions). */
export type Road = {
  id: string
  kind: RoadKind
  points: Polyline
}

/** An interior footpath/alley within a district (buildings front onto these). */
export type Lane = {
  districtId: string
  points: Polyline
  /** Lower = wider/more major lane. */
  depth: number
}

export type Gate = {
  id: string
  /** Position on the wall polygon. */
  point: Point
}

export type Wall = {
  polygon: Polygon
  gates: Gate[]
}

/** A bridge where a road crosses the river: centred at (x,y), oriented along the
 *  road (`angle`), long enough to span the water (`length`), road-wide (`width`). */
export type Bridge = {
  x: number
  y: number
  angle: number
  length: number
  width: number
}

export type River = {
  /** A FEW control points; the drawn river is a smooth curve through them. */
  points: Polyline
  /** Drawn width of the water. */
  width: number
  /** Bridges where roads cross the river. */
  bridges: Bridge[]
}

/** A pier/jetty jutting from the shore into the water. */
export type Pier = {
  /** Base point on the shore. */
  x: number
  y: number
  /** Direction out to sea (radians). */
  angle: number
  length: number
  width: number
}

export type CoastSide = 'N' | 'E' | 'S' | 'W'
export type CoastKind = 'sea' | 'bay'

/** A coastline on one side of the city: land on one side, open water on the other. */
export type Coast = {
  side: CoastSide
  kind: CoastKind
  /** Drawn shoreline, spanning the whole map. */
  shore: Polyline
  /** Filled water polygon (the sea side, out to the map edge). */
  water: Polygon
  /** Piers along the harbour shore. */
  piers: Pier[]
}

export type BusinessType =
  | 'generic'
  | 'inn'
  | 'smithy'
  | 'temple'
  | 'shop'
  | 'tavern'
  | 'market'
  | 'guild'
  | 'landmark'

/** Footprint silhouette. Some are type-exclusive (keep = castle, temple = temple). */
export type BuildingShape =
  | 'rect'
  | 'l'
  | 't'
  | 'u'
  | 'courtyard'
  | 'round'
  | 'octagon'
  | 'tower'
  | 'temple'
  | 'keep'
  | 'hall'

export type Building = {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** Rotation in radians. */
  rotation: number
  /** Footprint silhouette (defaults to 'rect' for older/custom buildings). */
  shape?: BuildingShape
  /** Explicit polygonal footprint (local coords, centred on x,y, unrotated).
   *  When present it is drawn verbatim — used by the lot-fill layout so buildings
   *  tile their block. Falls back to the `shape` silhouette when absent. */
  footprint?: Point[]
  /** A prominent signature building for its district. */
  isLandmark?: boolean
  districtId: string | null
  name?: string
  businessType?: BusinessType
  /** True when hand-placed by the user rather than generated. */
  isCustom: boolean
  /** True for a hand-placed building that was fitted to a real lot in its
   *  district's own block layout (see placeConformingBuilding). Its position,
   *  size, and rotation are locked — moving, resizing, or rotating it would
   *  pull it out of the lot it was fitted to. */
  laneSnapped?: boolean
  /** The RAW lot polygon (world-space, pre-inset, pre-bevel — before
   *  `wallGap`/`bevelCorners` shrink it into this building's own `footprint`)
   *  this building was fitted to. Present for any lane-snapped building whose
   *  origin traces back to a real lot: lot-fill generation, a hand-placed
   *  conforming building, or a previous merge (whose own `lot` is the union
   *  of its two source buildings' lots). Adjacent lots tile their block edge
   *  to edge with NO gap, unlike the beveled/inset footprints — merging two
   *  buildings unions their `lot`s directly instead of bridging the visible
   *  gap between their footprints. Absent on buildings from before this
   *  field existed (e.g. an older saved map); merging falls back to the
   *  older gap-bridging path when either side lacks one. */
  lot?: Point[]
}

export type GenParams = {
  seed: number
  districtCount: number
  gateCount: number
  /** How big a block is between lanes (× a building plot). Higher = lanes farther apart. */
  blockSize: number
  /** Width of the walkway gap left between blocks (how much buildings avoid lanes). */
  laneWidth: number
  /** Gap kept between buildings within a block. */
  buildingGap: number
  hasWall: boolean
  hasRiver: boolean
  /** Drawn width of the river. */
  riverWidth: number
  /** Whether the city sits on a coast (open water on one side). */
  hasCoast: boolean
  /** Which map edge the water is on. */
  coastSide: CoastSide
  /** Open sea (a shore across one side) or a bay (water curving inland). */
  coastKind: CoastKind
  buildingDensity: number
  cityName: string
}

/** Single source of truth for the whole scene. */
export type MapScene = {
  bounds: { width: number; height: number }
  params: GenParams
  /** District generator points/types/names — the editable layout the districts
   * are tessellated from. */
  seeds: DistrictSeed[]
  districts: District[]
  /** Editable road graph. `roads` is the derived render geometry. */
  roadNodes: RoadNode[]
  roadEdges: RoadEdge[]
  roads: Road[]
  wall: Wall | null
  river: River | null
  /** Coastline + water, when the city is coastal. */
  coast: Coast | null
  buildings: Building[]
  /** Interior footpaths within districts. */
  lanes: Lane[]
  /** Full city-extent polygon (all districts, inner + outer, clip to this). */
  boundary: Polygon
  /** Inner core polygon the wall traces (encloses only the inner districts).
   *  Kept so the wall can be toggled on/off without regenerating. */
  wallBoundary: Polygon
  /** Footprint radius (used to regenerate the river on toggle). */
  footprintRadius: number
}

export const DEFAULT_PARAMS: GenParams = {
  seed: 1337,
  districtCount: 12,
  gateCount: 4,
  blockSize: 2.6,
  laneWidth: 7,
  buildingGap: 1.5,
  hasWall: true,
  hasRiver: true,
  riverWidth: 30,
  hasCoast: false,
  coastSide: 'W',
  coastKind: 'sea',
  buildingDensity: 1,
  cityName: 'Bramblehold',
}

export const WORLD_SIZE = 2000
