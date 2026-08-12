import type { DistrictType } from '../../shared/types.ts'

export type DistrictStyle = {
  fill: string
  stroke: string
  /** Building fill for this district. */
  building: string
  buildingStroke: string
  /** Hatch pattern id (see filters.tsx). */
  hatch: string
}

export const DISTRICT_STYLES: Record<DistrictType, DistrictStyle> = {
  castle: { fill: '#b8a0c8', stroke: '#5c4a6e', building: '#c9b7d6', buildingStroke: '#6b5480', hatch: 'hatch-castle' },
  noble: { fill: '#d9c2a6', stroke: '#8a6d47', building: '#e6d3b3', buildingStroke: '#8a6d47', hatch: 'hatch-noble' },
  temple: { fill: '#c8d4d0', stroke: '#5f7a72', building: '#dbe4e0', buildingStroke: '#5f7a72', hatch: 'hatch-temple' },
  market: { fill: '#e3cf9e', stroke: '#a07d33', building: '#efe0b4', buildingStroke: '#a07d33', hatch: 'hatch-market' },
  residential: { fill: '#dcc9a3', stroke: '#977c4e', building: '#e9d9b8', buildingStroke: '#8a6f43', hatch: 'hatch-residential' },
  slum: { fill: '#c3b394', stroke: '#736247', building: '#cfc0a2', buildingStroke: '#6b5b40', hatch: 'hatch-slum' },
  industrial: { fill: '#c4b7a6', stroke: '#6e5f4c', building: '#b7a892', buildingStroke: '#5e5140', hatch: 'hatch-industrial' },
  suburb: { fill: '#e0d0ab', stroke: '#9a7f4f', building: '#ecdcba', buildingStroke: '#8a6f43', hatch: 'hatch-suburb' },
  docks: { fill: '#b9c4bd', stroke: '#5d7168', building: '#b0a48c', buildingStroke: '#5b4f3c', hatch: 'hatch-docks' },
  shanty: { fill: '#b7a684', stroke: '#6a5a3e', building: '#bfb08e', buildingStroke: '#5f5036', hatch: 'hatch-shanty' },
  farmland: { fill: '#c8cf9e', stroke: '#78834a', building: '#d8c9a0', buildingStroke: '#7c6a40', hatch: 'hatch-farmland' },
  cemetery: { fill: '#c2c6b8', stroke: '#6b7062', building: '#cfd0c6', buildingStroke: '#63685a', hatch: 'hatch-cemetery' },
  tannery: { fill: '#c2a98e', stroke: '#755a3f', building: '#b39476', buildingStroke: '#5f4a34', hatch: 'hatch-tannery' },
  fairground: { fill: '#e6d6a8', stroke: '#a5894f', building: '#eaddb4', buildingStroke: '#8a6f43', hatch: 'hatch-fairground' },
  fishmarket: { fill: '#bcc7b4', stroke: '#6a7a64', building: '#cdd3c2', buildingStroke: '#5f6b54', hatch: 'hatch-fishmarket' },
  shipyard: { fill: '#c7b79c', stroke: '#77603f', building: '#b9a684', buildingStroke: '#5f4d34', hatch: 'hatch-shipyard' },
  warehouse: { fill: '#c8bda6', stroke: '#71634c', building: '#c2b498', buildingStroke: '#64553e', hatch: 'hatch-warehouse' },
}

export const THEME = {
  parchment: '#efe2c4',
  parchmentDark: '#d9c49a',
  ink: '#3a2c1c',
  inkSoft: '#5c4527',
  roadPrimary: '#e9d9b0',
  roadPrimaryStroke: '#9a7d47',
  roadSecondary: '#e4d3a6',
  roadSecondaryStroke: '#a58a55',
  wall: '#8c7355',
  wallShadow: '#5f4c33',
  water: '#7fa9b8',
  waterDeep: '#5b8697',
  waterStroke: '#4a7280',
  label: '#3a2c1c',
  cityLabel: '#2a1e10',
  selection: '#d64545',
} as const

export const DISTRICT_LABELS: Record<DistrictType, string> = {
  castle: 'Castle',
  noble: 'Noble',
  temple: 'Temple',
  market: 'Market',
  residential: 'Residential',
  slum: 'Slum',
  industrial: 'Industrial',
  suburb: 'Suburb',
  docks: 'Docks',
  shanty: 'Shantytown',
  farmland: 'Farmland',
  cemetery: 'Cemetery',
  tannery: 'Tanneries',
  fairground: 'Fairground',
  fishmarket: 'Fishmarket',
  shipyard: 'Shipyard',
  warehouse: 'Warehouses',
}
