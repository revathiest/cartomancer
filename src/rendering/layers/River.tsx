import { useMapStore } from '../../state/mapStore.ts'
import { THEME } from '../style/theme.ts'
import { toSmoothPath } from '../../shared/geometry.ts'

/**
 * River/stream: a smooth curve through its (few) control points, drawn at the
 * configured width with a lighter current highlight, plus oriented bridge decks.
 */
export function River() {
  const river = useMapStore((s) => s.scene.river)
  if (!river || river.points.length < 2) return null

  const path = toSmoothPath(river.points, false)
  const w = river.width

  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* Soft bank + a water body in the same colour as the sea, so the river
          reads as water and merges where it meets the coast. No dashed centreline. */}
      <path d={path} fill="none" stroke={THEME.waterStroke} strokeWidth={w + 3} strokeOpacity={0.35} />
      <path d={path} fill="none" stroke="url(#water-grad)" strokeWidth={w} />
      {river.bridges.map((b, i) => {
        const deg = (b.angle * 180) / Math.PI
        const L = b.length
        const W = b.width
        const planks = Math.max(2, Math.round(L / 7))
        return (
          <g key={i} transform={`translate(${b.x.toFixed(2)} ${b.y.toFixed(2)}) rotate(${deg.toFixed(2)})`}>
            <rect x={-L / 2} y={-W / 2} width={L} height={W} rx={2} fill={THEME.parchmentDark} stroke={THEME.inkSoft} strokeWidth={2} />
            {Array.from({ length: planks - 1 }).map((_, k) => {
              const x = -L / 2 + ((k + 1) * L) / planks
              return <line key={k} x1={x} y1={-W / 2} x2={x} y2={W / 2} stroke={THEME.inkSoft} strokeWidth={1} strokeOpacity={0.45} />
            })}
          </g>
        )
      })}
    </g>
  )
}
