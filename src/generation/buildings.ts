import { nanoid } from 'nanoid'
import type { Building, District, DistrictType, Lane, Point, Polygon, River, Road, Wall } from '../shared/types.ts'
import {
  centroid,
  clipPolygonConvex,
  clipPolygonHalfPlane,
  closestPointOnPolygon,
  closestPointOnSegment,
  insetPolygon,
  pointInPolygon,
  segmentIntersection,
  signedArea,
} from '../shared/geometry.ts'
import type { Rng } from './rng.ts'
import { hashString, makeRng } from './rng.ts'
import { landmarkShape } from './buildingShapes.ts'
import { riverCurve } from './river.ts'

/** Landmark size as a fraction of the district's smaller dimension, by type.
 *  Castle keeps are the largest — it's a castle. */
const LANDMARK_FRAC: Record<DistrictType, number> = {
  castle: 0.42,
  temple: 0.3,
  noble: 0.26,
  market: 0.24,
  industrial: 0.24,
  residential: 0.2,
  slum: 0.16,
  fairground: 0.26,
  docks: 0.22,
  farmland: 0.22,
  cemetery: 0.2,
  tannery: 0.18,
  suburb: 0.16,
  shanty: 0.1,
  fishmarket: 0.2,
  shipyard: 0.28,
  warehouse: 0.22,
}

type Segment = { a: Point; b: Point }

function roadSegments(roads: Road[]): Segment[] {
  const segs: Segment[] = []
  for (const r of roads) {
    for (let i = 0; i < r.points.length - 1; i++) segs.push({ a: r.points[i], b: r.points[i + 1] })
  }
  return segs
}

/** Bearing of the street nearest to p (for aligning buildings to the road). */
function nearestStreetAngle(p: Point, segs: Segment[]): number | null {
  let best: number | null = null
  let bd = Infinity
  for (const s of segs) {
    const c = closestPointOnSegment(p, s.a, s.b)
    const d = (c.x - p.x) ** 2 + (c.y - p.y) ** 2
    if (d < bd) {
      bd = d
      best = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x)
    }
  }
  return best
}

type Rect = { x: number; y: number; w: number; h: number }

/** A road/river/wall segment plus the clearance buildings must keep from it. */
type Corridor = { a: Point; b: Point; half: number }

type RectBounds = { minx: number; miny: number; maxx: number; maxy: number }

function pointSegDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (l2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function pointInBounds(p: Point, r: RectBounds): boolean {
  return p.x >= r.minx && p.x <= r.maxx && p.y >= r.miny && p.y <= r.maxy
}

function pointBoundsDist(p: Point, r: RectBounds): number {
  const dx = Math.max(r.minx - p.x, 0, p.x - r.maxx)
  const dy = Math.max(r.miny - p.y, 0, p.y - r.maxy)
  return Math.hypot(dx, dy)
}

/** Minimum distance between segment a-b and an axis-aligned rectangle (0 if they touch). */
function segRectDist(a: Point, b: Point, r: RectBounds): number {
  if (pointInBounds(a, r) || pointInBounds(b, r)) return 0
  const c1 = { x: r.minx, y: r.miny }
  const c2 = { x: r.maxx, y: r.miny }
  const c3 = { x: r.maxx, y: r.maxy }
  const c4 = { x: r.minx, y: r.maxy }
  const edges: [Point, Point][] = [
    [c1, c2],
    [c2, c3],
    [c3, c4],
    [c4, c1],
  ]
  for (const [e1, e2] of edges) if (segmentIntersection(a, b, e1, e2)) return 0
  return Math.min(
    pointSegDist(c1, a, b),
    pointSegDist(c2, a, b),
    pointSegDist(c3, a, b),
    pointSegDist(c4, a, b),
    pointBoundsDist(a, r),
    pointBoundsDist(b, r),
  )
}

function roadCorridors(roads: Road[]): Corridor[] {
  const corridors: Corridor[] = []
  for (const road of roads) {
    // Clearance = half the drawn casing width plus a small setback.
    const half = (road.kind === 'primary' ? 8 : 4) + 3
    for (let i = 0; i < road.points.length - 1; i++) {
      corridors.push({ a: road.points[i], b: road.points[i + 1], half })
    }
  }
  return corridors
}

/** Hard barriers buildings must never cover: water and walls (city + inner). */
function barrierCorridors(river: River | null, wall: Wall | null, walledPolygons: Polygon[]): Corridor[] {
  const corridors: Corridor[] = []
  if (river) {
    // Clear the smooth river curve at its actual width (plus a small setback).
    const curve = riverCurve(river.points)
    const half = river.width / 2 + 3
    for (let i = 0; i < curve.length - 1; i++) {
      corridors.push({ a: curve[i], b: curve[i + 1], half })
    }
  }
  if (wall) {
    const poly = wall.polygon
    for (let i = 0; i < poly.length; i++) {
      corridors.push({ a: poly[i], b: poly[(i + 1) % poly.length], half: 12 })
    }
  }
  for (const poly of walledPolygons) {
    if (poly.length < 3) continue
    for (let i = 0; i < poly.length; i++) {
      corridors.push({ a: poly[i], b: poly[(i + 1) % poly.length], half: 10 })
    }
  }
  return corridors
}

/** True if the rect intrudes into any corridor's clearance zone. */
function overlapsCorridor(bounds: RectBounds, corridors: Corridor[]): boolean {
  for (const c of corridors) {
    // Cheap bbox reject before the exact test.
    const minx = Math.min(c.a.x, c.b.x) - c.half
    const maxx = Math.max(c.a.x, c.b.x) + c.half
    const miny = Math.min(c.a.y, c.b.y) - c.half
    const maxy = Math.max(c.a.y, c.b.y) + c.half
    if (bounds.maxx < minx || bounds.minx > maxx || bounds.maxy < miny || bounds.miny > maxy) continue
    if (segRectDist(c.a, c.b, bounds) < c.half) return true
  }
  return false
}

type TypeProfile = {
  /** Recursion stops when a cell's short side drops below this. */
  minLeaf: number
  /** Probability a leaf cell actually becomes a building. */
  fill: number
  /** Inset from the leaf cell edges (streets/gaps between buildings). */
  inset: number
}

const PROFILES: Record<DistrictType, TypeProfile> = {
  castle: { minLeaf: 40, fill: 0.9, inset: 8 },
  noble: { minLeaf: 36, fill: 0.92, inset: 6 },
  temple: { minLeaf: 40, fill: 0.9, inset: 7 },
  market: { minLeaf: 24, fill: 0.96, inset: 3.5 },
  residential: { minLeaf: 28, fill: 0.95, inset: 4 },
  slum: { minLeaf: 19, fill: 0.97, inset: 2 },
  industrial: { minLeaf: 34, fill: 0.92, inset: 6 },
  // Outside-the-wall types: sprawl is looser, fields/cemeteries mostly open.
  suburb: { minLeaf: 26, fill: 0.7, inset: 5 },
  docks: { minLeaf: 34, fill: 0.75, inset: 6 },
  shanty: { minLeaf: 15, fill: 0.98, inset: 1.5 },
  farmland: { minLeaf: 60, fill: 0.18, inset: 12 },
  cemetery: { minLeaf: 46, fill: 0.12, inset: 10 },
  tannery: { minLeaf: 30, fill: 0.55, inset: 6 },
  fairground: { minLeaf: 40, fill: 0.25, inset: 8 },
  fishmarket: { minLeaf: 22, fill: 0.72, inset: 3 },
  shipyard: { minLeaf: 40, fill: 0.55, inset: 6 },
  warehouse: { minLeaf: 36, fill: 0.82, inset: 5 },
}

function bbox(poly: Point[]): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of poly) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * True if any edge of `lot` lies on the block boundary `inner` — i.e. the lot
 * fronts a lane, so a building there has at least one wall against a lane.
 * Interior (landlocked) lots fail this and are left as yards/courtyards.
 */
