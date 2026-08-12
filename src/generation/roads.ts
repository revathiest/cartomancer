import { Delaunay } from 'd3-delaunay'
import { nanoid } from 'nanoid'
import type { Point, Road, RoadEdge, RoadKind, RoadNode } from '../shared/types.ts'
import { closestPointOnPolygon, dist, perpendicular, pointInPolygon } from '../shared/geometry.ts'
import { makeRng } from './rng.ts'
import type { Rng } from './rng.ts'

// Position-based noise so a road always curves the same way for given positions.
const roadNoise = makeRng(0x2f5d).noise2D

/** Proper segment crossing (shared endpoints / grazing a point do not count). */
function properCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const s = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const d1 = s(p3, p4, p1)
  const d2 = s(p3, p4, p2)
  const d3 = s(p1, p2, p3)
  const d4 = s(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** True if segment a-b properly crosses the boundary of a closed polygon. */
export function segCrossesPolygon(a: Point, b: Point, poly: Point[]): boolean {
  for (let i = 0; i < poly.length; i++) {
    if (properCross(a, b, poly[i], poly[(i + 1) % poly.length])) return true
  }
  return false
}

/** Intersection point of segments a-b and c-d, or null if they don't properly cross. */
function segIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const den = (d.y - c.y) * (b.x - a.x) - (d.x - c.x) * (b.y - a.y)
  if (Math.abs(den) < 1e-9) return null
  const ua = ((d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x)) / den
  const ub = ((b.x - a.x) * (a.y - c.y) - (b.y - a.y) * (a.x - c.x)) / den
  if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null
  return { x: a.x + ua * (b.x - a.x), y: a.y + ua * (b.y - a.y) }
}

/** True if segment a-b crosses the wall polygon anywhere that is NOT within
 *  `gateTol` of one of the gate points. A road may pass through the wall only at
 *  a gate — so an edge that merely ENDS at a gate but then tunnels out through
 *  the far side of the wall (e.g. a gate-to-distant-sprawl street) is rejected. */
export function crossesWallAwayFromGate(a: Point, b: Point, wall: Point[], gates: Point[], gateTol: number): boolean {
  for (let i = 0; i < wall.length; i++) {
    const ip = segIntersection(a, b, wall[i], wall[(i + 1) % wall.length])
    if (!ip) continue
    let atGate = false
    for (const g of gates) {
      if (Math.hypot(g.x - ip.x, g.y - ip.y) <= gateTol) { atGate = true; break }
    }
    if (!atGate) return true
  }
  return false
}

/** Every point where segment a-b crosses the wall polygon, ordered from a to b.
 *  Used to splice a real gate node into an edited road exactly where it punches
 *  through the wall, so the wall gets a genuine opening instead of a road drawn
 *  straight over solid rampart. */
export function wallCrossingPoints(a: Point, b: Point, wall: Point[]): Point[] {
  const hits: { t: number; p: Point }[] = []
  for (let i = 0; i < wall.length; i++) {
    const ip = segIntersection(a, b, wall[i], wall[(i + 1) % wall.length])
    if (ip) hits.push({ t: (ip.x - a.x) * (b.x - a.x) + (ip.y - a.y) * (b.y - a.y), p: ip })
  }
  hits.sort((x, y) => x.t - y.t)
  return hits.map((h) => h.p)
}

/** Obstacles a road edge may not tunnel through: it may never cross open water,
 *  and it may cross the wall only at (near) a gate. */
export type RoadObstacles = { water?: Point[] | null; wall?: Point[] | null }

/** True if the straight edge a-b is illegal against the given obstacles: it cuts
 *  across open water, or it crosses the wall anywhere that isn't a gate. Shared by
 *  generation and interactive editing so both enforce the same rules. */
export function segmentBreachesObstacles(
  a: Point,
  b: Point,
  obstacles: RoadObstacles,
  gates: Point[],
  gateTol: number,
): boolean {
  const { water, wall } = obstacles
  if (water && water.length >= 3 && segCrossesPolygon(a, b, water)) return true
  if (wall && wall.length >= 3 && crossesWallAwayFromGate(a, b, wall, gates, gateTol)) return true
  return false
}

