import ClipperLib from 'clipper-lib'
import type { Point, Polygon, Polyline } from './types.ts'

/** Standard even-odd ray-casting point-in-polygon test. */
export function pointInPolygon(p: Point, poly: Polygon): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function centroid(poly: Polygon): Point {
  // Area-weighted polygon centroid (falls back to vertex average for degenerate area).
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const cross = poly[j].x * poly[i].y - poly[i].x * poly[j].y
    area += cross
    cx += (poly[j].x + poly[i].x) * cross
    cy += (poly[j].y + poly[i].y) * cross
  }
  area *= 0.5
  if (Math.abs(area) < 1e-6) {
    const avg = poly.reduce(
      (acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }),
      { x: 0, y: 0 },
    )
    return { x: avg.x / poly.length, y: avg.y / poly.length }
  }
  return { x: cx / (6 * area), y: cy / (6 * area) }
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Arithmetic mean of a set of points (the right "centre" for a point CLOUD —
 *  unlike `centroid`, which is the area-weighted centre of an ordered polygon). */
export function meanPoint(pts: Point[]): Point {
  if (pts.length === 0) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p.x
    y += p.y
  }
  return { x: x / pts.length, y: y / pts.length }
}

export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** Perimeter of a polygon (closed). */
export function polygonPerimeter(poly: Polygon): number {
  let total = 0
  for (let i = 0; i < poly.length; i++) {
    total += dist(poly[i], poly[(i + 1) % poly.length])
  }
  return total
}

/** Resample a polyline into segments of roughly `step` length. Keeps endpoints. */
export function resample(points: Polyline, step: number): Polyline {
  if (points.length < 2) return points.slice()
  const out: Point[] = [points[0]]
  let carry = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const segLen = dist(a, b)
    if (segLen < 1e-6) continue
    let d = step - carry
    while (d < segLen) {
      out.push(lerp(a, b, d / segLen))
      d += step
    }
    carry = segLen - (d - step)
  }
  out.push(points[points.length - 1])
  return out
}

/** Unit perpendicular (rotated +90°) of the direction a->b. */
export function perpendicular(a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: -dy / len, y: dx / len }
}

/** Convex hull (Andrew's monotone chain), counter-clockwise. */
export function convexHull(pts: Point[]): Polygon {
  const points = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y)
  if (points.length < 3) return points
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/** Expand a polygon outward from its centroid by `amount` world units. */
export function expandPolygon(poly: Polygon, amount: number): Polygon {
  const c = centroid(poly)
  return poly.map((p) => {
    const dx = p.x - c.x
    const dy = p.y - c.y
    const len = Math.hypot(dx, dy) || 1
    return { x: p.x + (dx / len) * amount, y: p.y + (dy / len) * amount }
  })
}

/**
 * Inset a polygon inward by `d` world units by mitring every vertex along its
 * edge-bisector. For a CONVEX polygon this is identical to offsetting each edge;
 * unlike a per-edge half-plane clip it does NOT collapse non-convex polygons
 * (e.g. the curved coastal district / docks strips). Used to leave lane/wall gaps.
 */
export function insetPolygon(poly: Polygon, d: number): Polygon {
  if (poly.length < 3 || d <= 0) return poly.slice()
  const n = poly.length
  const c = centroid(poly)
  // Pick the inward normal sign once from edge 0 + the centroid, then apply it
  // consistently (valid for a simple polygon with consistent winding).
  const a0 = poly[0]
  const b0 = poly[1]
  const sTest = -(b0.y - a0.y) * (c.x - (a0.x + b0.x) / 2) + (b0.x - a0.x) * (c.y - (a0.y + b0.y) / 2)
  const sign = sTest >= 0 ? 1 : -1
  const inward = (a: Point, b: Point): Point => {
    const nx = sign * -(b.y - a.y)
    const ny = sign * (b.x - a.x)
    const len = Math.hypot(nx, ny) || 1
    return { x: nx / len, y: ny / len }
  }
  const out: Point[] = []
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]
    const cur = poly[i]
    const next = poly[(i + 1) % n]
    const n1 = inward(prev, cur)
    const n2 = inward(cur, next)
    let bx = n1.x + n2.x
    let by = n1.y + n2.y
    const bl = Math.hypot(bx, by)
    if (bl < 1e-6) {
      out.push({ x: cur.x + n1.x * d, y: cur.y + n1.y * d })
      continue
    }
    bx /= bl
    by /= bl
    const cosT = Math.max(0.35, bx * n1.x + by * n1.y) // clamp so sharp corners don't shoot out
    out.push({ x: cur.x + bx * (d / cosT), y: cur.y + by * (d / cosT) })
  }
  return out.length >= 3 ? out : []
}

