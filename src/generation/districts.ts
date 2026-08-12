import type { Coast, CoastSide, District, DistrictSeed, DistrictType, GenParams, Point, Polygon } from '../shared/types.ts'
import { isOuterDistrict, isWaterfrontDistrict } from '../shared/types.ts'
import { centroid, clipPolygonHalfPlane, convexHull, dist, meanPoint, resample, signedArea, smoothClosed } from '../shared/geometry.ts'
import type { Rng } from './rng.ts'
import { hashString } from './rng.ts'
import { clipToLand, polyIsSubstantial, type LandClip } from './coast.ts'
import { makeTerrain, type Terrain } from './terrain.ts'

export type DistrictResult = {
  districts: District[]
  /** The resolved seed list (generator point + type + name) the districts were built from. */
  seeds: DistrictSeed[]
  sites: Point[]
  cellPolygons: Polygon[]
  center: Point
  footprintRadius: number
  /** Coastline + land clip (when the city is coastal), else null. */
  coast: Coast | null
  land: LandClip | null
  /** Full city-extent polygon — every district (inner + outer) is clipped to this. */
  boundary: Polygon
  /** Inner core polygon the wall traces (encloses only the inner districts). */
  wallBoundary: Polygon
}

const DISTRICT_NAME_PARTS = {
  prefix: ['Old', 'High', 'Low', 'North', 'South', 'East', 'West', 'Kings', 'Silver', 'Grey', 'Iron', 'Rose'],
  suffix: {
    castle: ['Keep', 'Citadel', 'Hold'],
    noble: ['Heights', 'Crescent', 'Gardens', 'Row'],
    temple: ['Sanctum', 'Cloister', 'Spire'],
    market: ['Market', 'Exchange', 'Square', 'Cross'],
    residential: ['Quarter', 'Ward', 'End', 'Commons'],
    slum: ['Warren', 'Rookery', 'Bottoms', 'Muddle'],
    industrial: ['Forge', 'Works', 'Yards', 'Mill'],
    suburb: ['Suburb', 'Faubourg', 'Outskirts', 'Approach'],
    docks: ['Docks', 'Wharf', 'Quay', 'Harbourside'],
    shanty: ['Shanties', 'Sprawl', 'Tenements', 'Fringe'],
    farmland: ['Fields', 'Granges', 'Meadows', 'Furlongs'],
    cemetery: ['Cemetery', 'Necropolis', 'Barrows', 'Rest'],
    tannery: ['Tanneries', 'Shambles', 'Reek', 'Yards'],
    fairground: ['Fairground', 'Green', 'Commons', 'Mustering'],
    fishmarket: ['Fishmarket', 'Fish Quay', 'Nets', 'Fishers'],
    shipyard: ['Shipyard', 'Slips', 'Boatyard', 'Drydock'],
    warehouse: ['Warehouses', 'Stores', 'Bond', 'Staithe'],
  } satisfies Record<DistrictType, string[]>,
}

function districtName(type: DistrictType, rng: Rng): string {
  return `${rng.pick(DISTRICT_NAME_PARTS.prefix)} ${rng.pick(DISTRICT_NAME_PARTS.suffix[type])}`
}

/**
 * Poisson-disc-style rejection sampling of district seed points inside a
 * randomly-oriented ELLIPTICAL footprint. An elliptical (rather than circular)
 * cloud gives the convex hull — and therefore the city — an elongated, less
 * round base shape; the lobed boundary added later breaks it up further.
 */