function frontsLane(lot: Polygon, inner: Polygon): boolean {
  for (let i = 0; i < lot.length; i++) {
    const a = lot[i]
    const b = lot[(i + 1) % lot.length]
    // Sample along the edge (not just the midpoint) so short frontages still count.
    for (const t of [0.25, 0.5, 0.75]) {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      const cp = closestPointOnPolygon(p, inner)
      if (Math.hypot(cp.x - p.x, cp.y - p.y) < 1.2) return true
    }
  }
  return false
}

/** Smallest interior angle (radians) of a polygon — used to reject sharp,
 *  skewed slivers that read as "harsh". */
function minInteriorAngle(poly: Polygon): number {
  let m = Math.PI
  for (let i = 0; i < poly.length; i++) {
    const a = poly[(i - 1 + poly.length) % poly.length]
    const b = poly[i]
    const c = poly[(i + 1) % poly.length]
    const v1x = a.x - b.x
    const v1y = a.y - b.y
    const v2x = c.x - b.x
    const v2y = c.y - b.y
    const l1 = Math.hypot(v1x, v1y) || 1
    const l2 = Math.hypot(v2x, v2y) || 1
    const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)))
    const ang = Math.acos(cos)
    if (ang < m) m = ang
  }
  return m
}

/** Cut every corner of a convex polygon back by a small fraction of its shorter
 *  incident edge — softens the crisp, angular footprints into gentler shapes. */
export function bevelCorners(poly: Polygon, frac: number): Polygon {
  if (poly.length < 3) return poly
  const out: Point[] = []
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i - 1 + poly.length) % poly.length]
    const cur = poly[i]
    const next = poly[(i + 1) % poly.length]
    const dPrev = Math.min(frac, 0.45)
    const dNext = Math.min(frac, 0.45)
    out.push({ x: cur.x + (prev.x - cur.x) * dPrev, y: cur.y + (prev.y - cur.y) * dPrev })
    out.push({ x: cur.x + (next.x - cur.x) * dNext, y: cur.y + (next.y - cur.y) * dNext })
  }
  return out
}

function polyBounds(poly: Point[]): RectBounds {
  let minx = Infinity
  let miny = Infinity
  let maxx = -Infinity
  let maxy = -Infinity
  for (const p of poly) {
    if (p.x < minx) minx = p.x
    if (p.y < miny) miny = p.y
    if (p.x > maxx) maxx = p.x
    if (p.y > maxy) maxy = p.y
  }
  return { minx, miny, maxx, maxy }
}

/**
 * Recursively split a CONVEX polygon into convex cells each ≤ `targetArea`. Each
 * cut runs across the polygon's longest edge (so cells line up along the frontage
 * like lots on a street) with the angle and position jittered for organic — but
 * not blobby — irregularity. Used for both blocks and the lots within them.
 */
