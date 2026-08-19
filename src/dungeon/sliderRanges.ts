/** Min/max bounds for every dungeon slider — shared by the param panel (so
 *  sliders render with the right range) and the store's "randomize on
 *  generate" logic (so a randomized value is always a valid one). */
export const SLIDER_RANGES = {
  gridWidth: [20, 120],
  gridHeight: [20, 120],
  minRoomSize: [3, 20],
  maxRoomSize: [3, 20],
  maxDepth: [2, 8],
  corridorWidth: [1, 4],
  loopChance: [0, 0.4],
  loopMaxDetour: [1.5, 6],
  levelCount: [1, 6],
  monsterChance: [0, 1],
  lootChance: [0, 1],
} as const

export type RandomizableKey = keyof typeof SLIDER_RANGES
export const RANDOMIZABLE_KEYS = Object.keys(SLIDER_RANGES) as RandomizableKey[]
