import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useMapStore } from '../state/mapStore.ts'
import { useClientToWorld } from './coords.ts'
import { DISTRICT_STYLES } from '../rendering/style/theme.ts'
import { MAP_FONT } from '../rendering/style/filters.tsx'
import { toPath } from '../shared/geometry.ts'

/**
 * District-layout tool overlay. Shows a draggable generator-point marker for
 * every district; dragging one relocates the district and re-tessellates the
 * city on release. Clicking empty space drops a new district there.
 */
export function DistrictLayout() {
  const clientToWorld = useClientToWorld()
  const seeds = useMapStore((s) => s.scene.seeds)
  const districts = useMapStore((s) => s.scene.districts)
  const lanes = useMapStore((s) => s.scene.lanes)
  const selection = useMapStore((s) => s.selection)
  const select = useMapStore((s) => s.select)
  const snapshot = useMapStore((s) => s.snapshot)
  const moveDistrictSeed = useMapStore((s) => s.moveDistrictSeed)
  const retessellate = useMapStore((s) => s.retessellate)

  const dragging = useRef<string | null>(null)
  const moved = useRef(false)

  // Show each marker on its district's actual centre (which, when sizes differ,
  // is the scaled position) rather than the raw seed, so handles sit on cells.
  const centreById = new Map(districts.map((d) => [d.id, d.site]))

  return (
    <g>
      {/* Lane guides (the block seams buildings pack between) — shown while
          editing districts so the layout structure is visible. */}
      {lanes.map((l, i) => (
        <path
          key={`lane-${i}`}
          d={toPath(l.points, false)}
          fill="none"
          stroke="#8a3a2a"
          strokeWidth={2}
          strokeOpacity={0.5}
          strokeDasharray="7 7"
          pointerEvents="none"
        />
      ))}

      {seeds.map((seed) => {
        const marker = centreById.get(seed.id) ?? seed.site
        const isSel = selection?.kind === 'district' && selection.id === seed.id
        const style = DISTRICT_STYLES[seed.type]
        const onDown = (e: ReactPointerEvent) => {
          if (e.button !== 0) return
          e.stopPropagation()
          ;(e.target as Element).setPointerCapture(e.pointerId)
          dragging.current = seed.id
          moved.current = false
          snapshot()
          select({ kind: 'district', id: seed.id })
        }
        const onMove = (e: ReactPointerEvent) => {
          if (dragging.current !== seed.id) return
          moved.current = true
          moveDistrictSeed(seed.id, clientToWorld(e.clientX, e.clientY))
        }
        const onUp = (e: ReactPointerEvent) => {
          if (dragging.current !== seed.id) return
          dragging.current = null
          ;(e.target as Element).releasePointerCapture(e.pointerId)
          // Rebuild the city around the new district position.
          if (moved.current) retessellate()
        }
        return (
          <g key={seed.id} style={{ cursor: 'move' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
            {/* white halo so the handle stands out over any district colour */}
            <circle cx={marker.x} cy={marker.y} r={20} fill="#fbf4e2" stroke={isSel ? '#d64545' : '#3a2c1c'} strokeWidth={isSel ? 5 : 3} />
            <circle cx={marker.x} cy={marker.y} r={13} fill={style.fill} stroke={style.stroke} strokeWidth={2} />
            <circle cx={marker.x} cy={marker.y} r={3.5} fill="#3a2c1c" />
            <text
              x={marker.x}
              y={marker.y + 30}
              textAnchor="middle"
              fontFamily={MAP_FONT}
              fontSize={20}
              fill="#3a2c1c"
              stroke="#efe2c4"
              strokeWidth={3}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {seed.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}