/** The gate tolerance used everywhere: a crossing this close to a gate counts as
 *  passing THROUGH the gate rather than breaching the wall. */
export function gateTolerance(footprintRadius: number): number {
  return Math.max(28, footprintRadius * 0.06)
}

type ChainSample = { p: Point; isNode: boolean }

/** Catmull-Rom interpolation through the node points; flags the exact node samples. */
function catmullRom(pts: Point[]): ChainSample[] {
  const n = pts.length
  const get = (i: number) => pts[Math.max(0, Math.min(n - 1, i))]
  const out: ChainSample[] = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1)
    const p1 = get(i)
    const p2 = get(i + 1)
    const p3 = get(i + 2)
    const steps = Math.max(2, Math.round(dist(p1, p2) / 22))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const tt = t * t
      const ttt = tt * t
      const x =
        0.5 *
        (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt)
      const y =
        0.5 *
        (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt)
      out.push({ p: { x, y }, isNode: s === 0 })
    }
  }
  out.push({ p: pts[n - 1], isNode: true })
  return out
}

/**
 * One continuous, gently wavy polyline through a chain of node points. The nodes
 * themselves are pinned (the road passes exactly through them, so they truly
 * control the path); only the interpolated points between them wobble, and the
 * whole run is smooth across nodes — no visible per-segment seams.
 */
/**
 * Roads are painted, not drawn as infinitely-thin lines: a primary road's casing
 * stroke is 15 units wide (7.5 either side of its centerline — see Roads.tsx),
 * and the render path is smoothed AGAIN afterwards (toSmoothPath's cubic Bezier
 * through these very points), which can bulge the painted line slightly beyond
 * any individual sample. A centerline point that is merely "not inside the
 * water" can still have its visible stroke lapping over the shore. Keep every
 * point at least this far from the water polygon (not just outside it) so the
 * painted road never touches the sea, with headroom to spare.
 */
export const WATER_BUFFER = 24

export function chainPolyline(pts: Point[], water?: Point[] | null): Point[] {
  if (pts.length < 2) return pts.slice()
  const dense = catmullRom(pts)
  const m = dense.length
  const amp = 9
  const hasWater = !!water && water.length >= 3
  // Not just "outside the water" — at least WATER_BUFFER clear of it.
  const farEnough = (p: Point) => {
    if (!hasWater) return true
    if (pointInPolygon(p, water!)) return false
    return dist(p, closestPointOnPolygon(p, water!)) >= WATER_BUFFER
  }
  // Push p to exactly WATER_BUFFER from the water polygon, on the land side —
  // whether p started on land-but-too-close or fully submerged.
  const pushInland = (p: Point): Point => {
    const b = closestPointOnPolygon(p, water!)
    const inside = pointInPolygon(p, water!)
    let vx = p.x - b.x
    let vy = p.y - b.y
    if (inside) {
      vx = -vx
      vy = -vy
    }
    const len = Math.hypot(vx, vy)
    if (len < 1e-6) return p
    return { x: b.x + (vx / len) * WATER_BUFFER, y: b.y + (vy / len) * WATER_BUFFER }
  }
  return dense.map((d, i) => {
    if (d.isNode || i === 0 || i === m - 1) return d.p
    const perp = perpendicular(dense[i - 1].p, dense[i + 1].p)
    const w = roadNoise(d.p.x * 0.005, d.p.y * 0.005) + 0.5 * roadNoise(d.p.x * 0.013, d.p.y * 0.013)
    const wobbled = { x: d.p.x + perp.x * w * amp, y: d.p.y + perp.y * w * amp }
    if (farEnough(wobbled)) return wobbled
    // The hand-drawn wobble put this point too close to (or in) the sea —
    // happens when a road runs close and parallel to the shore. Fall back to
    // the smooth, unwobbled curve point if THAT clears the buffer; otherwise
    // push it inland by exactly the buffer distance.
    if (farEnough(d.p)) return d.p
    return pushInland(d.p)
  })
}

