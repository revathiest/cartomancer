import { useMapStore } from '../../state/mapStore.ts'
import { THEME } from '../style/theme.ts'
import { wobblePoints } from '../style/wobble.ts'
import { centroid, closestPointOnSegment, dist, toPath } from '../../shared/geometry.ts'
import type { Point, Polyline } from '../../shared/types.ts'

/** Distance from p to the nearest point on an (open) polyline. */
function distToPolyline(p: Point, line: Polyline): number {
  let best = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    const c = closestPointOnSegment(p, line[i], line[i + 1])
    best = Math.min(best, dist(p, c))
  }
  return best
}

/**
 * City wall: a thick double-stroke path with outward crenellation ticks and gate
 * icons. On a coast the wall is OPEN along the shore — the sea is the defence —
 * so edges running along the coastline are dropped, leaving land-facing runs.
 */
export function Wall() {
  const wall = useMapStore((s) => s.scene.wall)
  const coast = useMapStore((s) => s.scene.coast)
  if (!wall || wall.polygon.length < 3) return null

  const poly = wall.polygon
  const n = poly.length
  const c = centroid(poly)

  // Mark wall edges that run along the shore (to be left open).
  const isSeaEdge = (a: Point, b: Point): boolean => {
    if (!coast) return false
    return distToPolyline({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, coast.shore) < 28
  }
  const seaEdge: boolean[] = []
  for (let i = 0; i < n; i++) seaEdge[i] = isSeaEdge(poly[i], poly[(i + 1) % n])
  const anySea = seaEdge.some(Boolean)

  // Split the ring into runs of consecutive LAND edges (open polylines). With no
  // sea edges it stays a single closed loop.
  const runs: { pts: Point[]; closed: boolean }[] = []
  if (!anySea) {
    runs.push({ pts: poly.slice(), closed: true })
  } else {
    let start = 0
    for (let i = 0; i < n; i++) {
      if (seaEdge[(i - 1 + n) % n] && !seaEdge[i]) {
        start = i
        break
      }
    }
    let cur: Point[] = []
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n
      if (!seaEdge[i]) {
        if (cur.length === 0) cur.push(poly[i])
        cur.push(poly[(i + 1) % n])
      } else if (cur.length >= 2) {
        runs.push({ pts: cur, closed: false })
        cur = []
      }
    }
    if (cur.length >= 2) runs.push({ pts: cur, closed: false })
  }

  const paths = runs.map((r) => {
    const pts = wobblePoints(r.pts, r.closed, 3, 30)
    return { d: toPath(pts, r.closed), pts }
  })

  // Outward crenellation ticks along the drawn runs.
  const ticks: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (const p of paths) {
    for (let i = 0; i < p.pts.length; i += 2) {
      const pt = p.pts[i]
      const dx = pt.x - c.x
      const dy = pt.y - c.y
      const len = Math.hypot(dx, dy) || 1
      ticks.push({ x1: pt.x, y1: pt.y, x2: pt.x + (dx / len) * 9, y2: pt.y + (dy / len) * 9 })
    }
  }

  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {paths.map((p, i) => (
        <path key={`s${i}`} d={p.d} fill="none" stroke={THEME.wallShadow} strokeWidth={14} />
      ))}
      {paths.map((p, i) => (
        <path key={`w${i}`} d={p.d} fill="none" stroke={THEME.wall} strokeWidth={8} />
      ))}
      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={THEME.wallShadow} strokeWidth={4} />
      ))}
      {wall.gates.map((g) => (
        <g key={g.id}>
          <circle cx={g.point.x} cy={g.point.y} r={11} fill={THEME.parchment} stroke={THEME.wallShadow} strokeWidth={3} />
          <circle cx={g.point.x} cy={g.point.y} r={4} fill={THEME.wallShadow} />
        </g>
      ))}
    </g>
  )
}
