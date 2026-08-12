import type { Coast, DistrictSeed, GenParams, MapScene, Point } from '../shared/types.ts'
import { PIER_DISTRICT_TYPES, WORLD_SIZE, isOuterDistrict } from '../shared/types.ts'
import { pointInPolygon, resample } from '../shared/geometry.ts'
import { hashString, makeRng } from './rng.ts'

/** District count at which the world is exactly WORLD_SIZE (the default city). */
const REFERENCE_DISTRICTS = 12

/**
 * The absolute world size for a given district count. Districts keep a roughly
 * constant area, so the city physically GROWS as districts are added and shrinks
 * as they are removed (area ∝ count ⇒ side ∝ √count), rather than subdividing a
 * fixed footprint. At the reference count this is exactly WORLD_SIZE, so the
 * default city is unchanged.
 */
export function worldSizeForCount(count: number): number {
  return Math.round(WORLD_SIZE * Math.sqrt(Math.max(1, count) / REFERENCE_DISTRICTS))
}
import { generateDistricts } from './districts.ts'
import { generateWall, wallGateAnchors } from './wall.ts'
import { buildRoadNetwork, derivedRoads } from './roads.ts'
import { computeBridges, generateRiver, riverCurve } from './river.ts'
import { generateBuildings } from './buildings.ts'
import { clipPolylineToLand, makePiers, seaDirection } from './coast.ts'

/**
 * Orchestrates all generation passes into a single MapScene. Everything is
 * derived deterministically from `params.seed`, so the same params always
 * reproduce the same city.
 *
 * When `seeds` is supplied, the districts are tessellated from that dictated
 * layout (positions/types/names) instead of a fresh random scatter — this is
 * how user-controlled district placement re-generates the rest of the city.
 */
export function generateCity(params: GenParams, seeds?: DistrictSeed[], existingCoast?: Coast | null): MapScene {
  // Size the world to the district count so districts keep a constant area and
  // the city grows/shrinks with the count. When the user has dictated a seed
  // layout, that layout's own count drives the size.
  const count = seeds && seeds.length >= 2 ? seeds.length : params.districtCount
  const size = worldSizeForCount(count)
  const rng = makeRng(params.seed)

  const districtResult = generateDistricts(params, rng, size, seeds, existingCoast)
  const { seeds: resolvedSeeds, center, footprintRadius, boundary, wallBoundary } = districtResult
  // The district pass already keeps seeds on land and clips everything to the
  // shore, so the full requested count survives.
  const districts = districtResult.districts
  const coast = districtResult.coast
  const land = districtResult.land

  // Piers along the working-boat waterfront (docks, fishmarket, shipyard —
  // warehouses have none). These were zoned in the district pass. Each district
  // draws from its OWN deterministic RNG so changing one district's type later
  // (which re-runs this) leaves every other waterfront's piers untouched.
  if (coast) {
    coast.piers = districts
      .filter((d) => PIER_DISTRICT_TYPES.has(d.type))
      .flatMap((d) => makePiers(d.polygon, params.coastSide, footprintRadius, makeRng((params.seed ^ hashString(d.id)) >>> 0)))
  }

  // The wall traces the INNER core boundary — outer districts sit outside it.
  const wall = params.hasWall ? generateWall(wallBoundary) : null

  // Gate anchors seed the radial roads; actual gates are then read back from
  // where those roads cross the wall.
  const anchors = wall
    ? wallGateAnchors(wallBoundary, center, params.gateCount, rng)
    : []

  const siteCenters = districts.map((d) => d.site)
  const siteIsInner = districts.map((d) => !isOuterDistrict(d.type))
  const net = buildRoadNetwork(center, siteCenters, anchors, footprintRadius, rng, siteIsInner, {
    water: coast?.water ?? null,
    wall: wall ? wallBoundary : null,
  })
  let roadNodes = net.nodes
  let roadEdges = net.edges

  // Keep the road network out of the water: drop gates in the sea, and drop exits
  // that are in the sea OR point out toward the water (roads only leave landward).
  if (land && coast) {
    const dir = seaDirection(coast.side)
    const seaward = (p: Point) => (p.x - center.x) * dir.x + (p.y - center.y) * dir.y > 0
    const remove = new Set(
      roadNodes
        .filter((n) => {
          if (n.kind === 'gate') return !land!.isLand(n.point)
          if (n.kind === 'exit') return !land!.isLand(n.point) || seaward(n.point)
          return false
        })
        .map((n) => n.id),
    )
    if (remove.size) {
      roadNodes = roadNodes.filter((n) => !remove.has(n.id))
      roadEdges = roadEdges.filter((e) => !remove.has(e.a) && !remove.has(e.b))
    }
  }
  const roads = derivedRoads(roadNodes, roadEdges, coast?.water ?? null)

  // Gates ARE the gate-kind road nodes on the wall — the single source of truth.
  if (wall) {
    wall.gates = roadNodes.filter((n) => n.kind === 'gate').map((n) => ({ id: n.id, point: n.point }))
  }

  const river = params.hasRiver
    ? generateRiver(center, footprintRadius, size, roads, rng, params.riverWidth)
    : null

  // River flows INTO the sea: keep only its on-land run and let the mouth reach
  // just past the shore — never running across the open water.
  if (coast && land && river && river.points.length >= 2) {
    const run = clipPolylineToLand(riverCurve(river.points), land)
    if (run.length >= 2) {
      const dir = seaDirection(coast.side)
      const dot = (p: Point) => p.x * dir.x + p.y * dir.y
      const endIsMouth = dot(run[run.length - 1]) >= dot(run[0])
      const mouth = endIsMouth ? run[run.length - 1] : run[0]
      const ext = { x: mouth.x + dir.x * 28, y: mouth.y + dir.y * 28 }
      if (endIsMouth) run.push(ext)
      else run.unshift(ext)
      river.points = resample(run, Math.max(40, footprintRadius * 0.12))
      river.bridges = computeBridges(river.points, roads, river.width)
    }
  }

  const built = generateBuildings(districts, roads, river, wall, params.seed, params.buildingDensity)
  // Safety net: never leave a building standing in the water (clip slivers along a
  // concave bay shore can otherwise place one there).
  const buildings = coast
    ? built.buildings.filter((b) => !pointInPolygon({ x: b.x, y: b.y }, coast!.water))
    : built.buildings
  const lanes = built.lanes

  return {
    bounds: { width: size, height: size },
    params: { ...params },
    seeds: resolvedSeeds,
    districts,
    roadNodes,
    roadEdges,
    roads,
    wall,
    river,
    coast,
    buildings,
    lanes,
    boundary,
    wallBoundary,
    footprintRadius,
  }
}
