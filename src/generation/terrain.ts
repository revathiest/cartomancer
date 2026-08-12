import type { Coast, GenParams, Point } from '../shared/types.ts'
import { closestPointOnSegment, dist } from '../shared/geometry.ts'
import { landFromCoast, makeCoast, seaDirection, type LandClip } from './coast.ts'
import type { Rng } from './rng.ts'

/**
 * The physical substrate the whole city is generated ON: where the land and
 * water are, and how the city should orient to them. Every generation pass
 * queries this instead of assuming an infinite buildable plane, so the coast
 * shapes the city rather than being clipped into it afterwards.
 *
 * A landlocked city gets an all-land terrain (isLand → true, distToWater → ∞),
 * so nothing about non-coastal generation changes.
 */
export type Terrain = {
  coast: Coast | null
  land: LandClip | null
  isLand: (p: Point) => boolean
  /** Distance from a point to the nearest water (the shore). Infinity if landlocked. */
  distToWater: (p: Point) => number
  /** Unit vector pointing INLAND (away from the water), or null if landlocked. */
  inland: Point | null
}

function distToPolyline(p: Point, line: Point[]): number {
  let best = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    best = Math.min(best, dist(p, closestPointOnSegment(p, line[i], line[i + 1])))
  }
  return best
}

/** Build the terrain for the given params, centred on `center` with buildable
 *  radius `radius`. Only the sea is modelled today; the river remains a separate
 *  water feature for now (rivers/lakes will fold in here later). */
export function makeTerrain(
  params: GenParams,
  center: Point,
  radius: number,
  size: number,
  rng: Rng,
  existingCoast?: Coast | null,
): Terrain {
  if (!params.hasCoast) {
    return { coast: null, land: null, isLand: () => true, distToWater: () => Infinity, inland: null }
  }
  // Reuse a previously-generated coast on edits so the shoreline never shifts.
  let coast: Coast
  let land: LandClip
  if (existingCoast) {
    coast = existingCoast
    land = landFromCoast(existingCoast)
  } else {
    const made = makeCoast(center, radius, size, params.coastSide, params.coastKind, rng)
    coast = made.coast
    land = made.land
  }
  const sea = seaDirection(params.coastSide)
  return {
    coast,
    land,
    isLand: land.isLand,
    distToWater: (p) => distToPolyline(p, coast.shore),
    inland: { x: -sea.x, y: -sea.y },
  }
}
