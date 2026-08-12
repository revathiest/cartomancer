import { useMemo } from 'react'
import { useMapStore } from '../../state/mapStore.ts'
import { THEME } from '../style/theme.ts'
import { MAP_FONT } from '../style/filters.tsx'
import {
  BUSINESS_COLOR,
  BUSINESS_TYPE_LABEL,
  BUSINESS_TYPE_ORDER,
  assignLegendNumbers,
  hasBusinessColor,
} from '../style/businessTypes.ts'
import type { Building, BusinessType } from '../../shared/types.ts'

/** Compass rose decoration (top-right). */
function CompassRose({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="none" stroke={THEME.ink} strokeWidth={2}>
      <circle r={r} fill={THEME.parchment} fillOpacity={0.6} />
      <circle r={r * 0.72} strokeWidth={1} />
      <polygon points={`0,${-r} ${r * 0.16},0 0,${r} ${-r * 0.16},0`} fill={THEME.ink} />
      <polygon points={`${-r},0 0,${-r * 0.16} ${r},0 0,${r * 0.16}`} fill={THEME.inkSoft} />
      <text x={0} y={-r - 6} textAnchor="middle" fontFamily={MAP_FONT} fontSize={22} fill={THEME.ink} stroke="none">
        N
      </text>
    </g>
  )
}

/** Simple scale bar (bottom-left). Logical units are treated as ~feet. */
function ScaleBar({ x, y, unitPx }: { x: number; y: number; unitPx: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={0} y={0} width={unitPx} height={10} fill={THEME.ink} />
      <rect x={unitPx} y={0} width={unitPx} height={10} fill={THEME.parchment} stroke={THEME.ink} strokeWidth={1.5} />
      <text x={0} y={-8} fontFamily={MAP_FONT} fontSize={20} fill={THEME.ink}>
        0
      </text>
      <text x={unitPx * 2} y={-8} textAnchor="middle" fontFamily={MAP_FONT} fontSize={20} fill={THEME.ink}>
        {Math.round(unitPx * 2)} ft
      </text>
    </g>
  )
}

type LegendRow =
  | { kind: 'type'; type: BusinessType }
  | { kind: 'other' }
  | { kind: 'named'; n: number; name: string }

/**
 * Legend for hand-placed buildings, grouped by type so scanning for "every
 * tavern" (or one specific one) doesn't mean reading the whole list: a
 * type header (colour key) for each business type present, with its named
 * buildings' numbers listed right under it. The map itself only ever tints a
 * building and numbers it — never a name, since district names already keep
 * the map busy enough.
 */
function Legend({ buildings, right, bottom }: { buildings: Building[]; right: number; bottom: number }) {
  const rows = useMemo<LegendRow[]>(() => {
    const numbers = assignLegendNumbers(buildings)
    const byType = new Map<BusinessType, Building[]>()
    for (const b of buildings) {
      const t = b.businessType ?? 'generic'
      // Every colour-coded type gets a header (even with no named buildings —
      // it's still a useful colour key); 'generic' only earns one if it has a
      // named building needing a lookup, since it has no distinct tint.
      if (!hasBusinessColor(t) && !numbers.has(b.id)) continue
      const list = byType.get(t) ?? []
      list.push(b)
      byType.set(t, list)
    }

    const out: LegendRow[] = []
    for (const type of BUSINESS_TYPE_ORDER) {
      const list = byType.get(type)
      if (!list || list.length === 0) continue
      out.push(hasBusinessColor(type) ? { kind: 'type', type } : { kind: 'other' })
      const named = list
        .filter((b) => numbers.has(b.id))
        .sort((a, b) => numbers.get(a.id)! - numbers.get(b.id)!)
      for (const b of named) out.push({ kind: 'named', n: numbers.get(b.id)!, name: b.name! })
    }
    return out
  }, [buildings])

  if (rows.length === 0) return null

  const rowH = 20
  const pad = 14
  const width = 200
  const height = pad * 2 + rows.length * rowH
  const top = bottom - height
  const left = right - width

  return (
    <g transform={`translate(${left} ${top})`} fontFamily={MAP_FONT}>
      <rect
        width={width}
        height={height}
        rx={8}
        fill={THEME.parchment}
        fillOpacity={0.9}
        stroke={THEME.ink}
        strokeWidth={1.5}
      />
      {rows.map((row, i) => {
        const cy = pad + i * rowH + rowH / 2
        if (row.kind === 'type') {
          const c = BUSINESS_COLOR[row.type]
          return (
            <g key={i}>
              <rect x={13} y={cy - 7} width={14} height={14} rx={3} fill={c.fill} stroke={c.stroke} strokeWidth={1.3} />
              <text x={36} y={cy} dominantBaseline="middle" fontSize={13} fontWeight="bold" fill={THEME.ink}>
                {BUSINESS_TYPE_LABEL[row.type]}
              </text>
            </g>
          )
        }
        if (row.kind === 'other') {
          return (
            <text key={i} x={13} y={cy} dominantBaseline="middle" fontSize={13} fontWeight="bold" fill={THEME.ink}>
              Other
            </text>
          )
        }
        return (
          <g key={i}>
            <circle cx={26} cy={cy} r={7} fill={THEME.parchment} stroke={THEME.ink} strokeWidth={1.3} />
            <text x={26} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight="bold" fill={THEME.ink}>
              {row.n}
            </text>
            <text x={42} y={cy} dominantBaseline="middle" fontSize={13} fill={THEME.ink}>
              {row.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** District names, city banner, decorative symbols, and the building legend. */
export function Labels() {
  const districts = useMapStore((s) => s.scene.districts)
  const buildings = useMapStore((s) => s.scene.buildings)
  const bounds = useMapStore((s) => s.scene.bounds)
  const cityName = useMapStore((s) => s.scene.params.cityName)

  return (
    <g>
      {districts.map((d) => (
        <text
          key={d.id}
          x={d.site.x}
          y={d.site.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily={MAP_FONT}
          fontSize={24}
          fill={THEME.label}
          stroke={THEME.parchment}
          strokeWidth={3}
          paintOrder="stroke"
          opacity={0.85}
        >
          {d.name}
        </text>
      ))}

      {/* City name banner */}
      <g>
        <text
          x={bounds.width / 2}
          y={64}
          textAnchor="middle"
          fontFamily={MAP_FONT}
          fontSize={64}
          fill={THEME.cityLabel}
          stroke={THEME.parchment}
          strokeWidth={5}
          paintOrder="stroke"
        >
          {cityName}
        </text>
      </g>

      <CompassRose x={bounds.width - 120} y={140} r={54} />
      <ScaleBar x={90} y={bounds.height - 90} unitPx={150} />
      <Legend buildings={buildings} right={bounds.width - 30} bottom={bounds.height - 30} />
    </g>
  )
}
