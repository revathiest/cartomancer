import type {
  Building,
  BuildingShape,
  BusinessType,
  DistrictType,
  MapScene,
} from '../shared/types.ts'

/**
 * Population estimation from the map itself: every building contributes
 * residents based on its footprint (size), its use (type), and the character of
 * the district it sits in (how tall the buildings run and how densely people
 * live there).
 *
 * The map is stylised (buildings are drawn larger than true scale for
 * legibility), so the constants below are calibrated to land a typical generated
 * city in a believable range rather than to convert footprints to literal metres.
 */

/** Average number of storeys by district character. */
const STORIES: Record<DistrictType, number> = {
  slum: 1.6,
  residential: 2,
  market: 2.4,
  noble: 2.4,
  castle: 3,
  temple: 2,
  industrial: 1.5,
  suburb: 1.6,
  docks: 1.8,
  shanty: 1.2,
  farmland: 1.3,
  cemetery: 1.2,
  tannery: 1.4,
  fairground: 1.3,
  fishmarket: 1.6,
  shipyard: 1.4,
  warehouse: 2,
}

/**
 * How densely people live in each district, relative to a plain residential
 * quarter (= 1). Slums pack in; nobles and civic quarters sprawl.
 */
const CROWDING: Record<DistrictType, number> = {
  slum: 1.9,
  residential: 1,
  market: 1.15,
  noble: 0.45,
  castle: 0.35,
  temple: 0.4,
  industrial: 0.7,
  suburb: 0.8,
  docks: 0.5,
  shanty: 2.2,
  farmland: 0.15,
  cemetery: 0.05,
  tannery: 0.4,
  fairground: 0.2,
  fishmarket: 0.6,
  shipyard: 0.3,
  warehouse: 0.2,
}

/**
 * Fraction of a structure that is actually living quarters, by use. The rest is
 * workshop / shopfront / sanctuary / civic hall with no permanent residents.
 */
const RESIDENTIAL_FRACTION: Record<BusinessType, number> = {
  generic: 1,
  inn: 0.85,
  tavern: 0.7,
  shop: 0.8,
  smithy: 0.6,
  market: 0.15,
  temple: 0.3,
  guild: 0.4,
  landmark: 0.15,
}

/** Footprint area as a fraction of the building's bounding box, by silhouette. */
const SHAPE_AREA: Record<BuildingShape, number> = {
  rect: 1,
  l: 0.7,
  t: 0.65,
  u: 0.7,
  courtyard: 0.72,
  round: 0.785,
  octagon: 0.83,
  tower: 0.6,
  temple: 0.7,
  keep: 0.8,
  hall: 0.9,
}

/**
 * Living space (in map units²) that one resident occupies.
 * Calibrated so a default residential quarter houses a believable number of
 * people (a ~30×24 two-storey house ≈ 12 residents).
 */
const FLOOR_UNITS_PER_PERSON = 120

/** Landmarks are civic/monumental — never counted as dense housing. */
const LANDMARK_RESIDENTIAL_CAP = 0.15

export type PopulationEstimate = {
  total: number
  buildingCount: number
  /** Residents-per-building, averaged over buildings that house anyone. */
  averagePerBuilding: number
  /** A rough settlement-size label for the total. */
  classification: string
}

/** Residents contributed by one building given its district's character. */
function buildingResidents(b: Building, districtType: DistrictType): number {
  const shapeArea = SHAPE_AREA[b.shape ?? 'rect'] ?? 1
  const footprint = Math.max(0, b.w) * Math.max(0, b.h) * shapeArea
  const floorArea = footprint * STORIES[districtType]
  let resFraction = RESIDENTIAL_FRACTION[b.businessType ?? 'generic']
  if (b.isLandmark) resFraction = Math.min(resFraction, LANDMARK_RESIDENTIAL_CAP)
  return (floorArea * resFraction * CROWDING[districtType]) / FLOOR_UNITS_PER_PERSON
}

/** D&D-flavoured settlement-size bands for a resident count. */
export function classifySettlement(total: number): string {
  if (total < 20) return 'Thorp'
  if (total < 80) return 'Hamlet'
  if (total < 400) return 'Village'
  if (total < 900) return 'Small town'
  if (total < 2_000) return 'Large town'
  if (total < 5_000) return 'Small city'
  if (total < 25_000) return 'Large city'
  return 'Metropolis'
}

/** Estimate the resident population of the current scene. */
export function estimatePopulation(scene: MapScene): PopulationEstimate {
  const typeById = new Map<string, DistrictType>()
  for (const d of scene.districts) typeById.set(d.id, d.type)

  let total = 0
  let housing = 0

  for (const b of scene.buildings) {
    // Fall back to a plain residential character for buildings placed outside
    // any district (rare — hand-placed on open parchment).
    const dt = (b.districtId && typeById.get(b.districtId)) || 'residential'
    const residents = buildingResidents(b, dt)
    total += residents
    if (residents > 0.5) housing++
  }

  const roundedTotal = Math.round(total)
  return {
    total: roundedTotal,
    buildingCount: scene.buildings.length,
    averagePerBuilding: housing > 0 ? total / housing : 0,
    classification: classifySettlement(roundedTotal),
  }
}
