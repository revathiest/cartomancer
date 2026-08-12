import type { Point, Polygon, Wall } from '../shared/types.ts'
import type { Rng } from './rng.ts'

/**
 * Cast a ray from `center` in direction `angle` and return the first
 * intersection with the polygon boundary (the point on the wall at that bearing).
 */
function rayPolygonHit(center: Point, angle: number, poly: Polygon): Point {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  let best: Point | null = null
  let bestT = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const denom = dx * ey - dy * ex
    if (Math.abs(denom) < 1e-9) continue
    // Solve center + t*dir = a + u*edge
    const t = ((a.x - center.x) * ey - (a.y - center.y) * ex) / denom
    const u = ((a.x - center.x) * dy - (a.y - center.y) * dx) / denom
    if (t > 0 && u >= 0 && u <= 1 && t < bestT) {
      bestT = t
      best = { x: center.x + dx * t, y: center.y + dy * t }
    }
  }
  // Fallback: if no hit (numerical edge case), project far out.
  return best ?? { x: center.x + dx * 1000, y: center.y + dy * 1000 }
}

/**
 * Evenly-spaced (jittered) points on the wall used as ANCHORS for the radial
 * roads. The gate-kind road nodes are created at these anchors, and the wall's
 * gates are just those nodes' positions.
 */
export function wallGateAnchors(
  boundary: Polygon,
  center: Point,
  gateCount: number,
  rng: Rng,
): Point[] {
  const anchors: Point[] = []
  const startAngle = rng.range(0, Math.PI * 2)
  for (let i = 0; i < gateCount; i++) {
    const jitter = rng.range(-0.18, 0.18)
    const angle = startAngle + (i / gateCount) * Math.PI * 2 + jitter
    anchors.push(rayPolygonHit(center, angle, boundary))
  }
  return anchors
}

/**
 * Builds the wall from the inner core boundary — it encloses only the inner
 * (walled) districts; outer districts (suburbs, fields, docks…) sit outside it.
 * The polygon is copied so later wall edits don't mutate the stored core boundary.
 */
export function generateWall(coreBoundary: Polygon): Wall {
  return { polygon: coreBoundary.map((p) => ({ x: p.x, y: p.y })), gates: [] }
}
