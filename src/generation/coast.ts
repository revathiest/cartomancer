import type { Coast, CoastKind, CoastSide, Pier, Point, Polygon, Polyline } from '../shared/types.ts'
import { dist, lerp, resample, signedArea } from '../shared/geometry.ts'
import type { Rng } from './rng.ts'

/** Everything the land clip needs: which side is land, plus the (single-valued)
 *  shore so the clip can trace the coastline instead of cutting a straight chord. */
export type LandClip = {
  isLand: (p: Point) => boolean
  /** Cross-shore coordinate of the shore at a given along-shore coordinate. */
  crossAt: (along: number) => number
  /** True when the shore varies along y (E/W coasts); false for N/S. */
  horizontal: boolean
}

/** Unit vector pointing out to sea for a given side. */
export function seaDirection(side: CoastSide): Point {
  switch (side) {
    case 'E':
      return { x: 1, y: 0 }
    case 'W':
      return { x: -1, y: 0 }
    case 'S':
      return { x: 0, y: 1 }
    case 'N':
      return { x: 0, y: -1 }
  }
}

/**
 * Build the coastline for one side. The shore is single-valued along the shore
 * axis (x = f(y) for E/W, y = f(x) for N/S) — a gently wavy line for `sea`, or a
 * line that dips inland in the middle for a `bay`. Returns the drawn Coast data
 * plus an `isLand(p)` predicate used to clip the city to the land side.
 */
export function makeCoast(
  center: Point,
  radius: number,
  size: number,
  side: CoastSide,
  kind: CoastKind,
  rng: Rng,
): { coast: Coast; land: LandClip } {
  // For E/W the shore varies along y (cross-shore coord = x); for N/S along x.
  const horizontal = side === 'E' || side === 'W'
  const seaSign = side === 'E' || side === 'S' ? 1 : -1
  const centerCross = horizontal ? center.x : center.y
  const centerAlong = horizontal ? center.y : center.x
  const baseOffset = radius * (kind === 'bay' ? 0.58 : 0.3)
  const shoreCross = centerCross + seaSign * baseOffset

  const ph = [rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2)]
  const amp = [radius * 0.06, radius * 0.04, radius * 0.025]
  const k = [(2 * Math.PI) / (radius * 1.9), (2 * Math.PI) / (radius * 0.95), (2 * Math.PI) / (radius * 0.55)]
  // Keep the bay's deepest point seaward of the city centre (baseOffset − bayDepth > 0).
  const bayDepth = radius * 0.42
  const baySpan = radius * 0.85

  const crossAt = (along: number): number => {
    let w = 0
    for (let i = 0; i < 3; i++) w += amp[i] * Math.sin(k[i] * (along - centerAlong) + ph[i])
    let c = shoreCross + seaSign * w
    if (kind === 'bay') {
      const t = (along - centerAlong) / baySpan
      c -= seaSign * bayDepth * Math.exp(-t * t * 2.2)
    }
    return c
  }

  const isLand = (p: Point): boolean => {
    const along = horizontal ? p.y : p.x
    const cross = horizontal ? p.x : p.y
    const shore = crossAt(along)
    return seaSign > 0 ? cross <= shore : cross >= shore
  }
  const land: LandClip = { isLand, crossAt, horizontal }

  // Drawn shore across the whole map — sampled finely so the water polygon hugs
  // the same curve the districts are clipped to (no sliver between land and sea).
  const shore: Polyline = []
  const steps = 150
  for (let i = 0; i <= steps; i++) {
    const along = (i / steps) * size
    const cross = crossAt(along)
    shore.push(horizontal ? { x: cross, y: along } : { x: along, y: cross })
  }

  // Water polygon: the shore plus the two sea-side map corners.
  const water: Polygon = shore.slice()
  if (horizontal) {
    const seaX = seaSign > 0 ? size : 0
    water.push({ x: seaX, y: size }, { x: seaX, y: 0 })
  } else {
    const seaY = seaSign > 0 ? size : 0
    water.push({ x: size, y: seaY }, { x: 0, y: seaY })
  }

  return { coast: { side, kind, shore, water, piers: [] }, land }
}

