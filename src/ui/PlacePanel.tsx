import { useMapStore } from '../state/mapStore.ts'
import type { BuildingShape, BusinessType } from '../shared/types.ts'
import { LANDMARK_SHAPES } from '../generation/buildingShapes.ts'

/** Business types offered for either kind of placement. 'generic' only
 *  actually conforms to a lot in Lane-locked mode — for a Landmark it's just
 *  "no particular flavor", same as any other type choice. */
const PLACE_TYPES: BusinessType[] = ['generic', 'inn', 'tavern', 'smithy', 'shop', 'market', 'temple', 'guild']

/** Sidebar panel for the Place tool: choose what a click on the map will drop
 *  there, resolved BEFORE that click — a broad Lane-locked/Landmark mode
 *  toggle, then a sub-picker for whichever mode is active (a business type
 *  for Lane-locked; a business type AND a shape for Landmark, since a
 *  landmark isn't fitted to a lot and can be flavoured same as any other
 *  building). Lives here (not the top toolbar) so it sits where every other
 *  tool's options already live. */
export function PlacePanel() {
  const placeMode = useMapStore((s) => s.placeMode)
  const setPlaceMode = useMapStore((s) => s.setPlaceMode)
  const placeType = useMapStore((s) => s.placeType)
  const setPlaceType = useMapStore((s) => s.setPlaceType)
  const placeLandmarkType = useMapStore((s) => s.placeLandmarkType)
  const setPlaceLandmarkType = useMapStore((s) => s.setPlaceLandmarkType)
  const placeShape = useMapStore((s) => s.placeShape)
  const setPlaceShape = useMapStore((s) => s.setPlaceShape)

  return (
    <div className="panel">
      <h2 className="panel-h">Place</h2>
      <p className="hint">Choose what to place, then click a spot on the map to drop it there.</p>

      <label className="field">
        <span>Kind</span>
        <div className="seg">
          <button className={placeMode === 'lane' ? 'seg-btn active' : 'seg-btn'} onClick={() => setPlaceMode('lane')}>
            Lane-locked
          </button>
          <button
            className={placeMode === 'landmark' ? 'seg-btn active' : 'seg-btn'}
            onClick={() => setPlaceMode('landmark')}
          >
            Landmark
          </button>
        </div>
      </label>

      {placeMode === 'lane' ? (
        <label className="field">
          <span>Type</span>
          <select className="input" value={placeType} onChange={(e) => setPlaceType(e.target.value as BusinessType)}>
            {PLACE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {placeType === 'generic' && (
            <span className="hint">
              Conforms to whatever lot you click — same rules as procedural
              generation (must front a lane, can't sit in one). Every other
              type places a plain rect wherever you click, freely movable.
            </span>
          )}
        </label>
      ) : (
        <>
          <label className="field">
            <span>Type</span>
            <select
              className="input"
              value={placeLandmarkType}
              onChange={(e) => setPlaceLandmarkType(e.target.value as BusinessType)}
            >
              {PLACE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Shape</span>
            <select className="input" value={placeShape} onChange={(e) => setPlaceShape(e.target.value as BuildingShape)}>
              {LANDMARK_SHAPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="hint">
              Placed freely wherever you click — not fitted to a lot, so it
              stays movable, resizable, and rotatable afterward.
            </span>
          </label>
        </>
      )}
    </div>
  )
}
