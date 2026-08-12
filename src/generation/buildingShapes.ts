import type { BuildingShape, DistrictType, Point } from '../shared/types.ts'
import type { Rng } from './rng.ts'
import { makeRng } from './rng.ts'

/**
 * Which silhouettes each district type uses. Type-exclusive shapes (keep, temple)
 * only appear in their own district — you never see a castle keep outside a
 * castle district.
 */
const VOCAB: Record<DistrictType, { normal: [BuildingShape, number][]; landmark: BuildingShape }> = {
  residential: { normal: [['rect', 6], ['l', 3], ['t', 1]], landmark: 'courtyard' },
  slum: { normal: [['rect', 5], ['l', 4], ['t', 1]], landmark: 'l' },
  market: { normal: [['rect', 6], ['octagon', 1], ['hall', 1]], landmark: 'hall' },
  noble: { normal: [['rect', 3], ['l', 3], ['u', 2], ['courtyard', 2]], landmark: 'courtyard' },
  temple: { normal: [['rect', 3], ['round', 2], ['octagon', 2]], landmark: 'temple' },
  castle: { normal: [['rect', 3], ['tower', 2], ['l', 2]], landmark: 'keep' },
  industrial: { normal: [['rect', 6], ['l', 2], ['hall', 2]], landmark: 'hall' },
  suburb: { normal: [['rect', 6], ['l', 3], ['t', 1]], landmark: 'courtyard' },
  docks: { normal: [['rect', 5], ['hall', 3], ['l', 1]], landmark: 'hall' },
  shanty: { normal: [['rect', 6], ['l', 3]], landmark: 'l' },
  farmland: { normal: [['rect', 4], ['l', 2], ['hall', 2]], landmark: 'hall' },
  cemetery: { normal: [['rect', 3], ['octagon', 3], ['round', 2]], landmark: 'temple' },
  tannery: { normal: [['rect', 6], ['hall', 2], ['l', 2]], landmark: 'hall' },
  fairground: { normal: [['rect', 4], ['hall', 3], ['octagon', 1]], landmark: 'hall' },
  fishmarket: { normal: [['rect', 6], ['hall', 2], ['l', 1]], landmark: 'hall' },
  shipyard: { normal: [['rect', 3], ['hall', 5]], landmark: 'hall' },
  warehouse: { normal: [['rect', 7], ['hall', 1]], landmark: 'hall' },
}

export function pickShape(type: DistrictType, rng: Rng): BuildingShape {
  return rng.weighted<BuildingShape>(VOCAB[type].normal)
}

export function landmarkShape(type: DistrictType): BuildingShape {
  return VOCAB[type].landmark
}

/** Every silhouette a hand-placed landmark can take, with a human label —
 *  shared by the Place-tool shape picker and the building editor's shape
 *  field, so both offer the same choices. */
export const LANDMARK_SHAPES: { value: BuildingShape; label: string }[] = [
  { value: 'keep', label: 'Keep (towers)' },
  { value: 'temple', label: 'Temple (apse)' },
  { value: 'courtyard', label: 'Courtyard (O)' },
  { value: 'hall', label: 'Hall (pitched ends)' },
  { value: 'tower', label: 'Tower (round)' },
  { value: 'round', label: 'Round' },
  { value: 'octagon', label: 'Octagon' },
  { value: 'u', label: 'U-shaped' },
  { value: 't', label: 'T-shaped' },
  { value: 'l', label: 'L-shaped' },
  { value: 'rect', label: 'Rectangle' },
]

const rect = (w: number, h: number): Point[] => [
  { x: -w / 2, y: -h / 2 },
  { x: w / 2, y: -h / 2 },
  { x: w / 2, y: h / 2 },
  { x: -w / 2, y: h / 2 },
]

/** Rotate a point 90° * k about the origin (for placing notches on any corner). */
function rot90(p: Point, k: number): Point {
  let { x, y } = p
  for (let i = 0; i < (k & 3); i++) {
    const nx = -y
    const ny = x
    x = nx
    y = ny
  }
  return { x, y }
}

function ellipse(w: number, h: number, n: number): Point[] {
  const pts: Point[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push({ x: (Math.cos(a) * w) / 2, y: (Math.sin(a) * h) / 2 })
  }
  return pts
}

/**
 * Footprint of a building as one or more rings (local coords, centred at the
 * origin, unrotated, spanning the w×h box). Multiple rings render with an
 * even-odd fill: nested rings punch courtyards, disjoint rings add towers.
 * `seed` gives stable per-building variation.
 */