/**
 * Reconstruct the land-clip from an already-generated coast (its shore polyline),
 * so edits can reuse the SAME coastline instead of regenerating a shifted one.
 */
export function landFromCoast(coast: Coast): LandClip {
  const horizontal = coast.side === 'E' || coast.side === 'W'
  const seaSign = coast.side === 'E' || coast.side === 'S' ? 1 : -1
  const shore = coast.shore
  const alongs = shore.map((p) => (horizontal ? p.y : p.x))
  const crosses = shore.map((p) => (horizontal ? p.x : p.y))
  const crossAt = (along: number): number => {
    if (along <= alongs[0]) return crosses[0]
    if (along >= alongs[alongs.length - 1]) return crosses[crosses.length - 1]
    let lo = 0
    let hi = alongs.length - 1
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (alongs[m] <= along) lo = m
      else hi = m
    }
    const t = (along - alongs[lo]) / ((alongs[hi] - alongs[lo]) || 1)
    return crosses[lo] + (crosses[hi] - crosses[lo]) * t
  }
  const isLand = (p: Point) => {
    const cross = horizontal ? p.x : p.y
    const s = crossAt(horizontal ? p.y : p.x)
    return seaSign > 0 ? cross <= s : cross >= s
  }
  return { isLand, crossAt, horizontal }
}

/**
 * Clip a polygon to the LAND side of the coast, TRACING the shoreline. A basic
 * Sutherland–Hodgman clip would join the two crossing points across a water gap
 * with a straight chord (enclosing water); instead, wherever an edge spans water
 * we replace it with the actual shore curve, so the result hugs the coast and no
 * land ever sits over water. Returns [] if nothing remains on land.
 */
export function clipToLand(poly: Polygon, land: LandClip): Polygon {
  if (poly.length < 3) return []
  const { isLand, crossAt, horizontal } = land
  const alongOf = (p: Point) => (horizontal ? p.y : p.x)
  const crossOf = (p: Point) => (horizontal ? p.x : p.y)
  const onShore = (along: number): Point => (horizontal ? { x: crossAt(along), y: along } : { x: along, y: crossAt(along) })
  const nearShore = (p: Point) => Math.abs(crossOf(p) - crossAt(alongOf(p))) < 3

  // Densify so each short edge crosses the shore at most once.
  const ring = resample([...poly, poly[0]], 10)
  if (ring.length > 1) ring.pop()
  const src = ring.length >= 3 ? ring : poly
  const cut = (a: Point, b: Point): Point => {
    const la = isLand(a)
    let lo = 0
    let hi = 1
    for (let i = 0; i < 26; i++) {
      const m = (lo + hi) / 2
      if (isLand(lerp(a, b, m)) === la) lo = m
      else hi = m
    }
    return lerp(a, b, (lo + hi) / 2)
  }

  // 1) Sutherland–Hodgman keep-land (leaves straight chords over water gaps).
  const clipped: Point[] = []
  for (let i = 0; i < src.length; i++) {
    const A = src[i]
    const B = src[(i + 1) % src.length]
    const ain = isLand(A)
    const bin = isLand(B)
    if (ain) clipped.push(A)
    if (ain !== bin) clipped.push(cut(A, B))
  }
  if (clipped.length < 3) return []

  // 2) Any edge whose BOTH endpoints sit on the shore is a chord across a stretch
  //    of coast — replace it with the traced shoreline so the edge follows the
  //    curve (works whether the coast bulges toward land OR toward the sea, which
  //    the old midpoint test missed, leaving flat waterfront edges).
  const out: Point[] = []
  for (let i = 0; i < clipped.length; i++) {
    const a = clipped[i]
    const b = clipped[(i + 1) % clipped.length]
    out.push(a)
    if (nearShore(a) && nearShore(b)) {
      const a0 = alongOf(a)
      const a1 = alongOf(b)
      const steps = Math.max(1, Math.round(Math.abs(a1 - a0) / 10))
      for (let s = 1; s < steps; s++) out.push(onShore(a0 + ((a1 - a0) * s) / steps))
    }
  }
  return out.length >= 3 ? out : []
}

