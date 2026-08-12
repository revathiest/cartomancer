import { useMapStore } from '../../state/mapStore.ts'
import { THEME } from '../style/theme.ts'
import { toPath } from '../../shared/geometry.ts'

/** The sea/bay: a filled water polygon on one side, a shoreline, and piers. */
export function Sea() {
  const coast = useMapStore((s) => s.scene.coast)
  if (!coast || coast.water.length < 3) return null

  return (
    <g>
      <path d={toPath(coast.water, true)} fill="url(#water-grad)" />
      <path
        d={toPath(coast.shore, false)}
        fill="none"
        stroke={THEME.waterStroke}
        strokeWidth={3}
        strokeOpacity={0.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {coast.piers.map((p, i) => {
        const deg = (p.angle * 180) / Math.PI
        return (
          <g key={i} transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${deg.toFixed(2)})`}>
            <rect
              x={-2}
              y={-p.width / 2}
              width={p.length}
              height={p.width}
              fill={THEME.wall}
              stroke={THEME.wallShadow}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </g>
        )
      })}
    </g>
  )
}