export type RoadNetwork = { nodes: RoadNode[]; edges: RoadEdge[] }

/** True if edge u-v is a Gabriel edge: no other point lies in the circle with
 *  diameter u-v (equivalently every other point subtends a non-obtuse angle). */
function isGabrielEdge(P: Point[], u: number, v: number): boolean {
  const a = P[u]
  const b = P[v]
  for (let w = 0; w < P.length; w++) {
    if (w === u || w === v) continue
    const dot = (a.x - P[w].x) * (b.x - P[w].x) + (a.y - P[w].y) * (b.y - P[w].y)
    if (dot < -1e-6) return false
  }
  return true
}

/** Gabriel edges (as index pairs) of a point subset — a planar, connected,
 *  uncluttered subset of the subset's Delaunay triangulation. */
function gabrielEdgePairs(pts: Point[]): [number, number][] {
  const out: [number, number][] = []
  if (pts.length < 2) return out
  if (pts.length === 2) return [[0, 1]]
  const delaunay = Delaunay.from(
    pts,
    (p) => p.x,
    (p) => p.y,
  )
  const tri = delaunay.triangles
  const seen = new Set<string>()
  for (let t = 0; t < tri.length; t += 3) {
    const abc = [tri[t], tri[t + 1], tri[t + 2]]
    for (let k = 0; k < 3; k++) {
      const u = abc[k]
      const v = abc[(k + 1) % 3]
      const key = u < v ? `${u}-${v}` : `${v}-${u}`
      if (seen.has(key)) continue
      seen.add(key)
      if (isGabrielEdge(pts, u, v)) out.push([u, v])
    }
  }
  return out
}

/**
 * Build the default editable road GRAPH as a PLANAR network so auto-generated
 * roads never cross (if you want a crossing, add a node and connect to it):
 *  - a central plaza, a gate node per entrance with an exit stub outside,
 *  - a node at every district centre,
 *  - the graph is built as TWO Gabriel subgraphs — one over the inner districts
 *    (+ plaza + gates), one over the outer districts (+ gates) — that share only
 *    the gate nodes. So the ONLY way a street crosses the wall is through a gate,
 *    which keeps gates few and roads funnelling through them.
 * Streets touching a plaza or gate are primary (main roads); the rest are
 * secondary side streets.
 */
