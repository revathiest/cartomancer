import type { Bridge, Point, River, Road } from '../shared/types.ts'
import { dist, segmentIntersection } from '../shared/geometry.ts'
import type { Rng } from './rng.ts'

/**
 * Dense smooth polyline through the river's few control points (Catmull-Rom).
 * The drawn river, bridges, and building clearances all use this so they match
 * the smooth curve rather than the sparse control points.
 */
export function riverCurve(pts: Point[]): Point[] {
  if (pts.length < 3) return pts.slice()
  const n = pts.length
  const get = (i: number) => pts[Math.max(0, Math.min(n - 1, i))]
  const out: Point[] = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1)
    const p1 = get(i)
    const p2 = get(i + 1)
    const p3 = get(i + 2)
    const steps = Math.max(2, Math.round(dist(p1, p2) / 18))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      const tt = t * t
      const ttt = tt * t
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt),
      })
    }
  }
  out.push(pts[n - 1])
  return out
}

/**
 * Bridges wherever a road crosses the river polyline. Each spans the water ALONG
 * the road (oblique crossings get longer bridges) and is road-wide. Recomputed
 * whenever roads move so bridges track the roads.
 */
export function computeBridges(controlPoints: Point[], roads: Road[], riverWidth: number): Bridge[] {
  const points = riverCurve(controlPoints)
  const riverHalf = riverWidth / 2 + 2
  const bridges: Bridge[] = []
  for (const road of roads) {
    const width = road.kind === 'primary' ? 20 : 13
    for (let i = 0; i < road.points.length - 1; i++) {
      const ra = road.points[i]
      const rb = road.points[i + 1]
      for (let j = 0; j < points.length - 1; j++) {
        const pa = points[j]
        const pb = points[j + 1]
        const hit = segmentIntersection(ra, rb, pa, pb)
        if (!hit) continue
        if (bridges.some((b) => Math.hypot(b.x - hit.x, b.y - hit.y) < 40)) continue
        const rdx = rb.x - ra.x
        const rdy = rb.y - ra.y
        const rl = Math.hypot(rdx, rdy) || 1
        const pdx = pb.x - pa.x
        const pdy = pb.y - pa.y
        const pl = Math.hypot(pdx, pdy) || 1
        const sinT = Math.abs((rdx / rl) * (pdy / pl) - (rdy / rl) * (pdx / pl))
        const length = (2 * riverHalf) / Math.max(0.35, sinT) + 10
        bridges.push({ x: hit.x, y: hit.y, angle: Math.atan2(rdy, rdx), length, width })
      }
    }
  }
  return bridges
}

/**
 * A single perturbed polyline that crosses (or skirts) the city footprint.
 * Control points are laid along a chord through the map and pushed sideways by
 * simplex noise; bridge markers are placed where roads cross the water.
 */
export function generateRiver(
  center: Point,
  footprintRadius: number,
  size: number,
  roads: Road[],
  rng: Rng,
  width: number,
): River {
  const angle = rng.range(0, Math.PI * 2)
  const dir = { x: Math.cos(angle), y: Math.sin(angle) }
  const perp = { x: -dir.y, y: dir.x }
  // Offset the chord from dead-centre so the river usually skirts rather than
  // bisects the core.
  const offset = rng.range(-footprintRadius * 0.5, footprintRadius * 0.5)
  const half = size * 0.75
  const base = { x: center.x + perp.x * offset, y: center.y + perp.y * offset }

  // A FEW control points (kept sparse so dragging them is smooth); the drawn
  // river is a Catmull-Rom curve through these.
  const samples = 8
  const points: Point[] = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const along = -half + t * (half * 2)
    const px = base.x + dir.x * along
    const py = base.y + dir.y * along
    const n = rng.noise2D(px * 0.0018, py * 0.0018)
    const wobble = n * footprintRadius * 0.35
    points.push({ x: px + perp.x * wobble, y: py + perp.y * wobble })
  }

  return { points, width, bridges: computeBridges(points, roads, width) }
}