function scatterSites(
  count: number,
  rng: Rng,
  size: number,
  reject?: (p: Point) => boolean,
): { sites: Point[]; center: Point; radius: number } {
  const center = { x: size / 2, y: size / 2 }
  const radius = size * 0.4
  const aspect = rng.range(0.55, 0.82)
  const rot = rng.range(0, Math.PI)
  const rx = radius
  const ry = radius * aspect
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const minDist = (Math.sqrt(rx * ry) * 1.5) / Math.sqrt(count)

  const sample = (): Point => {
    // Uniform in the unit disc (sqrt for area-uniformity), scaled to the
    // ellipse axes, then rotated into place.
    const a = rng.next() * Math.PI * 2
    const r = Math.sqrt(rng.next())
    const ex = Math.cos(a) * r * rx
    const ey = Math.sin(a) * r * ry
    return { x: center.x + ex * cos - ey * sin, y: center.y + ex * sin + ey * cos }
  }

  const sites: Point[] = []
  // Reject seeds that fall in the water so the FULL count lands on solid ground.
  const maxTries = count * 200
  let tries = 0
  while (sites.length < count && tries < maxTries) {
    tries++
    const candidate = sample()
    if (reject && reject(candidate)) continue
    if (sites.every((s) => dist(s, candidate) >= minDist)) sites.push(candidate)
  }
  // Top up with RELAXED spacing (still keeps seeds apart so no two coincide —
  // coincident seeds produce a zero-area power cell and a lost district).
  let top = 0
  while (sites.length < count && top < count * 400) {
    top++
    const candidate = sample()
    if (reject && reject(candidate)) continue
    if (sites.every((s) => dist(s, candidate) >= minDist * 0.55)) sites.push(candidate)
  }
  // Last resort: fill any remainder on land without the spacing rule (rare).
  let z = 0
  while (sites.length < count && z < count * 1000) {
    z++
    const candidate = sample()
    if (reject && reject(candidate)) continue
    sites.push(candidate)
  }
  return { sites, center, radius }
}

/**
 * Build an irregular, gently lobed city boundary from the site hull. The hull
 * is resampled and each point pushed radially outward by a base margin
 * modulated by a few sine harmonics (with random phase), producing bays and
 * promontories instead of a smooth circle. Because every offset stays strictly
 * positive the boundary always contains the hull (and thus every site).
 */
function buildBoundary(hull: Polygon, radius: number, rng: Rng): Polygon {
  const c = centroid(hull)
  const ring = [...hull, hull[0]]
  const dense = resample(ring, radius * 0.05)
  if (dense.length > 1) dense.pop() // drop the duplicated closing point

  const phases = [rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2)]
  const amps = [rng.range(0.16, 0.26), rng.range(0.1, 0.16), rng.range(0.05, 0.1)]
  const ks = [2, 3, 5]
  const baseMargin = radius * 0.13

  const perturbed = dense.map((p) => {
    const ang = Math.atan2(p.y - c.y, p.x - c.x)
    let f = 1
    for (let i = 0; i < 3; i++) f += amps[i] * Math.sin(ks[i] * ang + phases[i])
    const dx = p.x - c.x
    const dy = p.y - c.y
    const len = Math.hypot(dx, dy) || 1
    const off = baseMargin * Math.max(0.35, f)
    return { x: p.x + (dx / len) * off, y: p.y + (dy / len) * off }
  })

  // Smooth, then resample to cap vertex count (smoothing quadruples points).
  const smoothed = smoothClosed(perturbed, 2)
  const capped = resample([...smoothed, smoothed[0]], radius * 0.06)
  if (capped.length > 1) capped.pop()
  return capped
}

const polyArea = (poly: Polygon): number => Math.abs(signedArea(poly))

/**
 * Outline of the UNION of adjacent, consistently-wound cells (the inner Voronoi
 * cells). Edges shared by two cells appear once in each direction and cancel;
 * the surviving directed edges are stitched into loops, and the largest loop is
 * returned as the outer boundary — i.e. the real border between the inner
 * districts and everything outside them, corners intact.
 */