export function buildRoadNetwork(
  center: Point,
  sites: Point[],
  anchors: Point[],
  footprintRadius: number,
  rng: Rng,
  siteIsInner: boolean[],
  obstacles?: RoadObstacles,
): RoadNetwork {
  const nodes: RoadNode[] = []
  const edges: RoadEdge[] = []

  // Points that take part in the planar graph, index-aligned with `ids`/`kinds`.
  const P: Point[] = []
  const ids: string[] = []
  const kinds: RoadNode['kind'][] = []
  const addGraphNode = (point: Point, kind: RoadNode['kind']): number => {
    const id = nanoid(8)
    nodes.push({ id, point, kind })
    P.push(point)
    ids.push(id)
    kinds.push(kind)
    return P.length - 1
  }

  const plazaIdx = addGraphNode(
    {
      x: center.x + rng.range(-1, 1) * footprintRadius * 0.05,
      y: center.y + rng.range(-1, 1) * footprintRadius * 0.05,
    },
    'plaza',
  )

  const entryAnchors = anchors.length
    ? anchors
    : [0, 1, 2, 3].map((k) => ({
        x: center.x + Math.cos((k / 4) * Math.PI * 2) * footprintRadius,
        y: center.y + Math.sin((k / 4) * Math.PI * 2) * footprintRadius,
      }))

  // An edge may never cut across open water, and may cross the wall ONLY at a
  // gate — so roads funnel through gates and hug the shore instead of tunnelling
  // through the sea or out the far side of the rampart. Testing each crossing
  // point's distance to a gate (rather than exempting any gate-ended edge) is
  // what stops a gate-to-distant-sprawl street from spearing through the wall.
  // Computed up front (not after gate/exit setup) so the exit stub below can be
  // checked against it too — a straight radial from a gate out to the city edge
  // can otherwise clip through an unrelated lobe of a non-convex coastal wall.
  const water = obstacles?.water
  const wall = obstacles?.wall
  const gateTol = Math.max(28, footprintRadius * 0.06)

  const gateIdxs: number[] = []
  for (const anchor of entryAnchors) {
    const gateIdx = addGraphNode({ x: anchor.x, y: anchor.y }, 'gate')
    gateIdxs.push(gateIdx)
    // Exit: a road leaving the city, placed just past the CITY EDGE on the gate's
    // radial (not just outside the wall — the wall no longer bounds the whole city,
    // so a wall-relative exit would land in the middle of the sprawl). If the
    // straight stub would clip an unrelated lobe of the wall or open water, pull
    // it toward the GATE (not toward `footprintRadius` from center — the wall's
    // actual radius along this angle can differ a lot from footprintRadius, so
    // interpolating there instead of toward the gate could leave the "shrunk"
    // point just as far from the gate as where it started). A zero-length stub
    // trivially can't cross anything away from its own single point, so this is
    // guaranteed to terminate clear.
    const dx = anchor.x - center.x
    const dy = anchor.y - center.y
    const len = Math.hypot(dx, dy) || 1
    const farExit = { x: center.x + (dx / len) * footprintRadius * 1.14, y: center.y + (dy / len) * footprintRadius * 1.14 }
    let t = 1
    let exitPoint = farExit
    for (let tries = 0; tries < 8; tries++) {
      const blocked =
        (water && water.length >= 3 && segCrossesPolygon(exitPoint, anchor, water)) ||
        (wall && wall.length >= 3 && crossesWallAwayFromGate(exitPoint, anchor, wall, [anchor], gateTol))
      if (!blocked) break
      t *= 0.5
      exitPoint = { x: anchor.x + (farExit.x - anchor.x) * t, y: anchor.y + (farExit.y - anchor.y) * t }
    }
    const exitId = nanoid(8)
    nodes.push({ id: exitId, point: exitPoint, kind: 'exit' })
    edges.push({ id: nanoid(8), a: exitId, b: ids[gateIdx], kind: 'primary' })
  }

  const innerSiteIdxs: number[] = []
  const outerSiteIdxs: number[] = []
  sites.forEach((s, k) => {
    const idx = addGraphNode({ x: s.x, y: s.y }, 'junction')
    ;(siteIsInner[k] !== false ? innerSiteIdxs : outerSiteIdxs).push(idx)
  })

  // Collect candidate Gabriel edges from the inner network (core + gates) and
  // the outer network (sprawl + gates). The two share only the gate nodes, so
  // streets cross the wall exclusively at gates.
  const gateSet = new Set(gateIdxs)
  const gatePts = gateIdxs.map((i) => P[i])
  const edgeBlocked = (u: number, v: number): boolean => {
    const a = P[u]
    const b = P[v]
    if (water && water.length >= 3 && segCrossesPolygon(a, b, water)) return true
    if (wall && wall.length >= 3 && crossesWallAwayFromGate(a, b, wall, gatePts, gateTol)) return true
    return false
  }
  const seenEdge = new Set<string>()
  type Cand = { gu: number; gv: number; primary: boolean; len2: number }
  const cands: Cand[] = []
  const collect = (globalIdxs: number[]) => {
    if (globalIdxs.length < 2) return
    const pts = globalIdxs.map((i) => P[i])
    for (const [a, b] of gabrielEdgePairs(pts)) {
      const gu = globalIdxs[a]
      const gv = globalIdxs[b]
      // Never run a road directly between two wall (gate) nodes.
      if (gateSet.has(gu) && gateSet.has(gv)) continue
      // Never let a candidate tunnel through water or the wall (except at a gate).
      if (edgeBlocked(gu, gv)) continue
      const key = gu < gv ? `${gu}-${gv}` : `${gv}-${gu}`
      if (seenEdge.has(key)) continue
      seenEdge.add(key)
      const primary = kinds[gu] === 'plaza' || kinds[gu] === 'gate' || kinds[gv] === 'plaza' || kinds[gv] === 'gate'
      const dx = P[gu].x - P[gv].x
      const dy = P[gu].y - P[gv].y
      cands.push({ gu, gv, primary, len2: dx * dx + dy * dy })
    }
  }
  collect([plazaIdx, ...gateIdxs, ...innerSiteIdxs])
  collect([...gateIdxs, ...outerSiteIdxs])

  // Each subgraph is planar on its own, but their union isn't. Add edges
  // greedily — main roads first, then shortest — skipping any that would cross an
  // already-accepted edge, so the whole network stays PLANAR (no crossings).
  cands.sort((a, b) => (a.primary === b.primary ? a.len2 - b.len2 : a.primary ? -1 : 1))
  const accepted: { u: number; v: number }[] = []
  for (const c of cands) {
    let ok = true
    for (const e of accepted) {
      if (e.u === c.gu || e.u === c.gv || e.v === c.gu || e.v === c.gv) continue
      if (properCross(P[c.gu], P[c.gv], P[e.u], P[e.v])) {
        ok = false
        break
      }
    }
    if (!ok) continue
    accepted.push({ u: c.gu, v: c.gv })
    edges.push({ id: nanoid(8), a: ids[c.gu], b: ids[c.gv], kind: c.primary ? 'primary' : 'secondary' })
  }

  // Crossing rejection can strand a node whose every candidate edge was dropped.
  // Reconnect any such node with the shortest NON-crossing edge that respects the
  // funnel (same side of the wall, or via a gate), so the graph stays connected
  // and planar.
  const N0 = P.length
  let N = N0
  const outerSet = new Set(outerSiteIdxs)
  const zoneOK = (u: number, v: number) =>
    !(gateSet.has(u) && gateSet.has(v)) && (gateSet.has(u) || gateSet.has(v) || outerSet.has(u) === outerSet.has(v))
  const adjP: number[][] = Array.from({ length: N }, () => [])
  for (const e of accepted) {
    adjP[e.u].push(e.v)
    adjP[e.v].push(e.u)
  }
  const reachedFrom = (): Set<number> => {
    const seen = new Set<number>([plazaIdx])
    const st = [plazaIdx]
    while (st.length) {
      const c = st.pop()!
      for (const nb of adjP[c]) if (!seen.has(nb)) {
        seen.add(nb)
        st.push(nb)
      }
    }
    return seen
  }
  // A concave stretch of wall can sit between an outer node and every gate, so
  // every STRAIGHT line to the reached set tunnels through solid rampart
  // somewhere that isn't a gate (confirmed by testing — a real geometric fact,
  // not a bug in the crossing check). Some walls need only one detour point to
  // get around; a few gnarlier ones need two or more. Route around it with a
  // small visibility-graph search over {u, sampled wall vertices, reachable
  // targets} instead of weakening the rule: touching a WALL VERTEX is legal for
  // the same reason touching a gate is (the path grazes the rampart's own
  // corner without cutting through it), so a shortest path through a chain of
  // such vertices can walk around an arbitrarily complex concave notch.
  const routeAroundWall = (u: number): { path: Point[]; v: number } | null => {
    if (!wall || wall.length < 3) return null
    // Nearest few legal targets, not every reached node — this is an expensive
    // search (a small Dijkstra per attempt), so keep its graph small.
    const candidatesV = [...reached]
      .filter((v) => zoneOK(u, v))
      .sort((a, b) => dist(P[u], P[a]) - dist(P[u], P[b]))
      .slice(0, 12)
    if (!candidatesV.length) return null
    // Sample the WHOLE wall uniformly (not just points near u) — a detour
    // around a large peninsula can legitimately need a waypoint far from both u
    // and its nearest targets, so a proximity filter can blind-spot exactly the
    // vertex that would have worked. A plain stride keeps the graph small
    // (~80 points) while still covering every concave notch the wall has.
    const stride = Math.max(1, Math.ceil(wall.length / 80))
    const wallSample: Point[] = []
    for (let wi = 0; wi < wall.length; wi += stride) wallSample.push(wall[wi])

    // Search-graph points: [0]=u, [1..W]=wall sample, [W+1..]=candidate targets.
    const pts: Point[] = [P[u], ...wallSample, ...candidatesV.map((v) => P[v])]
    const n = pts.length
    const isWallPt = (i: number) => i >= 1 && i <= wallSample.length
    const targetOf = (i: number) => (i > wallSample.length ? candidatesV[i - wallSample.length - 1] : -1)

    const legal = (i: number, j: number): boolean => {
      const a = pts[i]
      const b = pts[j]
      if (water && water.length >= 3 && segCrossesPolygon(a, b, water)) return false
      const honoraries: Point[] = []
      if (isWallPt(i)) honoraries.push(a)
      if (isWallPt(j)) honoraries.push(b)
      const gatesForHop = honoraries.length ? [...gatePts, ...honoraries] : gatePts
      if (crossesWallAwayFromGate(a, b, wall, gatesForHop, gateTol)) return false
      const endU = i === 0 || j === 0 ? u : -1
      const endV = targetOf(i) >= 0 ? targetOf(i) : targetOf(j) >= 0 ? targetOf(j) : -1
      for (const e of accepted) {
        if (e.u === endU || e.v === endU || e.u === endV || e.v === endV) continue
        if (properCross(a, b, P[e.u], P[e.v])) return false
      }
      return true
    }

    // Dijkstra from node 0 (u); stop as soon as any target settles (guaranteed
    // shortest, since Dijkstra settles nodes in increasing distance order).
    const distArr = new Array(n).fill(Infinity)
    const prev = new Array(n).fill(-1)
    const visited = new Array(n).fill(false)
    distArr[0] = 0
    for (let iter = 0; iter < n; iter++) {
      let cur = -1
      let curD = Infinity
      for (let i = 0; i < n; i++) {
        if (!visited[i] && distArr[i] < curD) {
          curD = distArr[i]
          cur = i
        }
      }
      if (cur === -1) break
      visited[cur] = true
      const v = targetOf(cur)
      if (v >= 0) {
        const path: Point[] = []
        for (let c = cur; c !== -1; c = prev[c]) path.unshift(pts[c])
        return { path, v }
      }
      for (let j = 0; j < n; j++) {
        if (visited[j] || j === cur || !legal(cur, j)) continue
        const w = dist(pts[cur], pts[j])
        if (distArr[cur] + w < distArr[j]) {
          distArr[j] = distArr[cur] + w
          prev[j] = cur
        }
      }
    }
    return null
  }
  let reached = reachedFrom()
  for (let guard = 0; reached.size < N && guard < N0 * 2; guard++) {
    let best: { u: number; v: number; d2: number } | null = null
    for (let u = 0; u < N; u++) {
      if (reached.has(u)) continue
      for (const v of reached) {
        if (!zoneOK(u, v)) continue
        if (edgeBlocked(u, v)) continue
        let clear = true
        for (const e of accepted) {
          if (e.u === u || e.v === u || e.u === v || e.v === v) continue
          if (properCross(P[u], P[v], P[e.u], P[e.v])) {
            clear = false
            break
          }
        }
        if (!clear) continue
        const dx = P[u].x - P[v].x
        const dy = P[u].y - P[v].y
        const d2 = dx * dx + dy * dy
        if (!best || d2 < best.d2) best = { u, v, d2 }
      }
    }
    if (best) {
      accepted.push({ u: best.u, v: best.v })
      adjP[best.u].push(best.v)
      adjP[best.v].push(best.u)
      const primary = kinds[best.u] === 'plaza' || kinds[best.u] === 'gate' || kinds[best.v] === 'plaza' || kinds[best.v] === 'gate'
      edges.push({ id: nanoid(8), a: ids[best.u], b: ids[best.v], kind: primary ? 'primary' : 'secondary' })
      reached = reachedFrom()
      continue
    }

    // No stranded node has a legal DIRECT edge — try routing each one around
    // the wall via a waypoint before giving up.
    let detourFound = false
    for (let u = 0; u < N; u++) {
      if (reached.has(u)) continue
      const detour = routeAroundWall(u)
      if (!detour) continue
      // path = [P[u], ...one or more wall waypoints..., P[detour.v]]. Materialize
      // every waypoint in between as a real junction node and chain edges u ->
      // w1 -> w2 -> ... -> v.
      let prevIdx = u
      for (let k = 1; k < detour.path.length - 1; k++) {
        const wIdx = addGraphNode(detour.path[k], 'junction')
        adjP.push([])
        N++
        accepted.push({ u: prevIdx, v: wIdx })
        adjP[prevIdx].push(wIdx)
        adjP[wIdx].push(prevIdx)
        edges.push({ id: nanoid(8), a: ids[prevIdx], b: ids[wIdx], kind: 'secondary' })
        prevIdx = wIdx
      }
      accepted.push({ u: prevIdx, v: detour.v })
      adjP[prevIdx].push(detour.v)
      adjP[detour.v].push(prevIdx)
      edges.push({ id: nanoid(8), a: ids[prevIdx], b: ids[detour.v], kind: 'secondary' })
      reached = reachedFrom()
      detourFound = true
      break
    }
    // If even the waypoint detour can't legally reach anything (never observed
    // in testing, but geometrically not impossible), stop rather than loop
    // forever — the node stays stranded, same as the prior fallback behaviour.
    if (!detourFound) break
  }

  return { nodes, edges }
}