/** The portions of segment a-b that lie inside a polygon (for clipping lanes). */
export function clipSegmentToPolygon(a: Point, b: Point, poly: Polygon): [Point, Point][] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const ts = [0, 1]
  for (let i = 0; i < poly.length; i++) {
    const hit = segmentIntersection(a, b, poly[i], poly[(i + 1) % poly.length])
    if (hit) {
      const t = Math.abs(dx) > Math.abs(dy) ? (hit.x - a.x) / dx : (hit.y - a.y) / dy
      if (t > 1e-4 && t < 1 - 1e-4) ts.push(t)
    }
  }
  ts.sort((x, y) => x - y)
  const at = (t: number): Point => ({ x: a.x + t * dx, y: a.y + t * dy })
  const out: [Point, Point][] = []
  for (let i = 0; i < ts.length - 1; i++) {
    const mid = at((ts[i] + ts[i + 1]) / 2)
    if (pointInPolygon(mid, poly)) out.push([at(ts[i]), at(ts[i + 1])])
  }
  return out
}

/** Closest point on segment a-b to p. */
export function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (l2 < 1e-12) return { x: a.x, y: a.y }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

/** Closest point on a closed polygon's boundary to p. */
export function closestPointOnPolygon(p: Point, poly: Polygon): Point {
  let best = poly[0]
  let bd = Infinity
  for (let i = 0; i < poly.length; i++) {
    const c = closestPointOnSegment(p, poly[i], poly[(i + 1) % poly.length])
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2
    if (d < bd) {
      bd = d
      best = c
    }
  }
  return best
}

/** Approximate minimum distance between two polygons' boundaries (0 if they
 *  touch or overlap) — checks every vertex of each against the other's
 *  boundary, which is exact for convex polygons that don't cross. */
export function polygonDistance(a: Polygon, b: Polygon): number {
  let best = Infinity
  for (const p of a) {
    const c = closestPointOnPolygon(p, b)
    best = Math.min(best, Math.hypot(c.x - p.x, c.y - p.y))
  }
  for (const p of b) {
    const c = closestPointOnPolygon(p, a)
    best = Math.min(best, Math.hypot(c.x - p.x, c.y - p.y))
  }
  return best
}

/** Chaikin corner-cutting smoothing for a closed polygon. */
export function smoothClosed(poly: Polygon, iterations = 2): Polygon {
  let pts = poly
  for (let it = 0; it < iterations; it++) {
    const next: Point[] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y })
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y })
    }
    pts = next
  }
  return pts
}

