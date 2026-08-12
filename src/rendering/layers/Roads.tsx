import { useMapStore } from '../../state/mapStore.ts'
import { THEME } from '../style/theme.ts'
import { toSmoothPath } from '../../shared/geometry.ts'
import type { Road } from '../../shared/types.ts'

const CASING = { primary: 15, secondary: 8 }
const FILL = { primary: 10, secondary: 5 }

/**
 * Combine several road chains into ONE path string (one "M ... C ..." subpath
 * per chain). Stroking a single <path> — even one built from multiple disjoint
 * subpaths — is painted as a single shape in one compositing pass, so two
 * chains that share an endpoint (an intersection) blend into one continuous
 * stroke instead of each chain's independent, semi-transparent casing doubling
 * its opacity where their rounded ends overlap.
 */
function combinedPath(roads: Road[]): string {
  return roads
    .filter((r) => r.points.length >= 2)
    .map((r) => toSmoothPath(r.points, false))
    .join(' ')
}

/**
 * Road network, drawn in two full passes — every casing stroke, then every fill
 * stroke — rather than per-road. `derivedRoads` already merges a straight run of
 * same-kind edges through a plain 2-way node into one chain (no seam there), but
 * a real intersection — 3+ streets meeting at one node, or a plaza/gate — is
 * where several independent chains terminate at the same point. Rendering those
 * one road at a time (casing, fill, casing, fill, …) let a later road's casing
 * paint over an earlier road's fill, and let same-kind casings stack their
 * opacity at the shared point — both show up as a visible ring or seam right at
 * the junction. Painting ALL casings first, then ALL fills (secondary
 * underneath, primary on top in both passes) removes both: casings never show
 * through the fill layer, and a combined single-kind path can't double its own
 * opacity against itself.
 */
export function Roads() {
  const roads = useMapStore((s) => s.scene.roads)
  const secondary = roads.filter((r) => r.kind !== 'primary')
  const primary = roads.filter((r) => r.kind === 'primary')
  const secondaryPath = combinedPath(secondary)
  const primaryPath = combinedPath(primary)

  return (
    <g strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d={secondaryPath} stroke={THEME.roadSecondaryStroke} strokeWidth={CASING.secondary} strokeOpacity={0.5} />
      <path d={primaryPath} stroke={THEME.roadPrimaryStroke} strokeWidth={CASING.primary} strokeOpacity={0.5} />
      <path d={secondaryPath} stroke={THEME.roadSecondary} strokeWidth={FILL.secondary} />
      <path d={primaryPath} stroke={THEME.roadPrimary} strokeWidth={FILL.primary} />
    </g>
  )
}
