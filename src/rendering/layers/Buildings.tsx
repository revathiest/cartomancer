import { useMemo } from 'react'
import { useMapStore } from '../../state/mapStore.ts'
import { DISTRICT_STYLES, THEME } from '../style/theme.ts'
import { footprintRings, ringsToPath } from '../../generation/buildingShapes.ts'
import { BUSINESS_COLOR, assignLegendNumbers, hasBusinessColor } from '../style/businessTypes.ts'
import type { Building, DistrictType } from '../../shared/types.ts'

const NEUTRAL = { building: '#e2d2b0', buildingStroke: '#7a6444' }

// A hand-placed building with a business type is tinted that type's colour
// (BUSINESS_COLOR) — that alone is enough to tell it apart from the rest of
// the block. A plain 'generic' hand-placed building is deliberately NOT
// singled out: the whole point of conforming it to a real lot is that it
// reads as an ordinary part of the district, so it takes the same district
// colour as every procedural building around it.
function buildingStyle(b: Building, typeById: Map<string, DistrictType>) {
  if (hasBusinessColor(b.businessType)) {
    const c = BUSINESS_COLOR[b.businessType]
    return { building: c.fill, buildingStroke: c.stroke }
  }
  const t = b.districtId ? typeById.get(b.districtId) : undefined
  return t ? DISTRICT_STYLES[t] : NEUTRAL
}

/** Stable per-building seed for deterministic footprint variation. */
function seedOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * A small number badge for named buildings — the map-legible stand-in for a
 * name label. Centred on the building and drawn un-rotated, so it always
 * reads upright regardless of the building's own rotation.
 */
function LegendBadge({ n }: { n: number }) {
  return (
    <>
      <circle r={7} fill={THEME.parchment} stroke={THEME.ink} strokeWidth={1.3} />
      <text textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight="bold" fill={THEME.ink}>
        {n}
      </text>
    </>
  )
}

/**
 * Buildings drawn as type-driven footprint silhouettes. A hand-placed
 * building with a business type is tinted that type's colour instead of its
 * district's (never a name — with district names already busy on the map,
 * plastering a name over every building too was too much); a named building
 * additionally gets a small centred number badge. The Legend layer (see
 * Labels.tsx) spells out what each colour and number means.
 */
export function Buildings() {
  const buildings = useMapStore((s) => s.scene.buildings)
  const districts = useMapStore((s) => s.scene.districts)
  const typeById = new Map(districts.map((d) => [d.id, d.type]))
  const legendNumbers = useMemo(() => assignLegendNumbers(buildings), [buildings])

  return (
    <g strokeLinejoin="round">
      {buildings.map((b) => {
        const style = buildingStyle(b, typeById)
        const deg = (b.rotation * 180) / Math.PI
        const rings =
          b.footprint && b.footprint.length >= 3
            ? [b.footprint]
            : footprintRings(b.shape ?? 'rect', b.w, b.h, seedOf(b.id))
        const d = ringsToPath(rings)
        const legendNumber = legendNumbers.get(b.id)
        return (
          <g key={b.id}>
            <g transform={`translate(${b.x.toFixed(2)} ${b.y.toFixed(2)}) rotate(${deg.toFixed(2)})`}>
              <path
                d={d}
                fillRule="evenodd"
                fill={style.building}
                stroke={style.buildingStroke}
                strokeWidth={b.isLandmark || b.businessType === 'landmark' ? 2.4 : 1.5}
              />
            </g>
            {/* The badge is un-rotated — a building's own rotation shouldn't
                tip its number over. */}
            {legendNumber !== undefined && (
              <g transform={`translate(${b.x.toFixed(2)} ${b.y.toFixed(2)})`}>
                <LegendBadge n={legendNumber} />
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}
