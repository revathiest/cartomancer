import type { Building, BusinessType } from '../../shared/types.ts'

/**
 * Distinct fill/stroke pair per business type — the building itself is tinted
 * this colour, so its type reads at a glance without any icon or label.
 * 'generic' has no override; it keeps its district colouring.
 */
export const BUSINESS_COLOR: Record<BusinessType, { fill: string; stroke: string }> = {
  generic: { fill: '#7a6a52', stroke: '#4a3f30' },
  inn: { fill: '#3f5f8f', stroke: '#233752' },
  tavern: { fill: '#9c4530', stroke: '#5e2a1c' },
  smithy: { fill: '#54524c', stroke: '#302f2b' },
  shop: { fill: '#3c7a56', stroke: '#234a34' },
  market: { fill: '#c07f28', stroke: '#7a4f19' },
  temple: { fill: '#7d76b8', stroke: '#4a4570' },
  guild: { fill: '#7a3f9c', stroke: '#4a2560' },
  landmark: { fill: '#b8901f', stroke: '#7a5f14' },
}

export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  generic: 'Building',
  inn: 'Inn',
  tavern: 'Tavern',
  smithy: 'Smithy',
  shop: 'Shop',
  market: 'Market stall',
  temple: 'Temple',
  guild: 'Guild hall',
  landmark: 'Landmark',
}

/** Business types that get a distinct building tint. 'generic' deliberately
 *  doesn't — it's the "nothing special" case and keeps its district colour. */
export function hasBusinessColor(type: BusinessType | undefined): type is Exclude<BusinessType, 'generic'> {
  return !!type && type !== 'generic'
}

/** Fixed display order for grouping the legend by type — taverns always sort
 *  with taverns regardless of placement order, so the list reads the same way
 *  every time. */
export const BUSINESS_TYPE_ORDER: BusinessType[] = [
  'inn',
  'tavern',
  'smithy',
  'shop',
  'market',
  'temple',
  'guild',
  'landmark',
  'generic',
]

/**
 * Stable legend numbers for named buildings — grouped by type (in
 * BUSINESS_TYPE_ORDER) and alphabetical by name within a type, so numbers run
 * consecutively within each group in the legend instead of scattering across
 * an unrelated global order.
 */
export function assignLegendNumbers(buildings: Building[]): Map<string, number> {
  const named = buildings.filter(
    (b): b is Building & { name: string } => !!b.name && b.name.trim().length > 0,
  )
  named.sort((a, b) => {
    const ta = BUSINESS_TYPE_ORDER.indexOf(a.businessType ?? 'generic')
    const tb = BUSINESS_TYPE_ORDER.indexOf(b.businessType ?? 'generic')
    if (ta !== tb) return ta - tb
    return a.name.localeCompare(b.name)
  })
  const map = new Map<string, number>()
  named.forEach((b, i) => map.set(b.id, i + 1))
  return map
}