function polygonUnionOutline(polys: Polygon[]): Polygon {
  const S = 100 // quantise to 0.01 units so shared vertices match exactly
  const key = (p: Point) => `${Math.round(p.x * S)},${Math.round(p.y * S)}`
  const ek = (a: Point, b: Point) => `${key(a)}|${key(b)}`
  const edges = new Map<string, { a: Point; b: Point }>()
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      if (key(a) === key(b)) continue
      const opp = ek(b, a)
      if (edges.has(opp)) edges.delete(opp) // interior shared edge → cancels
      else edges.set(ek(a, b), { a, b })
    }
  }
  if (edges.size === 0) return []

  const byStart = new Map<string, { a: Point; b: Point }[]>()
  for (const e of edges.values()) {
    const k = key(e.a)
    const arr = byStart.get(k)
    if (arr) arr.push(e)
    else byStart.set(k, [e])
  }

  const used = new Set<string>()
  const loops: Polygon[] = []
  for (const seed of edges.values()) {
    if (used.has(ek(seed.a, seed.b))) continue
    const loop: Point[] = []
    let cur: { a: Point; b: Point } | undefined = seed
    while (cur && !used.has(ek(cur.a, cur.b))) {
      used.add(ek(cur.a, cur.b))
      loop.push(cur.a)
      const nexts = byStart.get(key(cur.b))
      cur = nexts?.find((e) => !used.has(ek(e.a, e.b)))
    }
    if (loop.length >= 3) loops.push(loop)
  }

  let best: Polygon = []
  let bestArea = -1
  for (const lp of loops) {
    const a = polyArea(lp)
    if (a > bestArea) {
      bestArea = a
      best = lp
    }
  }
  return best
}

/**
 * Weighted power-diagram cells sized so each district's area is proportional to
 * its `size`. Positions are fixed; a per-site weight is solved iteratively
 * (capacity-constrained Lloyd) so under-sized cells grow and over-sized cells
 * shrink until every cell matches its target share of the domain.
 */
function weightedCells(sites: Point[], boundary: Polygon, targets: number[], spacing: number): Polygon[] {
  const n = sites.length
  const weights = new Array(n).fill(0)
  const sq = (p: Point) => p.x * p.x + p.y * p.y
  const domainArea = polyArea(boundary)
  const cellFor = (i: number): Polygon => {
    let cell: Polygon = boundary
    for (let j = 0; j < n && cell.length >= 3; j++) {
      if (j === i) continue
      const si = sites[i]
      const sj = sites[j]
      const nx = 2 * (sj.x - si.x)
      const ny = 2 * (sj.y - si.y)
      const c = sq(sj) - weights[j] - (sq(si) - weights[i])
      cell = clipPolygonHalfPlane(cell, nx, ny, c)
    }
    return cell.length >= 3 ? cell : []
  }

  let cells: Polygon[] = sites.map((_, i) => cellFor(i))
  for (let iter = 0; iter < 120; iter++) {
    let err = 0
    for (let i = 0; i < n; i++) {
      const a = polyArea(cells[i])
      const diff = targets[i] - a
      err += Math.abs(diff)
      // Grow under-sized cells (raise weight), shrink over-sized (lower weight).
      weights[i] += (diff / domainArea) * spacing * spacing * 6
    }
    // Keep weights zero-mean for numerical stability.
    const mean = weights.reduce((s, w) => s + w, 0) / n
    for (let i = 0; i < n; i++) weights[i] -= mean
    cells = sites.map((_, i) => cellFor(i))
    if (err / domainArea < 0.008) break
  }
  return cells
}

/**
 * Coastal tessellation. The DOCKS are a thin strip that follows the shoreline
 * (each docks seed owns a coast segment); the inland districts are a normal
 * weighted diagram that fills the land BEHIND the strip. This is what makes the
 * waterfront hug the curve of the coast instead of being blobby Voronoi cells.
 */
