import { useMapStore } from '../state/mapStore.ts'
import { PopulationPanel } from './PopulationPanel.tsx'

export function ParamPanel() {
  const params = useMapStore((s) => s.params)
  const setParams = useMapStore((s) => s.setParams)
  const randomizeSeed = useMapStore((s) => s.randomizeSeed)
  const regenerate = useMapStore((s) => s.regenerate)
  const toggleWall = useMapStore((s) => s.toggleWall)
  const toggleRiver = useMapStore((s) => s.toggleRiver)
  const setRiverWidth = useMapStore((s) => s.setRiverWidth)
  const setLayoutAll = useMapStore((s) => s.setLayoutAll)
  const setBuildingDensity = useMapStore((s) => s.setBuildingDensity)
  const snapshot = useMapStore((s) => s.snapshot)
  const hasManualEdits = useMapStore((s) => s.hasManualEdits)
  const randomizeSeedOnGenerate = useMapStore((s) => s.randomizeSeedOnGenerate)
  const setRandomizeSeedOnGenerate = useMapStore((s) => s.setRandomizeSeedOnGenerate)

  const handleGenerate = () => {
    if (hasManualEdits) {
      const ok = confirm('Regenerating will discard your manual edits. Continue?')
      if (!ok) return
    }
    if (randomizeSeedOnGenerate) randomizeSeed()
    regenerate()
  }

  return (
    <div className="panel">
      <h2 className="panel-h">Generation</h2>

      <label className="field">
        <span>City name</span>
        <input
          className="input"
          value={params.cityName}
          onChange={(e) => setParams({ cityName: e.target.value })}
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

      <button className="btn accent full" onClick={handleGenerate}>
        ⟳ Generate City
      </button>

      {hasManualEdits && <p className="hint warn">You have manual edits. Generating discards them.</p>}

      <label className="field">
        <span>Districts: {params.districtCount}</span>
        <input
          type="range"
          min={5}
          max={28}
          value={params.districtCount}
          onChange={(e) => setParams({ districtCount: Number(e.target.value) })}
        />
      </label>

      <h2 className="panel-h">Building layout (all districts)</h2>
      <p className="hint">Sets every district at once. Override individual districts in Edit → Districts.</p>

      <label className="field">
        <span>Lane spacing: {params.blockSize.toFixed(1)}×</span>
        <input
          type="range"
          min={1.5}
          max={4.5}
          step={0.1}
          value={params.blockSize}
          onPointerDown={snapshot}
          onChange={(e) => setLayoutAll({ blockSize: Number(e.target.value) })}
        />
      </label>

      <label className="field">
        <span>Lane width: {Math.round(params.laneWidth)}</span>
        <input
          type="range"
          min={2}
          max={22}
          step={1}
          value={params.laneWidth}
          onPointerDown={snapshot}
          onChange={(e) => setLayoutAll({ laneWidth: Number(e.target.value) })}
        />
      </label>

      <label className="field">
        <span>Building spacing: {params.buildingGap.toFixed(1)}</span>
        <input
          type="range"
          min={0}
          max={8}
          step={0.5}
          value={params.buildingGap}
          onPointerDown={snapshot}
          onChange={(e) => setLayoutAll({ buildingGap: Number(e.target.value) })}
        />
      </label>

      <label className="field">
        <span>Building density: {params.buildingDensity.toFixed(2)}×</span>
        <input
          type="range"
          min={0.5}
          max={1.8}
          step={0.05}
          value={params.buildingDensity}
          onPointerDown={snapshot}
          onChange={(e) => setBuildingDensity(Number(e.target.value))}
        />
      </label>

      <label className="check">
        <input type="checkbox" checked={params.hasWall} onChange={(e) => toggleWall(e.target.checked)} />
        <span>City wall</span>
      </label>

      <label className="check">
        <input type="checkbox" checked={params.hasRiver} onChange={(e) => toggleRiver(e.target.checked)} />
        <span>River / stream</span>
      </label>

      {params.hasRiver && (
        <label className="field">
          <span>River width: {Math.round(params.riverWidth)}</span>
          <input
            type="range"
            min={8}
            max={80}
            step={2}
            value={params.riverWidth}
            onPointerDown={snapshot}
            onChange={(e) => setRiverWidth(Number(e.target.value))}
          />
        </label>
      )}

      <label className="check">
        <input type="checkbox" checked={params.hasCoast} onChange={(e) => setParams({ hasCoast: e.target.checked })} />
        <span>Coast (open water)</span>
      </label>

      {params.hasCoast && (
        <>
          <label className="field">
            <span>Water</span>
            <div className="seg wrap">
              {(['sea', 'bay'] as const).map((k) => (
                <button
                  key={k}
                  className={params.coastKind === k ? 'seg-btn active' : 'seg-btn'}
                  onClick={() => setParams({ coastKind: k })}
                >
                  {k === 'sea' ? 'Open sea' : 'Bay'}
                </button>
              ))}
            </div>
          </label>
          <label className="field">
            <span>Side</span>
            <div className="seg wrap">
              {(['N', 'E', 'S', 'W'] as const).map((s) => (
                <button
                  key={s}
                  className={params.coastSide === s ? 'seg-btn active' : 'seg-btn'}
                  onClick={() => setParams({ coastSide: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          </label>
          <p className="hint">Coast changes apply on Regenerate.</p>
        </>
      )}

      <p className="hint">
        Switch to <b>Edit</b> mode to drag roads, districts, the wall and river, and to place named buildings.
      </p>

      <PopulationPanel />
    </div>
  )
}