function subdividePolygon(poly: Polygon, targetArea: number, angleJitter: number, rng: Rng): Polygon[] {
  const out: Polygon[] = []
  const stack: { poly: Polygon; depth: number }[] = [{ poly, depth: 0 }]
  while (stack.length) {
    const item = stack.pop()!
    const cur = item.poly
    if (cur.length < 3) continue
    if (Math.abs(signedArea(cur)) <= targetArea || item.depth >= 14) {
      out.push(cur)
      continue
    }
    // Longest edge sets the cut direction (cut ACROSS the frontage).
    let bestLen = -1
    let ex = 1
    let ey = 0
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i]
      const b = cur[(i + 1) % cur.length]
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      if (L > bestLen) {
        bestLen = L
        ex = (b.x - a.x) / (L || 1)
        ey = (b.y - a.y) / (L || 1)
      }
    }
    const ang = Math.atan2(ey, ex) + rng.range(-angleJitter, angleJitter)
    const nx = Math.cos(ang)
    const ny = Math.sin(ang)
    let mn = Infinity
    let mx = -Infinity
    for (const p of cur) {
      const d = nx * p.x + ny * p.y
      if (d < mn) mn = d
      if (d > mx) mx = d
    }
    const sp = mn + (mx - mn) * (0.5 + rng.range(-0.16, 0.16))
    const left = clipPolygonHalfPlane(cur, nx, ny, sp)
    const right = clipPolygonHalfPlane(cur, -nx, -ny, -sp)
    if (left.length >= 3 && right.length >= 3 && Math.abs(signedArea(left)) > 2 && Math.abs(signedArea(right)) > 2) {
      stack.push({ poly: left, depth: item.depth + 1 })
      stack.push({ poly: right, depth: item.depth + 1 })
    } else {
      out.push(cur)
    }
  }
  return out
}

type OBB = { cx: number; cy: number; w: number; h: number; rot: number }

/** Corners + separating axes of an oriented bounding box. */
function obbGeometry(o: OBB): { corners: Point[]; axes: Point[] } {
  const c = Math.cos(o.rot)
  const s = Math.sin(o.rot)
  const ux = { x: c, y: s }
  const uy = { x: -s, y: c }
  const hw = o.w / 2
  const hh = o.h / 2
  const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy]) => ({
    x: o.cx + sx * hw * ux.x + sy * hh * uy.x,
    y: o.cy + sx * hw * ux.y + sy * hh * uy.y,
  }))
  return { corners, axes: [ux, uy] }
}

function aabbOf(corners: Point[]): RectBounds {
  let minx = Infinity
  let miny = Infinity
  let maxx = -Infinity
  let maxy = -Infinity
  for (const p of corners) {
    if (p.x < minx) minx = p.x
    if (p.y < miny) miny = p.y
    if (p.x > maxx) maxx = p.x
    if (p.y > maxy) maxy = p.y
  }
  return { minx, miny, maxx, maxy }
}

/**
 * The most open point in a polygon: the interior sample farthest from every
 * corridor (roads/river/walls) and from the polygon boundary. Its clearance is
 * the radius of the largest empty circle there — a good spot for a big landmark
 * that doesn't block a road.
 */
function largestOpenSpot(poly: Polygon, corridors: Corridor[]): { p: Point; clearance: number } | null {
  const bb = bbox(poly)
  const step = Math.max(8, Math.min(bb.w, bb.h) / 16)
  let best: { p: Point; clearance: number } | null = null
  for (let x = bb.x + step / 2; x < bb.x + bb.w; x += step) {
    for (let y = bb.y + step / 2; y < bb.y + bb.h; y += step) {
      const p = { x, y }
      if (!pointInPolygon(p, poly)) continue
      const edge = closestPointOnPolygon(p, poly)
      let clr = Math.hypot(p.x - edge.x, p.y - edge.y)
      for (const c of corridors) {
        const d = pointSegDist(p, c.a, c.b) - c.half
        if (d < clr) clr = d
        if (clr <= 0) break
      }
      if (clr > 0 && (!best || clr > best.clearance)) best = { p, clearance: clr }
    }
  }
  return best
}

/** A lot the lot-fill pass considered valid (lane-fronting, clear of
 *  corridors, decently shaped) — whether or not the random roll actually gave
 *  it a building. Lets a hand-placed "conforming" building claim an empty one
 *  later with the exact shape procedural generation would have used there. */
type LotCandidate = { polygon: Polygon; footprint: Point[] }

/** A landmark's current placement, fed back in to re-carve a district's lots
 *  around wherever the user actually put it (see `landmarkOverride` below). */
export type LandmarkPlacement = { x: number; y: number; w: number; h: number; rotation: number }

