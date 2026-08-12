import type { Point } from '../../shared/types.ts'
import { perpendicular, resample, toPath, toSmoothPath } from '../../shared/geometry.ts'
import { makeRng } from '../../generation/rng.ts'

// Position-based styling noise: deterministic by coordinate, so a given path
// always wobbles the same way regardless of the city seed or re-renders.
const styleNoise = makeRng(0xbeef).noise2D

/**
 * Resample a path and push each interior point sideways by position-based noise
 * to fake a hand-drawn line. `closed` wraps the ends for polygons.
 */
export function wobblePoints(
  points: Point[],
  closed: boolean,
  amplitude = 3,
  step = 20,
  freq = 0.02,
): Point[] {
  if (points.length < 2) return points.slice()
  const input = closed ? [...points, points[0]] : points
  const dense = resample(input, step)
  const n = dense.length
  const out: Point[] = dense.map((p, i) => {
    if (!closed && (i === 0 || i === n - 1)) return p
    const prev = dense[(i - 1 + n) % n]
    const next = dense[(i + 1) % n]
    const perp = perpendicular(prev, next)
    const amt = styleNoise(p.x * freq, p.y * freq) * amplitude
    return { x: p.x + perp.x * amt, y: p.y + perp.y * amt }
  })
  if (closed) out.pop()
  return out
}

/** Convenience: wobbled path string. */
export function wobblePath(
  points: Point[],
  closed: boolean,
  opts: { amplitude?: number; step?: number; freq?: number; smooth?: boolean } = {},
): string {
  const pts = wobblePoints(points, closed, opts.amplitude, opts.step, opts.freq)
  return opts.smooth ? toSmoothPath(pts, closed) : toPath(pts, closed)
}