/**
 * Recompute renderable road polylines from the node/edge graph. Consecutive
 * edges of the same kind that pass through a degree-2 node are merged into a
 * single continuous chain, so a line of waypoint nodes renders as ONE smooth
 * road rather than a string of independent segments.
 */
export function derivedRoads(nodes: RoadNode[], edges: RoadEdge[], water?: Point[] | null): Road[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  type Adj = { edgeId: string; other: string; kind: RoadKind }
  const adj = new Map<string, Adj[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) {
    if (!byId.has(e.a) || !byId.has(e.b)) continue
    adj.get(e.a)!.push({ edgeId: e.id, other: e.b, kind: e.kind })
    adj.get(e.b)!.push({ edgeId: e.id, other: e.a, kind: e.kind })
  }
  // A node is a "through" node for a chain if it joins exactly two same-kind edges.
  const isThrough = (nodeId: string, kind: RoadKind) => {
    const a = adj.get(nodeId)!
    return a.length === 2 && a[0].kind === kind && a[1].kind === kind
  }

  const usedEdges = new Set<string>()
  const roads: Road[] = []
  let chainIndex = 0

  for (const e of edges) {
    if (usedEdges.has(e.id) || !byId.has(e.a) || !byId.has(e.b)) continue
    usedEdges.add(e.id)
    const kind = e.kind
    const seq = [e.a, e.b]

    // Extend forward through same-kind degree-2 nodes.
    let end = e.b
    let guard = 0
    while (isThrough(end, kind) && guard++ < 4096) {
      const next = adj.get(end)!.find((x) => !usedEdges.has(x.edgeId))
      if (!next) break
      usedEdges.add(next.edgeId)
      seq.push(next.other)
      end = next.other
    }
    // Extend backward.
    let start = e.a
    guard = 0
    while (isThrough(start, kind) && guard++ < 4096) {
      const prev = adj.get(start)!.find((x) => !usedEdges.has(x.edgeId))
      if (!prev) break
      usedEdges.add(prev.edgeId)
      seq.unshift(prev.other)
      start = prev.other
    }

    const pts = seq.map((id) => byId.get(id)!.point)
    roads.push({ id: `chain-${chainIndex++}`, kind, points: chainPolyline(pts, water) })
  }
  return roads
}
