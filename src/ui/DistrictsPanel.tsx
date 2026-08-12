import { useMapStore } from '../state/mapStore.ts'
import { DISTRICT_TYPES } from '../shared/types.ts'
import type { District, DistrictType } from '../shared/types.ts'

/** A per-district slider. `onCommit` runs on release (rebuild); snapshot on grab. */
function DistrictSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  onCommit: () => void
}) {
  const snapshot = useMapStore((s) => s.snapshot)
  return (
    <label className="field">
      <span>
        {label}: {step < 1 ? value.toFixed(1) : Math.round(value)}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={snapshot}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
    </label>
  )
}

function DistrictDetail({ district }: { district: District }) {
  const updateDistrict = useMapStore((s) => s.updateDistrict)
  const removeDistrict = useMapStore((s) => s.removeDistrict)
  const regenerateDistrictBuildings = useMapStore((s) => s.regenerateDistrictBuildings)
  const retessellate = useMapStore((s) => s.retessellate)
  const reflowBuildings = useMapStore((s) => s.reflowBuildings)
  const snapshot = useMapStore((s) => s.snapshot)
  const seedCount = useMapStore((s) => s.scene.seeds.length)

  const id = district.id
  const reroll = () => regenerateDistrictBuildings(id)

  return (
    <div className="dist-detail">
      <div className="row">
        <input
          className="input"
          value={district.name}
          onFocus={snapshot}
          onChange={(e) => updateDistrict(id, { name: e.target.value })}
        />
        <button
          className="icon-btn"
          title="Delete district"
          disabled={seedCount <= 3}
          onClick={() => removeDistrict(id)}
        >
          🗑
        </button>
      </div>

      <label className="field">
        <span>Type</span>
        <select
          className="input"
          value={district.type}
          onChange={(e) => {
            snapshot()
            updateDistrict(id, { type: e.target.value as DistrictType })
            reroll()
          }}
        >
          {DISTRICT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <DistrictSlider label="Size (area)" value={district.size ?? 1} min={0.4} max={3} step={0.1}
        onChange={(v) => updateDistrict(id, { size: v })} onCommit={retessellate} />
      <DistrictSlider label="Density" value={district.density ?? 1} min={0.2} max={4} step={0.1}
        onChange={(v) => updateDistrict(id, { density: v })} onCommit={reroll} />
      <DistrictSlider label="Building size" value={district.buildingSize ?? 1} min={0.5} max={2} step={0.1}
        onChange={(v) => updateDistrict(id, { buildingSize: v })} onCommit={reroll} />
      <DistrictSlider label="Lane spacing" value={district.blockSize ?? 2.6} min={1.5} max={4.5} step={0.1}
        onChange={(v) => updateDistrict(id, { blockSize: v })} onCommit={reroll} />
      <DistrictSlider label="Lane width" value={district.laneWidth ?? 10} min={2} max={22} step={1}
        onChange={(v) => updateDistrict(id, { laneWidth: v })} onCommit={reroll} />
      <DistrictSlider label="Building spacing" value={district.buildingGap ?? 1.5} min={0} max={8} step={0.5}
        onChange={(v) => updateDistrict(id, { buildingGap: v })} onCommit={reroll} />

      <label className="check">
        <input
          type="checkbox"
          checked={district.walled ?? false}
          onChange={(e) => {
            snapshot()
            updateDistrict(id, { walled: e.target.checked })
            reflowBuildings()
          }}
        />
        <span>Walled</span>
      </label>
    </div>
  )
}

export function DistrictsPanel() {
  const districts = useMapStore((s) => s.scene.districts)
  const seedCount = useMapStore((s) => s.scene.seeds.length)
  const bounds = useMapStore((s) => s.scene.bounds)
  const selection = useMapStore((s) => s.selection)
  const addDistrictSeed = useMapStore((s) => s.addDistrictSeed)

  const handleAdd = () => {
    const jitter = () => (Math.random() - 0.5) * bounds.width * 0.25
    addDistrictSeed({ x: bounds.width / 2 + jitter(), y: bounds.height / 2 + jitter() })
  }

  const selected =
    selection?.kind === 'district' ? districts.find((d) => d.id === selection.id) : undefined

  return (
    <div className="panel">
      <h2 className="panel-h">Districts ({seedCount})</h2>
      <p className="hint">Click a district marker on the map to select it, then edit it below.</p>
      <button className="btn accent full" onClick={handleAdd}>
        ＋ Add district
      </button>

      {selected ? (
        <DistrictDetail district={selected} />
      ) : (
        <p className="hint">No district selected. Click one on the map (or Add a new one and drag its marker).</p>
      )}
    </div>
  )
}