export function footprintRings(shape: BuildingShape, w: number, h: number, seed: number): Point[][] {
  const r = makeRng(seed >>> 0)
  switch (shape) {
    case 'round':
      return [ellipse(w, h, 18)]
    case 'tower': {
      const d = Math.min(w, h)
      return [ellipse(d, d, 14)]
    }
    case 'octagon': {
      const c = Math.min(w, h) * 0.29
      return [
        [
          { x: -w / 2 + c, y: -h / 2 },
          { x: w / 2 - c, y: -h / 2 },
          { x: w / 2, y: -h / 2 + c },
          { x: w / 2, y: h / 2 - c },
          { x: w / 2 - c, y: h / 2 },
          { x: -w / 2 + c, y: h / 2 },
          { x: -w / 2, y: h / 2 - c },
          { x: -w / 2, y: -h / 2 + c },
        ],
      ]
    }
    case 'l': {
      // Rectangle with one corner notched out; corner chosen by seed.
      const nw = w * r.range(0.4, 0.55)
      const nh = h * r.range(0.4, 0.55)
      const base: Point[] = [
        { x: -w / 2, y: -h / 2 },
        { x: w / 2, y: -h / 2 },
        { x: w / 2, y: h / 2 - nh },
        { x: w / 2 - nw, y: h / 2 - nh },
        { x: w / 2 - nw, y: h / 2 },
        { x: -w / 2, y: h / 2 },
      ]
      const k = r.int(0, 3)
      return [base.map((p) => rot90(p, k))]
    }
    case 't': {
      const armW = w * r.range(0.34, 0.44)
      const barH = h * r.range(0.34, 0.44)
      return [
        [
          { x: -w / 2, y: -h / 2 },
          { x: w / 2, y: -h / 2 },
          { x: w / 2, y: -h / 2 + barH },
          { x: armW / 2, y: -h / 2 + barH },
          { x: armW / 2, y: h / 2 },
          { x: -armW / 2, y: h / 2 },
          { x: -armW / 2, y: -h / 2 + barH },
          { x: -w / 2, y: -h / 2 + barH },
        ],
      ]
    }
    case 'u': {
      const notchW = w * r.range(0.3, 0.44)
      const notchH = h * r.range(0.45, 0.62)
      return [
        [
          { x: -w / 2, y: -h / 2 },
          { x: w / 2, y: -h / 2 },
          { x: w / 2, y: h / 2 },
          { x: notchW / 2, y: h / 2 },
          { x: notchW / 2, y: h / 2 - notchH },
          { x: -notchW / 2, y: h / 2 - notchH },
          { x: -notchW / 2, y: h / 2 },
          { x: -w / 2, y: h / 2 },
        ],
      ]
    }
    case 'courtyard': {
      const iw = w * 0.44
      const ih = h * 0.44
      // Outer ring + inner ring (opposite winding → even-odd hole).
      return [rect(w, h), rect(iw, ih).reverse()]
    }
    case 'hall': {
      // Long hall with pitched (pointed) short ends.
      const g = Math.min(w, h) * 0.5
      return [
        [
          { x: -w / 2, y: 0 },
          { x: -w / 2 + g, y: -h / 2 },
          { x: w / 2 - g, y: -h / 2 },
          { x: w / 2, y: 0 },
          { x: w / 2 - g, y: h / 2 },
          { x: -w / 2 + g, y: h / 2 },
        ],
      ]
    }
    case 'temple': {
      // Nave with a rounded apse on the +x end.
      const naveEnd = w * 0.2
      const ring: Point[] = [
        { x: -w / 2, y: -h / 2 },
        { x: naveEnd, y: -h / 2 },
      ]
      const steps = 8
      for (let i = 0; i <= steps; i++) {
        const a = -Math.PI / 2 + (i / steps) * Math.PI
        ring.push({ x: naveEnd + (Math.cos(a) * (w / 2 - naveEnd)), y: (Math.sin(a) * h) / 2 })
      }
      ring.push({ x: naveEnd, y: h / 2 }, { x: -w / 2, y: h / 2 })
      return [ring]
    }
    case 'keep': {
      // Main block plus four corner towers (all filled).
      const t = Math.min(w, h) * 0.26
      const mw = w - t
      const mh = h - t
      const rings: Point[][] = [rect(mw, mh)]
      const cx = mw / 2
      const cy = mh / 2
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        rings.push(rect(t, t).map((p) => ({ x: p.x + sx * cx, y: p.y + sy * cy })))
      }
      return rings
    }
    case 'rect':
    default:
      return [rect(w, h)]
  }
}

/** SVG path (even-odd) for a set of rings. */
export function ringsToPath(rings: Point[][]): string {
  let d = ''
  for (const ring of rings) {
    if (ring.length === 0) continue
    d += `M ${ring[0].x.toFixed(2)} ${ring[0].y.toFixed(2)}`
    for (let i = 1; i < ring.length; i++) d += ` L ${ring[i].x.toFixed(2)} ${ring[i].y.toFixed(2)}`
    d += ' Z '
  }
  return d
}