/** Build an SVG path `d` string from points. */
export function toPath(points: Point[], closed: boolean): string {
  if (points.length === 0) return ''
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`
  }
  if (closed) d += ' Z'
  return d
}

/** Smooth SVG path via Catmull-Rom -> cubic bezier conversion. */
export function toSmoothPath(points: Point[], closed = false): string {
  if (points.length < 3) return toPath(points, closed)
  const p = points
  const n = p.length
  const get = (i: number) =>
    closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]
  let d = `M ${p[0].x.toFixed(2)} ${p[0].y.toFixed(2)}`
  const end = closed ? n : n - 1
  for (let i = 0; i < end; i++) {
    const p0 = get(i - 1)
    const p1 = get(i)
    const p2 = get(i + 1)
    const p3 = get(i + 2)
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  if (closed) d += ' Z'
  return d
}

/**
 * Clip a polygon to the half-plane { x : nx*x + ny*y <= c } (Sutherland-Hodgman
 * against a single line). Used to build weighted Voronoi (power-diagram) cells
 * as the intersection of half-planes.
 */
export function clipPolygonHalfPlane(poly: Polygon, nx: number, ny: number, c: number): Polygon {
  if (poly.length < 3) return []
  const inside = (p: Point) => nx * p.x + ny * p.y <= c + 1e-9
  const intersect = (a: Point, b: Point): Point => {
    const da = nx * a.x + ny * a.y
    const db = nx * b.x + ny * b.y
    const t = Math.abs(db - da) < 1e-12 ? 0 : (c - da) / (db - da)
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }
  }
  const out: Point[] = []
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]
    const prev = poly[(i + poly.length - 1) % poly.length]
    const ci = inside(cur)
    const pi = inside(prev)
    if (ci) {
      if (!pi) out.push(intersect(prev, cur))
      out.push(cur)
    } else if (pi) {
      out.push(intersect(prev, cur))
    }
  }
  return out
}

/** Signed area of a polygon (positive when counter-clockwise in SVG's y-down space). */
export function signedArea(poly: Polygon): number {
  let a = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].y - poly[i].x * poly[j].y
  }
  return a / 2
}

/**
 * Sutherland–Hodgman clip of `subject` against a CONVEX `clip` polygon.
 * Returns the clipped (possibly empty) polygon. Orientation of `clip` is
 * normalised internally.
 */
export function clipPolygonConvex(subject: Polygon, clip: Polygon): Polygon {
  if (subject.length < 3 || clip.length < 3) return []
  // Normalise clip to a consistent (CCW-in-math / here just consistent) winding.
  const c = signedArea(clip) < 0 ? clip.slice().reverse() : clip
  let output: Point[] = subject.slice()

  // Intersection of segment prev->cur with the INFINITE line through a->b.
  const lineHit = (prev: Point, cur: Point, a: Point, b: Point): Point => {
    const r = { x: cur.x - prev.x, y: cur.y - prev.y }
    const s = { x: b.x - a.x, y: b.y - a.y }
    const denom = r.x * s.y - r.y * s.x
    if (Math.abs(denom) < 1e-9) return cur
    const t = ((a.x - prev.x) * s.y - (a.y - prev.y) * s.x) / denom
    return { x: prev.x + t * r.x, y: prev.y + t * r.y }
  }

  for (let i = 0; i < c.length; i++) {
    const a = c[i]
    const b = c[(i + 1) % c.length]
    const input = output
    output = []
    if (input.length === 0) break
    // "Inside" = to the left of edge a->b.
    const side = (p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    for (let k = 0; k < input.length; k++) {
      const cur = input[k]
      const prev = input[(k + input.length - 1) % input.length]
      const curIn = side(cur) >= 0
      const prevIn = side(prev) >= 0
      if (curIn) {
        if (!prevIn) output.push(lineHit(prev, cur, a, b))
        output.push(cur)
      } else if (prevIn) {
        output.push(lineHit(prev, cur, a, b))
      }
    }
  }
  return output
}

/** Segment intersection point, or null if segments do not cross. */
export function segmentIntersection(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): Point | null {
  const d1x = a2.x - a1.x
  const d1y = a2.y - a1.y
  const d2x = b2.x - b1.x
  const d2y = b2.y - b1.y
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-9) return null
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denom
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: a1.x + t * d1x, y: a1.y + t * d1y }
}

function ccw(poly: Polygon): Polygon {
  return signedArea(poly) < 0 ? poly.slice().reverse() : poly.slice()
}

/** True if `p` is inside convex CCW `poly` (boundary counts as inside). */
function insideConvexOrOn(p: Point, poly: Polygon, eps = 1e-6): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < -eps) return false
  }
  return true
}

/** `poly`'s boundary with every intersection against `other` spliced in at
 *  its correct position along the edge it falls on (ordered by distance from
 *  the edge start). Used to build the merged boundary walk in `unionPolygons`. */
function splicedBoundary(poly: Polygon, other: Polygon): Point[] {
  const out: Point[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    out.push(a)
    const hits: { t: number; p: Point }[] = []
    for (let j = 0; j < other.length; j++) {
      const hit = segmentIntersection(a, b, other[j], other[(j + 1) % other.length])
      if (hit) hits.push({ t: (hit.x - a.x) * (b.x - a.x) + (hit.y - a.y) * (b.y - a.y), p: hit })
    }
    hits.sort((x, y) => x.t - y.t)
    for (const h of hits) out.push(h.p)
  }
  // Drop consecutive near-duplicate points (shared vertices, glancing touches).
  const deduped: Point[] = []
  for (const p of out) {
    const last = deduped[deduped.length - 1]
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-6) deduped.push(p)
  }
  if (deduped.length > 1) {
    const first = deduped[0]
    const last = deduped[deduped.length - 1]
    if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-6) deduped.pop()
  }
  return deduped
}

/**
 * Union of two convex polygons that overlap (even slightly) — traces the
 * outer boundary by walking each polygon's edges and switching to the other
 * polygon at every crossing where continuing straight would head into its
 * interior. Handles both a shared-wall join (the result reads as the two
 * originals fused at that wall) and a corner-only join (the result is the
 * true L/notch shape, not a hull that fills the notch in). Returns null if
 * the polygons don't actually overlap, or on any unexpected degeneracy —
 * callers should fall back to a simpler shape in that case.
 */
export function unionPolygons(a: Polygon, b: Polygon): Polygon | null {
  const A = ccw(a)
  const B = ccw(b)
  if (A.length < 3 || B.length < 3) return null
  if (A.every((p) => insideConvexOrOn(p, B))) return B
  if (B.every((p) => insideConvexOrOn(p, A))) return A

  const boundA = splicedBoundary(A, B)
  const boundB = splicedBoundary(B, A)
  if (boundA.length < 3 || boundB.length < 3) return null

  const findMatch = (list: Point[], p: Point) => list.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6)

  let onA = true
  let list = boundA
  let other = B
  let idx: number
  // Start the walk at a genuine exterior vertex (not just any point) so the
  // very first edge followed is unambiguously part of the outer boundary.
  const extStart = boundA.findIndex((p) => !insideConvexOrOn(p, B))
  if (extStart >= 0) {
    idx = extStart
  } else {
    const extStartB = boundB.findIndex((p) => !insideConvexOrOn(p, A))
    if (extStartB < 0) return null // fully overlapping edge-on-edge — too degenerate to trust
    onA = false
    list = boundB
    other = A
    idx = extStartB
  }

  const start = list[idx]
  const result: Point[] = []
  const maxSteps = (boundA.length + boundB.length) * 2 + 8
  for (let step = 0; step < maxSteps; step++) {
    const p = list[idx]
    result.push(p)
    const nextIdx = (idx + 1) % list.length
    const next = list[nextIdx]
    const mid = { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 }
    // Negative eps requires EVERY edge to clear it by a real margin — a
    // strict "well inside", not just "on or barely past the boundary".
    if (insideConvexOrOn(mid, other, -1e-3)) {
      // The upcoming edge dives into the other polygon's interior — cross
      // over there instead of following it.
      const otherList = onA ? boundB : boundA
      const matchIdx = findMatch(otherList, p)
      if (matchIdx < 0) return null
      onA = !onA
      list = otherList
      other = onA ? B : A
      idx = (matchIdx + 1) % list.length
    } else {
      idx = nextIdx
    }
    if (result.length > 2 && Math.hypot(list[idx].x - start.x, list[idx].y - start.y) < 1e-6) break
    if (step === maxSteps - 1) return null // didn't close — bail out to a safe fallback
  }
  if (result.length < 3) return null
  return result
}

// Clipper works in integer coordinates for numerical robustness. World-space
// map coordinates run up to a few thousand units and the geometry here cares
// about sub-unit precision (wall gaps as small as 0.4 units), so scaling by
// 1000 keeps a comfortable 0.001-unit precision floor while staying far under
// Clipper's safe integer range.
const CLIPPER_SCALE = 1000

function toClipperPath(poly: Point[]): ClipperLib.IntPoint[] {
  return poly.map((p) => ({ X: Math.round(p.x * CLIPPER_SCALE), Y: Math.round(p.y * CLIPPER_SCALE) }))
}

function fromClipperPath(path: ClipperLib.IntPoint[]): Point[] {
  return path.map((p) => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }))
}

// Two lots from `subdividePolygon` often meet at a T-junction — one lot's
// corner lands in the middle of a neighbour's longer wall, rather than the
// two edges matching endpoint-to-endpoint — and share only a zero-WIDTH
// boundary touch (no overlapping AREA) even when perfectly aligned. Clipper's
// exact-arithmetic boolean union won't fuse two polygons whose only contact
// is a touch like that: confirmed on a mathematically-exact T-junction
// (perpendicular deviation ~1e-14, floating-point noise) that still failed to
// union at every internal precision from 1000 up to 100,000,000 — so it
// isn't a rounding artifact to realign, it's that plain boundary contact
// isn't enough; Clipper needs genuine overlapping area. A first attempt at
// pure vertex/edge SNAPPING (nudging near-coincident points into exact
// alignment) does nothing for that case, because the points were already
// exactly aligned — nothing to snap, still zero area, still fails. So this
// snaps first (cleaning up any real floating-point drift between two
// independently-computed contact points — see the compounding-merge case
// below) and THEN buffers by growing each polygon a hair outward, unioning,
// and shrinking the result back down, which forces genuine overlapping area
// at the seam regardless of whether there was ever a coordinate mismatch.
const UNION_SNAP_EPS = 0.05
const UNION_WELD_EPS = 0.01

/** Nudges each polygon's vertices that sit within `UNION_SNAP_EPS` of a
 *  vertex or edge of one of the OTHER polygons onto that exact point —
 *  turning a near-touch (drifted by floating-point noise across independent
 *  computations) into a bit-identical shared boundary, which Clipper's exact
 *  arithmetic fuses correctly (see `unionPolygonsRobust`). Checks vertices
 *  first (an exact corner-to-corner touch) before edges (a T-junction), and
 *  only ever moves a vertex by less than `UNION_SNAP_EPS` — far below the
 *  smallest real gap worth keeping separate (0.4 units) — so it can't bridge
 *  two lots that were never meant to touch. */
function snapTouchingPolygons(polys: Point[][]): Point[][] {
  const result = polys.map((poly) => poly.map((p) => ({ ...p })))
  for (let a = 0; a < result.length; a++) {
    for (let b = 0; b < result.length; b++) {
      if (a === b) continue
      const polyA = result[a]
      const polyB = result[b]
      for (let i = 0; i < polyA.length; i++) {
        const v = polyA[i]
        let best: Point | null = null
        let bestD = UNION_SNAP_EPS
        for (const w of polyB) {
          const d = Math.hypot(v.x - w.x, v.y - w.y)
          if (d < bestD) {
            bestD = d
            best = w
          }
        }
        if (!best) {
          for (let j = 0; j < polyB.length; j++) {
            const c = closestPointOnSegment(v, polyB[j], polyB[(j + 1) % polyB.length])
            const d = Math.hypot(v.x - c.x, v.y - c.y)
            if (d < bestD) {
              bestD = d
              best = c
            }
          }
        }
        if (best) polyA[i] = { ...best }
      }
    }
  }
  return result
}

function growForWeld(poly: Point[]): Point[] {
  const grown = offsetPolygonRobust(poly, UNION_WELD_EPS)
  return grown.length === 1 && grown[0].length >= 3 ? grown[0] : poly
}

/**
 * Robust union of one or more simple polygons via Clipper's boolean-ops
 * engine — used for polygons that share an EXACT boundary edge (like two
 * adjacent lots from `subdividePolygon`, which tile a block with no gap
 * between them), a case a hand-rolled boundary-walk union tends to choke on
 * (touching-but-not-crossing edges are a classic degenerate case). Clipper's
 * Vatti-based algorithm handles a full shared edge correctly on its own; a
 * T-junction touch needs both passes above first: snap to clean up any real
 * coordinate drift between two independently-computed contact points, then
 * buffer (grow/union/shrink) to force genuine overlapping area at the seam,
 * since even a perfectly-aligned zero-width touch won't fuse on its own.
 * Returns every resulting ring — normally exactly one for genuinely adjacent
 * input; more than one means the inputs didn't actually touch (even after
 * snapping and buffering), zero means the result was empty. Winding
 * direction of the input doesn't matter (fed in as non-zero fill), but
 * output rings come back in whatever order/winding Clipper produces them in.
 */
export function unionPolygonsRobust(polys: Point[][]): Point[][] {
  const real = polys.filter((p) => p.length >= 3)
  if (real.length === 0) return []
  if (real.length === 1) return [real[0]]
  const snapped = snapTouchingPolygons(real)
  const clipper = new ClipperLib.Clipper()
  clipper.AddPath(toClipperPath(growForWeld(snapped[0])), ClipperLib.PolyType.ptSubject, true)
  clipper.AddPaths(
    snapped.slice(1).map((p) => toClipperPath(growForWeld(p))),
    ClipperLib.PolyType.ptClip,
    true,
  )
  const solution: ClipperLib.Paths = []
  clipper.Execute(
    ClipperLib.ClipType.ctUnion,
    solution,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  )
  const grownResult = solution.map(fromClipperPath)
  return grownResult.flatMap((ring) => {
    const shrunk = offsetPolygonRobust(ring, -UNION_WELD_EPS)
    return shrunk.length ? shrunk : [ring]
  })
}

/**
 * Robust inward/outward offset of a polygon via Clipper's offsetting engine
 * — unlike `insetPolygon`'s per-vertex mitre join (which has no concept of
 * two unrelated edges' offset lines crossing each other), Clipper resolves
 * those "split events" properly, so it stays correct on a CONCAVE polygon
 * with a narrow arm or notch (e.g. an L/U-shaped lot from unioning several
 * merged buildings) where `insetPolygon` can silently fold into a
 * self-intersecting mess. `delta` negative shrinks inward, positive expands
 * outward — same sign convention as Clipper itself. Returns every resulting
 * ring (an inset can split a very thin shape into pieces; an outer boundary
 * normally stays one).
 */
export function offsetPolygonRobust(poly: Point[], delta: number): Point[][] {
  if (poly.length < 3) return []
  const co = new ClipperLib.ClipperOffset()
  co.AddPath(toClipperPath(poly), ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon)
  const solution: ClipperLib.Paths = []
  co.Execute(solution, delta * CLIPPER_SCALE)
  return solution.map(fromClipperPath)
}