function buildingsForDistrict(
  district: District,
  corridors: Corridor[],
  segs: Segment[],
  rng: Rng,
  density: number,
  // When given, lots are carved around THIS placement instead of one computed
  // fresh here, and no landmark building is added to the result — the caller
  // already has one (the user moved/resized/rotated it) and is only asking
  // for the rest of the district to make way for it. The RNG still runs the
  // same landmark-placement draws it always would (when the district isn't
  // noLandmark) so every OTHER lot's subdivision and fill roll stays in the
  // exact same sequence as before the move — only which lots the landmark's
  // footprint excludes actually changes.
  landmarkOverride?: LandmarkPlacement | null,
): { buildings: Building[]; lanes: Lane[]; lots: LotCandidate[] } {
  if (district.polygon.length < 3) return { buildings: [], lanes: [], lots: [] }
  const profile = PROFILES[district.type]
  const buildingSize = district.buildingSize ?? 1
  // Per-district controls, each INDEPENDENT of the others:
  //   • buildingSize → lot (= building) size.
  //   • density      → fraction of lots that get a building (the rest are yards).
  //   • blockSize    → how big each block is (how far apart the lanes run).
  //   • laneWidth    → lane width left between blocks.
  //   • buildingGap  → wall gap left between neighbouring buildings.
  const blockSize = district.blockSize ?? 2.6
  const laneWidth = district.laneWidth ?? 10
  const buildingGap = district.buildingGap ?? 1.5
  const lotLen = Math.max(9, profile.minLeaf * buildingSize)
  const lotArea = lotLen * lotLen * 0.85
  const blockLen = lotLen * Math.max(1.6, blockSize)
  const blockArea = blockLen * blockLen
  const laneGap = Math.max(2, laneWidth / 2)
  const wallGap = Math.max(0.4, buildingGap / 2)
  const fill = Math.min(1, profile.fill * density * (district.density ?? 1))
  const ANGLE_JITTER = 0.15 // gentle irregularity — enough to be organic, not skewed

  const result: Building[] = []
  const lanes: Lane[] = []
  const lots: LotCandidate[] = []
  const poly = district.polygon

  // Try to place a shaped landmark of target w0×h0 centred at (cx,cy), aligned to
  // the nearest street, shrinking/rotating until it fits (inside, clear of
  // corridors). Ordinary buildings use the lot-fill layout below, not this.
  const tryPlace = (cx: number, cy: number, w0: number, h0: number, scales: number[], avoid: Corridor[]): OBB | null => {
    const street = nearestStreetAngle({ x: cx, y: cy }, segs) ?? rng.range(-0.06, 0.06)
    const rots = [street, street + Math.PI / 2, street + 0.14, street - 0.14, street + 0.4, street - 0.4]
    for (const scale of scales) {
      const w = w0 * scale
      const h = h0 * scale
      if (w < 8 || h < 8) continue
      for (const rot of rots) {
        const candidate: OBB = { cx, cy, w, h, rot }
        const { corners } = obbGeometry(candidate)
        if (!corners.every((c) => pointInPolygon(c, poly))) continue
        if (overlapsCorridor(aabbOf(corners), avoid)) continue
        return candidate
      }
    }
    return null
  }

  // --- Landmark (hybrid): a big shaped signature building in the most OPEN part
  //     of the district — never blocking a road — placed first so ordinary lots
  //     yield to it. Skipped entirely once the user deletes a district's
  //     landmark (district.noLandmark) — not just omitted, but never attempted,
  //     so the district reflows exactly as if it had never had one and ordinary
  //     lots claim that space too. ---
  let lmCorners: Point[] | null = null
  if (!district.noLandmark) {
    const bb = bbox(poly)
    const minDim = Math.min(bb.w, bb.h)
    const target = Math.max(lotLen * 1.4, minDim * LANDMARK_FRAC[district.type])
    const lmScales = [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36, 0.28, 0.22]
    let lmObb: OBB | null = null
    const spot = largestOpenSpot(poly, corridors)
    if (spot) {
      const size = Math.min(target, spot.clearance * 2.1)
      lmObb = tryPlace(spot.p.x, spot.p.y, size, size * rng.range(0.82, 1), lmScales, corridors)
    }
    if (lmObb) {
      lmCorners = obbGeometry(lmObb).corners
      if (!landmarkOverride) {
        result.push({
          id: nanoid(8),
          x: lmObb.cx,
          y: lmObb.cy,
          w: lmObb.w,
          h: lmObb.h,
          rotation: lmObb.rot,
          shape: landmarkShape(district.type),
          isLandmark: true,
          districtId: district.id,
          isCustom: false,
        })
      }
    }
  }
  // The caller's actual landmark placement always wins for carving lots —
  // whether or not the auto-computation above found (or even attempted) one.
  if (landmarkOverride) {
    lmCorners = obbGeometry({
      cx: landmarkOverride.x,
      cy: landmarkOverride.y,
      w: landmarkOverride.w,
      h: landmarkOverride.h,
      rot: landmarkOverride.rotation,
    }).corners
  }

  // --- Lot-fill layout: subdivide the district into blocks (lanes between them),
  //     subdivide each block into lots, and fill each lot with a building that
  //     tiles the block and fronts the lanes. ---
  const build = insetPolygon(poly, Math.max(1, wallGap))
  const blocks = subdividePolygon(build.length >= 3 ? build : poly, blockArea, ANGLE_JITTER, rng)
  for (const block of blocks) {
    const inner = insetPolygon(block, laneGap)
    if (inner.length < 3 || Math.abs(signedArea(inner)) < lotArea * 0.35) continue
    // Block outline is the lane structure — surfaced as an editor guide.
    lanes.push({ districtId: district.id, points: [...inner, inner[0]], depth: 1 })

    for (const lot of subdividePolygon(inner, lotArea, ANGLE_JITTER, rng)) {
      // Every building must have a wall on a lane — skip landlocked interior lots.
      if (!frontsLane(lot, inner)) continue
      // Consumed here regardless of what follows, so a later lot/block never
      // sees a different rng draw than it would have — the fill roll is drawn
      // at this exact point either way, only what happens AFTER it changed.
      const filled = rng.next() <= fill
      const raw = insetPolygon(lot, wallGap)
      if (raw.length < 3 || Math.abs(signedArea(raw)) < 40) continue
      // Reject sharp, skewed slivers (they read as "harsh").
      if (minInteriorAngle(raw) < 0.5) continue
      // Never overlap the landmark.
      if (lmCorners && clipPolygonConvex(raw, lmCorners).length >= 3) continue
      // Soften the crisp corners a touch (keeps straight walls, trims sharp points).
      const fp = bevelCorners(raw, 0.08)
      const bnds = polyBounds(fp)
      if (overlapsCorridor(bnds, corridors)) continue
      // A structurally valid lot — record it whether or not the roll filled
      // it, so a hand-placed "conforming" building can later claim an empty
      // one with this exact shape.
      lots.push({ polygon: lot, footprint: fp })
      if (!filled) continue
      const c = centroid(fp)
      result.push({
        id: nanoid(8),
        x: c.x,
        y: c.y,
        w: bnds.maxx - bnds.minx,
        h: bnds.maxy - bnds.miny,
        rotation: 0,
        footprint: fp.map((p) => ({ x: p.x - c.x, y: p.y - c.y })),
        isLandmark: false,
        districtId: district.id,
        isCustom: false,
        // Every lot-fill building tiles its block and fronts a lane exactly
        // like a hand-placed conforming one does — moving or rotating it
        // would pull it out of that lot just the same, so it's locked too.
        laneSnapped: true,
        // The raw, un-inset, un-beveled lot — see `Building.lot`.
        lot,
      })
    }
  }
  return { buildings: result, lanes, lots }
}

