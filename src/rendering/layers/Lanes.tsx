import { useMapStore } from '../../state/mapStore.ts'
import { toSmoothPath } from '../../shared/geometry.ts'

/**
 * Interior footpaths/alleys within districts (the seams between building blocks).
 * Drawn under the buildings as soft dirt paths so blocks read as fronting lanes
 * rather than floating in empty space. Wider for the more major seams.
 */
export function Lanes() {
  const lanes = useMapStore((s) => s.scene.lanes)
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {lanes.map((l, i) => {
        if (l.points.length < 2) return null
        const width = Math.max(2.5, 6 - l.depth * 0.9)
        return (
          <g key={i}>
            <path d={toSmoothPath(l.points, false)} fill="none" stroke="#b59d72" strokeWidth={width + 2} strokeOpacity={0.35} />
            <path d={toSmoothPath(l.points, false)} fill="none" stroke="#d8c6a0" strokeWidth={width} strokeOpacity={0.8} />
          </g>
        )
      })}
    </g>
  )
}