function coastalCells(
  seeds: DistrictSeed[],
  sites: Point[],
  targets: number[],
  boundary: Polygon,
  spacing: number,
  land: LandClip,
  side: CoastSide,
  radius: number,
): { cells: Polygon[]; innerUnclipped: Polygon[]; inlandLand: LandClip } {
  const horizontal = side === 'E' || side === 'W'
  const seaSign = side === 'E' || side === 'S' ? 1 : -1
  const inlandSign = -seaSign
  const stripDepth = radius * 0.14
  const alongOf = (p: Point) => (horizontal ? p.y : p.x)
  const crossOf = (p: Point) => (horizontal ? p.x : p.y)
  const mk = (along: number, cross: number): Point => (horizontal ? { x: cross, y: along } : { x: along, y: cross })

  // The strip's INLAND edge: the shore shifted `stripDepth` inland. Inland cells
  // are clipped to it; the docks strip fills from here out to the water.
  const inlandLand: LandClip = {
    horizontal,
    crossAt: (a) => land.crossAt(a) + inlandSign * stripDepth,
    isLand: (p) => {
      const s = land.crossAt(alongOf(p)) + inlandSign * stripDepth
      return seaSign > 0 ? crossOf(p) <= s : crossOf(p) >= s
    },
  }

  const docksIdx: number[] = []
  const inlandIdx: number[] = []
  seeds.forEach((sd, i) => (isWaterfrontDistrict(sd.type) ? docksIdx : inlandIdx).push(i))

  const out: Polygon[] = seeds.map(() => [])
  // Raw (unclipped) inner inland cells — the wall is built from these because
  // adjacent raw cells share EXACT edges (clipping densifies them and breaks the
  // union-outline edge-cancellation).
  const innerUnclipped: Polygon[] = []

  // Inland districts: weighted diagram over the inland seeds, clipped to the real
  // shore (seaward) and to the strip's inland edge (so they stop behind the docks).
  if (inlandIdx.length) {
    const iCells = weightedCells(inlandIdx.map((i) => sites[i]), boundary, inlandIdx.map((i) => targets[i]), spacing)
    inlandIdx.forEach((gi, k) => {
      const raw = iCells[k]
      if (raw.length >= 3 && !isOuterDistrict(seeds[gi].type)) innerUnclipped.push(raw)
      let poly = raw
      if (poly.length >= 3) poly = clipToLand(poly, land)
      if (poly.length >= 3) poly = clipToLand(poly, inlandLand)
      out[gi] = poly
    })
  }

  // Docks: split the coast frontage into one segment per docks seed (by position
  // along the shore); each segment is a strip from the shore to the inland edge.
  if (docksIdx.length) {
    const nearShore = (p: Point) => Math.abs(crossOf(p) - land.crossAt(alongOf(p))) < stripDepth * 1.6
    const shoreAlongs = boundary.filter(nearShore).map(alongOf)
    if (shoreAlongs.length >= 2) {
      const aMin = Math.min(...shoreAlongs)
      const aMax = Math.max(...shoreAlongs)
      const sorted = docksIdx.slice().sort((a, b) => alongOf(sites[a]) - alongOf(sites[b]))
      const bnd = [aMin]
      for (let k = 1; k < sorted.length; k++) bnd.push((alongOf(sites[sorted[k - 1]]) + alongOf(sites[sorted[k]])) / 2)
      bnd.push(aMax)
      sorted.forEach((gi, k) => {
        const a0 = bnd[k]
        const a1 = bnd[k + 1]
        const steps = Math.max(2, Math.round(Math.abs(a1 - a0) / 10))
        const poly: Point[] = []
        for (let s = 0; s <= steps; s++) {
          const a = a0 + ((a1 - a0) * s) / steps
          poly.push(mk(a, land.crossAt(a)))
        }
        for (let s = steps; s >= 0; s--) {
          const a = a0 + ((a1 - a0) * s) / steps
          poly.push(mk(a, inlandLand.crossAt(a)))
        }
        out[gi] = poly
      })
    }
  }

  return { cells: out, innerUnclipped, inlandLand }
}

/**
 * Assign a type and name to each scattered site — driven by the TERRAIN, not just
 * geometry:
 *  - Seeds within a band of the shore become the WATERFRONT (docks) — the only
 *    districts allowed to touch the water. They sit outside the wall.
 *  - The remaining (inland) seeds are ranked from the INLAND core centre (the
 *    centroid of the non-waterfront seeds, which for a coast sits pulled back
 *    from the sea): the innermost is the castle, then the walled inner types, then
 *    the inland outer sprawl. Because the core is inland, the wall built around it
 *    never runs along the shore.
 *
 * Landlocked cities have no waterfront, and the core centre is the passed
 * `center`, reproducing the original central-biased layout exactly.
 */
