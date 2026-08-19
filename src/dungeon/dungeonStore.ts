import { create } from 'zustand'
import type { DungeonParams, DungeonScene } from './types.ts'
import { defaultDungeonParams, generateDungeon, rerollEncounters as rerollEncountersInScene } from './generateDungeon.ts'
import { RANDOMIZABLE_KEYS, SLIDER_RANGES, type RandomizableKey } from './sliderRanges.ts'

const randomInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1))
const randomFloat = (min: number, max: number) => Number((min + Math.random() * (max - min)).toFixed(2))

type FlagMap = Record<RandomizableKey, boolean>
const allFlags = (value: boolean): FlagMap =>
  Object.fromEntries(RANDOMIZABLE_KEYS.map((k) => [k, value])) as FlagMap

type DungeonStore = {
  params: DungeonParams
  scene: DungeonScene
  randomizeSeedOnGenerate: boolean
  /** Sliders excluded from "generate" randomization even if flagged. */
  paramLocks: FlagMap
  /** Sliders that get a fresh random value each time "Generate" is clicked. */
  paramRandomize: FlagMap
  setParams: (patch: Partial<DungeonParams>) => void
  randomizeSeed: () => void
  setRandomizeSeedOnGenerate: (on: boolean) => void
  toggleLock: (key: RandomizableKey) => void
  toggleRandomize: (key: RandomizableKey) => void
  regenerate: () => void
  /** The main "Generate Dungeon" action: randomizes the seed (if enabled) and
   *  any unlocked, randomize-flagged sliders, then rebuilds the scene. */
  generateNew: () => void
  /** Re-rolls every room's monster/loot note without touching the layout. */
  rerollEncounters: () => void
  showRoomNotes: boolean
  toggleShowRoomNotes: () => void
  /** Which stacked level is currently displayed — clamped back to 0 whenever
   *  a fresh scene is generated, since a previously-valid level may no
   *  longer exist if levelCount shrank. */
  currentLevel: number
  setCurrentLevel: (level: number) => void
}

const initialParams = defaultDungeonParams()

export const useDungeonStore = create<DungeonStore>((set, get) => ({
  params: initialParams,
  scene: generateDungeon(initialParams),
  randomizeSeedOnGenerate: false,
  // Locked by default — a slider only randomizes on Generate once you
  // explicitly unlock it and flag it below. Manual dragging always works
  // regardless of lock state; the lock only guards against auto-randomize.
  paramLocks: allFlags(true),
  paramRandomize: allFlags(false),
  setParams: (patch) => set((state) => ({ params: { ...state.params, ...patch } })),
  randomizeSeed: () => set((state) => ({ params: { ...state.params, seed: Math.floor(Math.random() * 1_000_000) } })),
  setRandomizeSeedOnGenerate: (on) => set({ randomizeSeedOnGenerate: on }),
  toggleLock: (key) => set((state) => ({ paramLocks: { ...state.paramLocks, [key]: !state.paramLocks[key] } })),
  toggleRandomize: (key) => set((state) => ({ paramRandomize: { ...state.paramRandomize, [key]: !state.paramRandomize[key] } })),
  regenerate: () => set({ scene: generateDungeon(get().params), currentLevel: 0 }),
  generateNew: () => {
    const { params, randomizeSeedOnGenerate, paramLocks, paramRandomize } = get()
    const patch: Partial<DungeonParams> = {}

    if (randomizeSeedOnGenerate) patch.seed = Math.floor(Math.random() * 1_000_000)
    patch.encounterSeed = Math.floor(Math.random() * 1_000_000)

    for (const key of RANDOMIZABLE_KEYS) {
      if (key === 'minRoomSize' || key === 'maxRoomSize') continue // handled together below
      if (paramRandomize[key] && !paramLocks[key]) {
        const [lo, hi] = SLIDER_RANGES[key]
        const isDecimal = key === 'loopChance' || key === 'monsterChance' || key === 'lootChance' || key === 'loopMaxDetour'
        patch[key] = isDecimal ? randomFloat(lo, hi) : randomInt(lo, hi)
      }
    }

    // Room-size bounds are coupled (min <= max) — randomize whichever side is
    // flagged and unlocked, then reconcile so the pair stays valid.
    const randMin = paramRandomize.minRoomSize && !paramLocks.minRoomSize
    const randMax = paramRandomize.maxRoomSize && !paramLocks.maxRoomSize
    if (randMin || randMax) {
      let min = randMin ? randomInt(...SLIDER_RANGES.minRoomSize) : params.minRoomSize
      let max = randMax ? randomInt(...SLIDER_RANGES.maxRoomSize) : params.maxRoomSize
      if (min > max) {
        if (randMin && randMax) [min, max] = [Math.min(min, max), Math.max(min, max)]
        else if (randMin) min = max
        else max = min
      }
      patch.minRoomSize = min
      patch.maxRoomSize = max
    }

    const nextParams = { ...params, ...patch }
    set({ params: nextParams, scene: generateDungeon(nextParams), currentLevel: 0 })
  },
  rerollEncounters: () => {
    const newSeed = Math.floor(Math.random() * 1_000_000)
    const { partyLevel, partySize, monsterChance, lootChance } = get().params
    set((state) => ({
      scene: rerollEncountersInScene(state.scene, partyLevel, partySize, monsterChance, lootChance, newSeed),
      params: { ...state.params, partyLevel, partySize, monsterChance, lootChance, encounterSeed: newSeed },
    }))
  },
  showRoomNotes: true,
  toggleShowRoomNotes: () => set((state) => ({ showRoomNotes: !state.showRoomNotes })),
  currentLevel: 0,
  setCurrentLevel: (level) => set({ currentLevel: level }),
}))