/**
 * Regenerate procedural buildings for a SINGLE district (used when its density
 * or type changes) without disturbing any other district.
 */
export function generateDistrictBuildings(
  district: District,
  roads: Road[],
  river: River | null,
  wall: Wall | null,
  walledPolygons: Polygon[],
  rng: Rng,
  density: number,
  // See `LandmarkPlacement` in buildingsForDistrict — pass the district's
  // landmark building's current x/y/w/h/rotation to re-carve ordinary lots
  // around wherever it actually sits (after a move/resize/rotate) instead of
  // regenerating a fresh one.
  landmarkOverride?: LandmarkPlacement | null,
): { buildings: Building[]; lanes: Lane[] } {
  const corridors = roadCorridors(roads).concat(barrierCorridors(river, wall, walledPolygons))
  return buildingsForDistrict(district, corridors, roadSegments(roads), rng, density, landmarkOverride)
}

/**
 * Find the lot at `point` within `district`'s own lot-fill layout — the exact
 * same layout that placed its current buildings, replayed from the same seed.
 * Used to make a hand-placed "generic" building conform to the block instead
 * of floating there as an arbitrary rectangle: same rules as procedural
 * generation, so a lot in a lane, without lane frontage, or too small/sharp
 * to build on is refused (returns null) exactly like generation would skip it.
 */