function assignSeeds(
  sites: Point[],
  center: Point,
  rng: Rng,
  params: GenParams,
  terrain: Terrain,
  radius: number,
): DistrictSeed[] {
  const n = sites.length
  const distW = sites.map((s) => terrain.distToWater(s))

  // Waterfront = seeds near the shore. Guarantee at least a small harbour.
  const waterband = radius * 0.32
  const waterfront = sites.map((_, i) => Number.isFinite(distW[i]) && distW[i] < waterband)
  if (terrain.coast && !waterfront.some(Boolean)) {
    const nearest = sites.map((_, i) => i).sort((a, b) => distW[a] - distW[b])
    for (let k = 0; k < Math.min(2, n); k++) waterfront[nearest[k]] = true
  }

  // Rank the inland (non-waterfront) seeds from the core centre. For a coast that
  // centre is the inland centroid; landlocked keeps the passed world centre.
  const inlandSites = sites.filter((_, i) => !waterfront[i])
  const coreCenter = terrain.coast && inlandSites.length >= 1 ? meanPoint(inlandSites) : center
  const nonWater = sites.map((_, i) => i).filter((i) => !waterfront[i])
  nonWater.sort((a, b) => dist(sites[a], coreCenter) - dist(sites[b], coreCenter))
  const orderOf = new Map<number, number>()
  nonWater.forEach((i, order) => orderOf.set(i, order))
  const m = nonWater.length
  const outerCount = Math.max(0, Math.min(m - 3, Math.round(m * 0.42)))
  const innerCount = m - outerCount

  // Waterfront mix: a FOCUSED harbour (one cluster of docks) plus other water-
  // fronting uses (fishmarket, warehouses, shipyards) along the rest of the shore.
  const wfType = new Map<number, DistrictType>()
  if (terrain.coast) {
    const horizontal = params.coastSide === 'E' || params.coastSide === 'W'
    const alongC = (i: number) => (horizontal ? sites[i].y : sites[i].x)
    const wf = sites.map((_, i) => i).filter((i) => waterfront[i]).sort((a, b) => alongC(a) - alongC(b))
    const nWF = wf.length
    const docksN = Math.max(1, Math.round(nWF * 0.3))
    const dockStart = nWF > docksN ? Math.floor(rng.next() * (nWF - docksN + 1)) : 0
    wf.forEach((i, k) => {
      if (k >= dockStart && k < dockStart + docksN) {
        wfType.set(i, 'docks')
      } else {
        wfType.set(i, rng.weighted<DistrictType>([['warehouse', 4], ['fishmarket', 4], ['shipyard', 3]]))
      }
    })
  }

  return sites.map((site, i) => {
    let type: DistrictType
    if (waterfront[i]) {
      type = wfType.get(i) ?? 'docks'
    } else {
      const order = orderOf.get(i) ?? 0
      if (order === 0) {
        type = 'castle'
      } else if (order >= innerCount) {
        // Inland sprawl (never docks — the waterfront is handled above).
        type = rng.weighted<DistrictType>([
          ['suburb', 5],
          ['farmland', 4],
          ['shanty', 3],
          ['tannery', 2],
          ['fairground', 2],
          ['cemetery', 2],
        ])
      } else {
        const innerFrac = order / Math.max(1, innerCount - 1)
        if (innerFrac < 0.33) {
          type = rng.weighted<DistrictType>([
            ['noble', 5],
            ['temple', 3],
            ['market', 3],
            ['residential', 2],
          ])
        } else if (innerFrac < 0.7) {
          type = rng.weighted<DistrictType>([
            ['market', 4],
            ['residential', 5],
            ['temple', 2],
            ['noble', 1],
          ])
        } else {
          type = rng.weighted<DistrictType>([
            ['residential', 4],
            ['slum', 4],
            ['industrial', 3],
          ])
        }
      }
    }
    return {
      // Deterministic from (seed, index) — NOT nanoid. A freshly-scattered
      // layout must assign the same ids every time for the same seed, since
      // building generation keys each district's own RNG off its id (see
      // generateBuildings) — a random id here would make the same seed draw
      // a different building layout on every regenerate.
      id: `d${(hashString(`${params.seed}:${i}`) >>> 0).toString(36)}`,
      site,
      type,
      name: districtName(type, rng),
      density: 1,
      size: 1,
      buildingSize: 1,
      blockSize: params.blockSize,
      laneWidth: params.laneWidth,
      buildingGap: params.buildingGap,
      walled: false,
    }
  })
}