/**
 * Keep only the longest contiguous ON-LAND run of a polyline (e.g. a river), with
 * the endpoints snapped to the shore where it crosses. Used so the river ends at
 * the coast instead of running across the open water.
 */
export function clipPolylineToLand(pts: Polyline, land: LandClip): Polyline {
  if (pts.length < 2) return []
  const { isLand } = land
  const cut = (a: Point, b: Point): Point => {
    const la = isLand(a)
    let lo = 0
    let hi = 1
    for (let i = 0; i < 26; i++) {
      const m = (lo + hi) / 2
      if (isLand(lerp(a, b, m)) === la) lo = m
      else hi = m
    }
    return lerp(a, b, (lo + hi) / 2)
  }
  const runs: Point[][] = []
  let cur: Point[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (isLand(p)) {
      if (cur.length === 0 && i > 0 && !isLand(pts[i - 1])) cur.push(cut(pts[i - 1], p))
      cur.push(p)
    } else if (cur.length > 0) {
      cur.push(cut(pts[i - 1], p))
      runs.push(cur)
      cur = []
    }
  }
  if (cur.length > 0) runs.push(cur)
  let best: Point[] = []
  let bestLen = -1
  for (const r of runs) {
    let len = 0
    for (let i = 0; i < r.length - 1; i++) len += dist(r[i], r[i + 1])
    if (len > bestLen) {
      bestLen = len
      best = r
    }
  }
  return best
}

/** A few piers spread along the harbour district's whole seaward frontage. */
export function makePiers(dockPolygon: Polygon, side: CoastSide, radius: number, rng: Rng): Pier[] {
  if (dockPolygon.length < 3) return []
  const dir = seaDirection(side)
  const alongAxis = { x: -dir.y, y: dir.x }
  const sea = (p: Point) => p.x * dir.x + p.y * dir.y
  const along = (p: Point) => p.x * alongAxis.x + p.y * alongAxis.y
  const maxSea = Math.max(...dockPolygon.map(sea))
  // The waterfront = the run of vertices near the seaward extreme.
  const front = dockPolygon.filter((p) => sea(p) >= maxSea - radius * 0.28)
  if (front.length < 2) return []
  front.sort((a, b) => along(a) - along(b))
  const a0 = along(front[0])
  const a1 = along(front[front.length - 1])
  if (a1 - a0 < radius * 0.06) return []
  const angle = Math.atan2(dir.y, dir.x)
  const n = 3 + rng.int(0, 2)
  const piers: Pier[] = []
  for (let i = 0; i < n; i++) {
    const target = a0 + (a1 - a0) * ((i + 1) / (n + 1))
    // Anchor each pier on the frontage vertex nearest that along-position.
    let base = front[0]
    let bd = Infinity
    for (const p of front) {
      const d = Math.abs(along(p) - target)
      if (d < bd) {
        bd = d
        base = p
      }
    }
    piers.push({ x: base.x, y: base.y, angle, length: radius * 0.05 + rng.range(0, radius * 0.03), width: 7 })
  }
  return piers
}

/** Most-seaward point's signed position along the sea direction (for ranking). */
export function seawardness(poly: Polygon, side: CoastSide): number {
  const dir = seaDirection(side)
  let best = -Infinity
  for (const p of poly) best = Math.max(best, p.x * dir.x + p.y * dir.y)
  return best
}

/** Guard against degenerate (near-zero-area) clipped polygons. */
export function polyIsSubstantial(poly: Polygon, minArea: number): boolean {
  return poly.length >= 3 && Math.abs(signedArea(poly)) >= minArea
}
