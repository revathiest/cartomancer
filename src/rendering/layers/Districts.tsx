import { useMapStore } from '../../state/mapStore.ts'
import { DISTRICT_STYLES } from '../style/theme.ts'
import { wobblePath } from '../style/wobble.ts'

/**
 * District polygons: a flat semi-transparent type colour plus a light diagonal
 * hatch, with a hand-drawn border. Kept subtle so roads/buildings stay legible.
 */
export function Districts() {
  const districts = useMapStore((s) => s.scene.districts)
  const showFills = useMapStore((s) => s.showDistrictFills)
  return (
    <g>
      {districts.map((d) => {
        if (d.polygon.length < 3) return null
        const style = DISTRICT_STYLES[d.type]
        const path = wobblePath(d.polygon, true, { amplitude: 4, step: 26 })
        if (!showFills) return null
        return (
          <g key={d.id}>
            <path d={path} fill={style.fill} fillOpacity={0.55} />
            <path d={path} fill={`url(#${style.hatch})`} />
            <path d={path} fill="none" stroke={style.stroke} strokeWidth={2.5} strokeOpacity={0.7} strokeLinejoin="round" />
          </g>
        )
      })}
    </g>
  )
}