/**
 * Tessellate districts. When `explicitSeeds` is supplied (the user's dictated
 * layout) they are used verbatim — their positions, types and names are kept —
 * otherwise a fresh randomised seed set is scattered and typed.
 */
export function generateDistricts(
  params: GenParams,
  rng: Rng,
  size: number,
  explicitSeeds?: DistrictSeed[],
  existingCoast?: Coast | null,
): DistrictResult {
  let center: Point = { x: size / 2, y: size / 2 }
  let seeds: DistrictSeed[]
  let radius: number
  let coast: Coast | null = null
  let land: LandClip | null = null

  if (explicitSeeds && explicitSeeds.length >= 2) {
    seeds = explicitSeeds
    // Anchor generation on the actual seed cluster (not the fixed world centre)
    // so roads and the river stay centred on the city even when the world size
    // changes (e.g. a district was added/removed, growing/shrinking the world).
    center = meanPoint(seeds.map((s) => s.site))
    // Footprint radius follows how far the dictated seeds spread from centre.
    const maxD = Math.max(...seeds.map((s) => dist(s.site, center)))
    radius = Math.max(size * 0.22, maxD * 1.08)
    const terrain = makeTerrain(params, center, radius, size, rng, existingCoast)
    coast = terrain.coast
    land = terrain.land
  } else {
    // Build the terrain (fixed fresh-scatter radius) FIRST, then scatter seeds on
    // land and type them by the water — the coast shapes the layout from the start.
    radius = size * 0.4
    const terrain = makeTerrain(params, center, radius, size, rng, existingCoast)
    coast = terrain.coast
    land = terrain.land
    const scat = scatterSites(params.districtCount, rng, size, terrain.coast ? (p) => !terrain.isLand(p) : undefined)
    radius = scat.radius
    seeds = assignSeeds(scat.sites, center, rng, params, terrain, radius)
  }

  const n = seeds.length
  const sizes = seeds.map((s) => Math.max(0.2, s.size ?? 1))
  const rawSites = seeds.map((s) => s.site)
  const cSites = meanPoint(rawSites)

  // 1) Natural (unweighted) Voronoi areas at size 1, so the organic variation
  //    from seed placement is the baseline each district's size multiplies.
  const boundary0 = buildBoundary(convexHull(rawSites), radius, rng)
  const sq = (p: Point) => p.x * p.x + p.y * p.y
  const natural = rawSites.map((si, i) => {
    let cell: Polygon = boundary0
    for (let j = 0; j < n && cell.length >= 3; j++) {
      if (j === i) continue
      const sj = rawSites[j]
      cell = clipPolygonHalfPlane(cell, 2 * (sj.x - si.x), 2 * (sj.y - si.y), sq(sj) - sq(si))
    }
    return polyArea(cell)
  })

  // 2) Target area per district = natural area × size. The city GROWS to fit the
  //    total (neighbours keep their own area rather than shrinking).
  const targetsRel = sizes.map((s, i) => s * natural[i])
  const sumT = targetsRel.reduce((a, b) => a + b, 0)
  const baseArea = polyArea(boundary0)
  const factor = Math.sqrt(Math.max(1e-6, sumT / Math.max(1e-6, baseArea)))

  // 3) Scale sites + boundary about the centroid so the domain holds the grown
  //    total (relative placement — and hand-positioning — is preserved).
  const sites = rawSites.map((p) => ({ x: cSites.x + (p.x - cSites.x) * factor, y: cSites.y + (p.y - cSites.y) * factor }))
  const hull = convexHull(sites)
  let boundary = buildBoundary(hull, radius * factor, rng)
  // On a coast, snap the sea-facing boundary onto the shoreline (just past it) so
  // the domain reaches the water along the WHOLE coast — the waterfront districts
  // then tile right up to the waterline with no strip of empty land between them.
  if (coast && land) {
    const horizontal = params.coastSide === 'E' || params.coastSide === 'W'
    const seaSign = params.coastSide === 'E' || params.coastSide === 'S' ? 1 : -1
    const margin = radius * factor * 0.06
    // Densify first so the projected sea edge hugs every wave of the shore.
    const dense = resample([...boundary, boundary[0]], radius * factor * 0.025)
    if (dense.length > 1) dense.pop()
    // Snap to the shoreline any boundary vertex that is seaward of it, or within an
    // inland band of it — so the domain reaches the water along the whole coast
    // (including concave inlets and the corners), leaving no voids.
    const band = radius * factor * 0.22
    boundary = dense.map((v) => {
      const along = horizontal ? v.y : v.x
      const cross = horizontal ? v.x : v.y
      const shoreCross = land!.crossAt(along)
      const seaward = (cross - shoreCross) * seaSign
      if (seaward < -band) return v
      const nc = shoreCross + seaSign * margin
      return horizontal ? { x: nc, y: v.y } : { x: v.x, y: nc }
    })
  }
  const spacing = (radius * factor) / Math.max(1, Math.sqrt(n))

  // 4) Solve the districts. On a coast the docks are a shore-following strip and
  //    the inland districts fill behind them; otherwise a plain weighted diagram.
  const domainArea = polyArea(boundary)
  const targets = targetsRel.map((t) => (t * domainArea) / sumT)
  const coastal = coast && land ? coastalCells(seeds, sites, targets, boundary, spacing, land, params.coastSide, radius * factor) : null
  const cellPolygons = coastal ? coastal.cells : weightedCells(sites, boundary, targets, spacing)

  // Inner wall: the true border between the inner (walled) districts and the
  // outer sprawl — i.e. the outline of the union of the inner cells. On a coast we
  // use the RAW inland cells (exact shared edges) so the union outline is clean.
  const innerCells = coastal
    ? coastal.innerUnclipped
    : cellPolygons.filter((poly, i) => poly.length >= 3 && !isOuterDistrict(seeds[i].type))
  let wallBoundary = polygonUnionOutline(innerCells)
  if (wallBoundary.length < 3) wallBoundary = boundary

  // Clip the whole city to the land side of the coast (each cell traces the
  // shore). Seeds were kept on land, so every district survives with land area.
  let boundaryOut = boundary
  let wallBoundaryOut = wallBoundary
  if (land) {
    const cb = clipToLand(boundary, land)
    if (cb.length >= 3) boundaryOut = cb
    // On a coast the wall stops at the docks strip's inland edge (it must never
    // reach the shore); landlocked, it stops at nothing beyond the boundary.
    const cw = clipToLand(wallBoundary, coastal ? coastal.inlandLand : land)
    if (cw.length >= 3) wallBoundaryOut = cw
  }

  const districts: District[] = seeds
    .map((seed, i) => {
      // Coastal cells are already clipped in coastalCells(); landlocked cells need
      // no clip. (The only land-clip needed for a coast happens inside coastalCells.)
      const poly = cellPolygons[i]
      // Keep every non-degenerate cell — each land seed yields a real district, so
      // the full requested count is preserved.
      if (!polyIsSubstantial(poly, 60)) return null
      return {
        id: seed.id,
        type: seed.type,
        polygon: poly,
        site: centroid(poly),
        name: seed.name,
        density: seed.density ?? 1,
        size: seed.size ?? 1,
        buildingSize: seed.buildingSize ?? 1,
        blockSize: seed.blockSize ?? params.blockSize,
        laneWidth: seed.laneWidth ?? params.laneWidth,
        buildingGap: seed.buildingGap ?? params.buildingGap,
        walled: seed.walled ?? false,
      }
    })
    .filter((d): d is District => d !== null)

  return {
    districts,
    seeds,
    sites,
    cellPolygons,
    center,
    footprintRadius: radius,
    coast,
    land,
    boundary: boundaryOut,
    wallBoundary: wallBoundaryOut,
  }
}
