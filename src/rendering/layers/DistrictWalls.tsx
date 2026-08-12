import { useMapStore } from '../../state/mapStore.ts'
import { THEME } from '../style/theme.ts'
import { wobblePoints } from '../style/wobble.ts'
import { segmentIntersection, toPath } from '../../shared/geometry.ts'
import type { District, Road } from '../../shared/types.ts'

const STONE = '#8a7f6f'
const STONE_SHADOW = '#5b5247'

/** Points where any road crosses a district's polygon boundary (its gates). */
function districtGates(poly: District['polygon'], roads: Road[]) {
  const hits: { x: number; y: number }[] = []
  for (const road of roads) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i]
      const b = road.points[i + 1]
      for (let j = 0; j < poly.length; j++) {
        const hit = segmentIntersection(a, b, poly[j], poly[(j + 1) % poly.length])
        if (hit && !hits.some((h) => Math.hypot(h.x - hit.x, h.y - hit.y) < 30)) hits.push(hit)
      }
    }
  }
  return hits
}

function DistrictWall({ d, roads }: { d: District; roads: Road[] }) {
  const pts = wobblePoints(d.polygon, true, 2.5, 24)
  const path = toPath(pts, true)
  const gates = districtGates(d.polygon, roads)
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d={path} fill="none" stroke={STONE_SHADOW} strokeWidth={9} />
      <path d={path} fill="none" stroke={STONE} strokeWidth={5} />
      {gates.map((g, i) => (
        <g key={i}>
          <circle cx={g.x} cy={g.y} r={8} fill={THEME.parchment} stroke={STONE_SHADOW} strokeWidth={2.5} />
          <circle cx={g.x} cy={g.y} r={3} fill={STONE_SHADOW} />
        </g>
      ))}
    </g>
  )
}

/** Inner walls around districts flagged as walled. */
export function DistrictWalls() {
  const districts = useMapStore((s) => s.scene.districts)
  const roads = useMapStore((s) => s.scene.roads)
  const walled = districts.filter((d) => d.walled && d.polygon.length >= 3)
  if (walled.length === 0) return null
  return (
    <g>
      {walled.map((d) => (
        <DistrictWall key={d.id} d={d} roads={roads} />
      ))}
    </g>
  )
}
