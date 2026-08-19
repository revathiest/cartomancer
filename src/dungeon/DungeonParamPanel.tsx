import { useDungeonStore } from './dungeonStore.ts'
import { SLIDER_RANGES, type RandomizableKey } from './sliderRanges.ts'

type SliderSpec = {
  key: RandomizableKey
  label: string
  step?: number
  format?: (v: number) => string
}

const SLIDERS: SliderSpec[] = [
  { key: 'gridWidth', label: 'Width' },
  { key: 'gridHeight', label: 'Height' },
  { key: 'minRoomSize', label: 'Min room size' },
  { key: 'maxRoomSize', label: 'Max room size' },
  { key: 'maxDepth', label: 'Layout depth' },
  { key: 'corridorWidth', label: 'Corridor width' },
  { key: 'loopChance', label: 'Loop chance', step: 0.01, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'loopMaxDetour', label: 'Loop max detour', step: 0.5, format: (v) => `${v.toFixed(1)}×` },
  { key: 'levelCount', label: 'Levels' },
]

const PERCENT_FORMAT = (v: number) => `${Math.round(v * 100)}%`

function LockRandomizeSlider({ spec }: { spec: SliderSpec }) {
  const { key, label, step, format } = spec
  const params = useDungeonStore((s) => s.params)
  const setParams = useDungeonStore((s) => s.setParams)
  const paramLocks = useDungeonStore((s) => s.paramLocks)
  const paramRandomize = useDungeonStore((s) => s.paramRandomize)
  const toggleLock = useDungeonStore((s) => s.toggleLock)
  const toggleRandomize = useDungeonStore((s) => s.toggleRandomize)

  const [min, max] = SLIDER_RANGES[key]
  const value = params[key]
  const locked = paramLocks[key]

  return (
    <label className="field">
      <div className="field-head">
        <span>
          {label} ({format ? format(value) : value})
        </span>
        <span className="field-head-controls">
          <label className="mini-check" title="Keep this value when generating">
            <input type="checkbox" checked={locked} onChange={() => toggleLock(key)} />
            🔒
          </label>
          <label className="mini-check" title="Randomize this value on generate">
            <input type="checkbox" checked={paramRandomize[key]} disabled={locked} onChange={() => toggleRandomize(key)} />
            🎲
          </label>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => setParams({ [key]: Number(e.target.value) })}
      />
    </label>
  )
}

export function DungeonParamPanel() {
  const params = useDungeonStore((s) => s.params)
  const setParams = useDungeonStore((s) => s.setParams)
  const randomizeSeed = useDungeonStore((s) => s.randomizeSeed)
  const randomizeSeedOnGenerate = useDungeonStore((s) => s.randomizeSeedOnGenerate)
  const setRandomizeSeedOnGenerate = useDungeonStore((s) => s.setRandomizeSeedOnGenerate)
  const generateNew = useDungeonStore((s) => s.generateNew)
  const rerollEncounters = useDungeonStore((s) => s.rerollEncounters)
  const showRoomNotes = useDungeonStore((s) => s.showRoomNotes)
  const toggleShowRoomNotes = useDungeonStore((s) => s.toggleShowRoomNotes)

  return (
    <div className="panel">
      <h2 className="panel-h">Party</h2>
      <p className="hint">Who this dungeon is built for — sets the monster CR and headcount in each room's note.</p>

      <label className="field">
        <span>Party level ({params.partyLevel})</span>
        <input
          type="range"
          min={1}
          max={20}
          value={params.partyLevel}
          onChange={(e) => setParams({ partyLevel: Number(e.target.value) })}
        />
      </label>

      <label className="field">
        <span>Party size ({params.partySize})</span>
        <input
          type="range"
          min={1}
          max={8}
          value={params.partySize}
          onChange={(e) => setParams({ partySize: Number(e.target.value) })}
        />
      </label>

      <LockRandomizeSlider spec={{ key: 'monsterChance', label: 'Chance of monsters in a room', step: 0.01, format: PERCENT_FORMAT }} />
      <LockRandomizeSlider spec={{ key: 'lootChance', label: 'Chance of a loot hoard', step: 0.01, format: PERCENT_FORMAT }} />
      <p className="hint">A hoard is much more likely in a room that already has monsters guarding it than sitting out alone.</p>

      <button className="btn full" onClick={rerollEncounters} title="Keep the current layout, roll new monster/loot notes">
        🎲 Reroll Encounters
      </button>

      <label className="check">
        <input type="checkbox" checked={showRoomNotes} onChange={toggleShowRoomNotes} />
        <span>Show encounter notes on map</span>
      </label>

      <h2 className="panel-h">Generation</h2>

      <label className="field">
        <span>Dungeon name</span>
        <input
          className="input"
          value={params.dungeonName}
          onChange={(e) => setParams({ dungeonName: e.target.value })}
        />
      </label>

      <label className="field">
        <span>Seed</span>
        <div className="row">
          <input
            className="input"
            type="number"
            value={params.seed}
            disabled={randomizeSeedOnGenerate}
            onChange={(e) => setParams({ seed: Number(e.target.value) || 0 })}
          />
          <button className="btn" onClick={randomizeSeed} disabled={randomizeSeedOnGenerate} title="Random seed">
            🎲
          </button>
        </div>
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={randomizeSeedOnGenerate}
          onChange={(e) => setRandomizeSeedOnGenerate(e.target.checked)}
        />
        <span>Randomize seed on generate</span>
      </label>

      {SLIDERS.map((spec) => (
        <LockRandomizeSlider key={spec.key} spec={spec} />
      ))}
      <p className="hint">
        A loop connection is discarded if its actual routed path is more than "loop max detour" times the
        straight-line distance between the two rooms — so an occasional shortcut never winds halfway around
        the map to avoid other corridors instead.
      </p>
      <p className="hint">
        Each level is its own independent layout over the same footprint, joined to the next by a stairway.
        The entrance is always on level 1; the boss room is always on the deepest level. Use the level switcher
        in the toolbar to move between floors.
      </p>

      <button className="btn accent full" onClick={generateNew}>
        🎲 Generate Dungeon
      </button>

      <p className="hint">
        Rooms are carved with a binary-space-partition layout: the footprint keeps splitting into smaller
        rectangles until a room fits, then corridors are pathed room-to-room so they never cut through
        another room's floor. Lock a slider to protect it, or flag it to randomize on every generate.
      </p>
    </div>
  )
}
