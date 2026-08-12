import { useMapStore } from '../state/mapStore.ts'
import { assignLegendNumbers } from '../rendering/style/businessTypes.ts'
import { LANDMARK_SHAPES } from '../generation/buildingShapes.ts'
import type { BuildingShape, BusinessType } from '../shared/types.ts'

// 'landmark' is deliberately absent — that's chosen up front from the Place
// toolbar's Lane-locked/Landmark toggle, never reassigned after the fact here.
const BUSINESS_TYPES: BusinessType[] = ['generic', 'inn', 'tavern', 'smithy', 'shop', 'market', 'temple', 'guild']

function BuildingEditor({ id }: { id: string }) {
  const building = useMapStore((s) => s.scene.buildings.find((b) => b.id === id))
  const buildings = useMapStore((s) => s.scene.buildings)
  const updateBuilding = useMapStore((s) => s.updateBuilding)
  const deleteBuilding = useMapStore((s) => s.deleteBuilding)
  const snapshot = useMapStore((s) => s.snapshot)
  const mergeFrom = useMapStore((s) => s.mergeFrom)
  const startMerge = useMapStore((s) => s.startMerge)
  const cancelMerge = useMapStore((s) => s.cancelMerge)

  if (!building) return <p className="hint">Building not found.</p>

  const legendNumber = assignLegendNumbers(buildings).get(id)

  return (
    <>
      <h2 className="panel-h">Building</h2>

      <label className="field">
        <span>Name</span>
        <input
          className="input"
          placeholder="(unnamed)"
          value={building.name ?? ''}
          onFocus={snapshot}
          onChange={(e) => updateBuilding(id, { name: e.target.value || undefined })}
        />
      </label>
      {legendNumber !== undefined && (
        <p className="hint">
          Shown on the map as badge <b>#{legendNumber}</b> — see the legend, bottom-right.
        </p>
      )}

      <label className="field">
        <span>Type</span>
        <select
          className="input"
          // A hand-placed landmark's businessType is literally 'landmark',
          // which no longer has a matching option below — shown as 'generic'
          // until the user actively relabels it as something else.
          value={building.businessType === 'landmark' ? 'generic' : building.businessType ?? 'generic'}
          onChange={(e) => {
            snapshot()
            // Picking any type here always means "this is no longer the
            // district's landmark" — the Shape field (and the
            // district-reflow-on-move behavior it drives) goes with it.
            updateBuilding(id, { businessType: e.target.value as BusinessType, isLandmark: false })
          }}
        >
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      {(building.isLandmark || building.businessType === 'landmark') && (
        <label className="field">
          <span>Shape</span>
          <select
            className="input"
            value={building.shape ?? 'rect'}
            onChange={(e) => {
              snapshot()
              updateBuilding(id, { shape: e.target.value as BuildingShape, footprint: undefined })
            }}
          >
            {LANDMARK_SHAPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {building.laneSnapped ? (
        <>
          <p className="hint">
            Fitted to its lot in the block — position, size, and rotation are
            locked so it keeps matching the lane it was placed against. Delete it
            and place a new one if you want it somewhere else.
          </p>
          {mergeFrom === id ? (
            <>
              <p className="hint">
                Click an <b>adjacent</b> lane-locked building on the map to
                merge with — click this one again, or press Esc, to cancel.
              </p>
              <button className="btn full" onClick={cancelMerge}>
                Cancel merge
              </button>
            </>
          ) : (
            <button className="btn full" onClick={() => startMerge(id)} disabled={mergeFrom !== null}>
              🔗 Merge with adjacent building
            </button>
          )}
        </>
      ) : (
        <>
          <label className="field">
            <span>Width: {Math.round(building.w)}</span>
            <input
              type="range"
              min={16}
              max={200}
              value={building.w}
              onPointerDown={snapshot}
              onChange={(e) => updateBuilding(id, { w: Number(e.target.value) })}
            />
          </label>

          <label className="field">
            <span>Height: {Math.round(building.h)}</span>
            <input
              type="range"
              min={16}
              max={200}
              value={building.h}
              onPointerDown={snapshot}
              onChange={(e) => updateBuilding(id, { h: Number(e.target.value) })}
            />
          </label>

          <label className="field">
            <span>Rotation: {Math.round((building.rotation * 180) / Math.PI)}°</span>
            <input
              type="range"
              min={-180}
              max={180}
              value={Math.round((building.rotation * 180) / Math.PI)}
              onPointerDown={snapshot}
              onChange={(e) => updateBuilding(id, { rotation: (Number(e.target.value) * Math.PI) / 180 })}
            />
          </label>
        </>
      )}

      <button className="btn danger full" onClick={() => deleteBuilding(id)}>
        🗑 Delete building
      </button>
    </>
  )
}

function RoadEditor({ id }: { id: string }) {
  const road = useMapStore((s) => s.scene.roads.find((r) => r.id === id))
  const deleteSelected = useMapStore((s) => s.deleteSelected)
  if (!road) return <p className="hint">Road not found.</p>
  return (
    <>
      <h2 className="panel-h">Street</h2>
      <p className="field-static">Kind: {road.kind}</p>
      <p className="hint">
        To reshape roads, use the <b>Roads</b> tool — drag the intersection nodes,
        or add and connect new ones. Delete removes just this street.
      </p>
      <button className="btn danger full" onClick={deleteSelected}>
        🗑 Delete street
      </button>
    </>
  )
}

const FILTERS: { key: 'all' | 'building' | 'river'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'building', label: 'Buildings' },
  { key: 'river', label: 'River' },
]

export function SelectionPanel() {
  const selection = useMapStore((s) => s.selection)
  const filter = useMapStore((s) => s.selectFilter)
  const setSelectFilter = useMapStore((s) => s.setSelectFilter)

  return (
    <div className="panel">
      <label className="field">
        <span>Select only</span>
        <div className="seg wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? 'seg-btn active' : 'seg-btn'}
              onClick={() => setSelectFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </label>

      {!selection && <p className="hint">Nothing selected. Click something on the map to edit it. Use “Select only” above if overlapping items make it hard to grab the right one.</p>}
      {selection?.kind === 'building' && <BuildingEditor id={selection.id} />}
      {selection?.kind === 'road' && <RoadEditor id={selection.id} />}
      {selection?.kind === 'river' && (
        <>
          <h2 className="panel-h">River</h2>
          <p className="hint">
            Drag a handle to reroute the river. Click a square mid-marker to add a
            bend; right-click a handle to remove it. Bridges update automatically.
          </p>
        </>
      )}
    </div>
  )
}