export function findDistrictLotAt(
  district: District,
  roads: Road[],
  river: River | null,
  wall: Wall | null,
  walledPolygons: Polygon[],
  rng: Rng,
  density: number,
  point: Point,
): { footprint: Point[]; x: number; y: number; w: number; h: number; lot: Point[] } | null {
  const corridors = roadCorridors(roads).concat(barrierCorridors(river, wall, walledPolygons))
  const { lots } = buildingsForDistrict(district, corridors, roadSegments(roads), rng, density)
  const hit = lots.find((l) => pointInPolygon(point, l.polygon))
  if (!hit) return null
  const bnds = polyBounds(hit.footprint)
  const c = centroid(hit.footprint)
  return {
    footprint: hit.footprint.map((p) => ({ x: p.x - c.x, y: p.y - c.y })),
    x: c.x,
    y: c.y,
    w: bnds.maxx - bnds.minx,
    h: bnds.maxy - bnds.miny,
    lot: hit.polygon,
  }
}

/**
 * Generate every district's buildings for a fresh city. Each district gets its
 * OWN rng seeded from `(seed, districtId)` — not one continuous stream threaded
 * across all of them — so that a district's building layout is reproducible
 * from its id alone, the exact same guarantee every per-district reflow
 * (regenerateDistrictBuildings, deleteBuilding's landmark reflow, and a
 * hand-placed conforming building's lot lookup) already relies on. Without
 * this, a lookup replaying "this district's lot layout" from `(seed,
 * districtId)` would compute a DIFFERENT layout than what a fresh generate
 * actually drew, since the shared stream's position for this district would
 * depend on how much every earlier district had already consumed.
 */
export function generateBuildings(
  districts: District[],
  roads: Road[],
  river: River | null,
  wall: Wall | null,
  seed: number,
  density: number,
): { buildings: Building[]; lanes: Lane[] } {
  const walledPolygons = districts.filter((d) => d.walled).map((d) => d.polygon)
  const corridors = roadCorridors(roads).concat(barrierCorridors(river, wall, walledPolygons))
  const segs = roadSegments(roads)
  const buildings: Building[] = []
  const lanes: Lane[] = []
  for (const district of districts) {
    const rng = makeRng((seed ^ hashString(district.id)) >>> 0)
    const r = buildingsForDistrict(district, corridors, segs, rng, density)
    buildings.push(...r.buildings)
    lanes.push(...r.lanes)
  }
  return { buildings, lanes }
}
