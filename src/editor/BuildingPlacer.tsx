import { useRef } from 'react'
import type { Building, BusinessType, Point } from '../shared/types.ts'
import { useMapStore } from '../state/mapStore.ts'
import { useClientToWorld } from './coords.ts'
import { THEME } from '../rendering/style/theme.ts'
import { pointInPolygon, toPath } from '../shared/geometry.ts'
import { footprintRings, ringsToPath } from '../generation/buildingShapes.ts'

/** Stable per-building seed for deterministic footprint variation — mirrors
 *  `seedOf` in rendering/layers/Buildings.tsx so the click target exactly
 *  matches what's actually drawn. */
function seedOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** SVG path for `b`'s hit-test area in absolute (pre-rotation-transform)
 *  coordinates — the ACTUAL silhouette (footprint, or the shape's rings),
 *  not its bounding box. A plain rect building has none of these, so it
 *  returns null and callers fall back to a plain `<rect>`. Using the real
 *  outline matters most for an irregular shape like a merged building: its
 *  bounding box can be noticeably bigger than the shape itself and would
 *  otherwise cover part of a neighbouring building, intercepting clicks
 *  meant for it. */
function hitPathFor(b: Building): string | null {
  const rings =
    b.footprint && b.footprint.length >= 3
      ? [b.footprint]
      : b.shape && b.shape !== 'rect'
        ? footprintRings(b.shape, b.w, b.h, seedOf(b.id))
        : null
  if (!rings) return null
  return ringsToPath(rings.map((ring) => ring.map((p) => ({ x: p.x + b.x, y: p.y + b.y }))))
}

/** True if `p` falls within `b`'s ACTUAL (possibly rotated) silhouette — its
 *  footprint/shape rings when it has one, not just its bounding box, for the
 *  same reason as `hitPathFor`: an irregular shape's box can extend well
 *  past the shape itself and into a neighbour. */
function pointInBuilding(p: Point, b: Building): boolean {
  const dx = p.x - b.x
  const dy = p.y - b.y
  const cos = Math.cos(-b.rotation)
  const sin = Math.sin(-b.rotation)
  const lx = dx * cos - dy * sin
  const ly = dx * sin + dy * cos
  const rings =
    b.footprint && b.footprint.length >= 3
      ? [b.footprint]
      : b.shape && b.shape !== 'rect'
        ? footprintRings(b.shape, b.w, b.h, seedOf(b.id))
        : null
  if (rings) return rings.some((ring) => pointInPolygon({ x: lx, y: ly }, ring))
  return Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2
}

const DEFAULT_SIZE: Record<BusinessType, { w: number; h: number }> = {
  generic: { w: 42, h: 34 },
  inn: { w: 64, h: 52 },
  smithy: { w: 52, h: 44 },
  temple: { w: 96, h: 80 },
  shop: { w: 46, h: 38 },
  tavern: { w: 60, h: 48 },
  market: { w: 58, h: 58 },
  guild: { w: 78, h: 62 },
  landmark: { w: 110, h: 90 },
}

/** Handles building placement (place tool) and per-building move/rotate/select. */
export function BuildingPlacer() {
  const clientToWorld = useClientToWorld()
  const tool = useMapStore((s) => s.tool)
  const filter = useMapStore((s) => s.selectFilter)
  const canBuilding = filter === 'all' || filter === 'building'
  const placeMode = useMapStore((s) => s.placeMode)
  const placeType = useMapStore((s) => s.placeType)
  const placeLandmarkType = useMapStore((s) => s.placeLandmarkType)
  const placeShape = useMapStore((s) => s.placeShape)
  const buildings = useMapStore((s) => s.scene.buildings)
  const lanes = useMapStore((s) => s.scene.lanes)
  const bounds = useMapStore((s) => s.scene.bounds)
  const selection = useMapStore((s) => s.selection)
  const addBuilding = useMapStore((s) => s.addBuilding)
  const placeConformingBuilding = useMapStore((s) => s.placeConformingBuilding)
  const moveBuilding = useMapStore((s) => s.moveBuilding)
  const updateBuilding = useMapStore((s) => s.updateBuilding)
  const setTool = useMapStore((s) => s.setTool)
  const select = useMapStore((s) => s.select)
  const snapshot = useMapStore((s) => s.snapshot)
  const mergeFrom = useMapStore((s) => s.mergeFrom)
  const mergeBuildings = useMapStore((s) => s.mergeBuildings)
  const cancelMerge = useMapStore((s) => s.cancelMerge)

  const dragLast = useRef<Point | null>(null)
  const dragging = useRef<string | null>(null)
  const rotating = useRef<string | null>(null)

  return (
    <g>
      {/* Block/lane guides — shown while placing so it's clear where a generic
          building actually CAN land (a real lot fronting one of these lanes),
          matching what the Districts tool already shows while laying out
          districts. */}
      {tool === 'place' && (
        <g pointerEvents="none">
          {lanes.map((l, i) => (
            <path
              key={`lane-${i}`}
              d={toPath(l.points, false)}
              fill="none"
              stroke="#8a3a2a"
              strokeWidth={2}
              strokeOpacity={0.5}
              strokeDasharray="7 7"
            />
          ))}
        </g>
      )}

      {/* Move/select handles per building */}
      {buildings.map((b) => {
        const deg = (b.rotation * 180) / Math.PI
        const isSel = selection?.kind === 'building' && selection.id === b.id
        return (
          <g key={b.id} transform={`rotate(${deg.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)})`}>
            {isSel && (
              <rect
                x={b.x - b.w / 2 - 3}
                y={b.y - b.h / 2 - 3}
                width={b.w + 6}
                height={b.h + 6}
                fill="none"
                stroke={THEME.selection}
                strokeWidth={2}
                strokeDasharray="6 4"
                pointerEvents="none"
              />
            )}
            {(canBuilding || tool === 'place') && (() => {
              const handlers = {
                fill: '#ffffff',
                fillOpacity: 0.001,
                style: { cursor: mergeFrom ? 'crosshair' : b.laneSnapped ? 'pointer' : 'move' },
                onPointerDown: (e: React.PointerEvent) => {
                  if (e.button !== 0 || tool === 'place') return
                  e.stopPropagation()
                  // A merge is armed — this click completes it (or cancels, if
                  // it lands back on the building the merge started from)
                  // instead of the usual select/drag behavior.
                  if (mergeFrom) {
                    if (mergeFrom === b.id) {
                      cancelMerge()
                      return
                    }
                    const result = mergeBuildings(b.id)
                    if (!result.ok) {
                      alert(result.reason)
                      return
                    }
                    const list = useMapStore.getState().scene.buildings
                    const added = list[list.length - 1]
                    if (added) select({ kind: 'building', id: added.id })
                    return
                  }
                  select({ kind: 'building', id: b.id })
                  // Fitted to a specific lot — moving it would pull it out of the
                  // block it was snapped to, so select only, never drag.
                  if (b.laneSnapped) return
                  ;(e.target as Element).setPointerCapture(e.pointerId)
                  dragging.current = b.id
                  dragLast.current = clientToWorld(e.clientX, e.clientY)
                  snapshot()
                },
                onPointerMove: (e: React.PointerEvent) => {
                  if (dragging.current !== b.id || !dragLast.current) return
                  const now = clientToWorld(e.clientX, e.clientY)
                  moveBuilding(b.id, now.x - dragLast.current.x, now.y - dragLast.current.y)
                  dragLast.current = now
                },
                onPointerUp: (e: React.PointerEvent) => {
                  dragging.current = null
                  dragLast.current = null
                  ;(e.target as Element).releasePointerCapture(e.pointerId)
                },
              }
              // The actual silhouette, not its bounding box — an irregular
              // shape (a merged building especially) can have a bounding box
              // noticeably bigger than the shape itself, which would
              // otherwise cover part of a neighbour and steal its clicks.
              const hitD = hitPathFor(b)
              return hitD ? (
                <path d={hitD} {...handlers} />
              ) : (
                <rect x={b.x - b.w / 2} y={b.y - b.h / 2} width={b.w} height={b.h} {...handlers} />
              )
            })()}
            {/* Rotation handle — omitted for a lane-snapped building; rotating
                it would pull it out of the lot it was fitted to. */}
            {isSel && !b.laneSnapped && (
              <circle
                cx={b.x}
                cy={b.y - b.h / 2 - 20}
                r={7}
                fill={THEME.selection}
                style={{ cursor: 'grab' }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return
                  e.stopPropagation()
                  ;(e.target as Element).setPointerCapture(e.pointerId)
                  rotating.current = b.id
                  snapshot()
                }}
                onPointerMove={(e) => {
                  if (rotating.current !== b.id) return
                  const w = clientToWorld(e.clientX, e.clientY)
                  const angle = Math.atan2(w.y - b.y, w.x - b.x) + Math.PI / 2
                  updateBuilding(b.id, { rotation: angle })
                }}
                onPointerUp={(e) => {
                  rotating.current = null
                  ;(e.target as Element).releasePointerCapture(e.pointerId)
                }}
              />
            )}
          </g>
        )
      })}

      {/* Placement capture surface (on top) when the place tool is active. */}
      {tool === 'place' && (
        <rect
          x={0}
          y={0}
          width={bounds.width}
          height={bounds.height}
          fill="#ffffff"
          fillOpacity={0.001}
          style={{ cursor: 'crosshair' }}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            const w = clientToWorld(e.clientX, e.clientY)
            // Clicking on top of an already-placed building selects it instead
            // of stacking a duplicate there — the Place tool covers the whole
            // canvas, so a click meant to reopen an existing building (to
            // rename it, say) would otherwise silently add a new one on it.
            const existing = buildings.find((b) => pointInBuilding(w, b))
            if (existing) {
              select({ kind: 'building', id: existing.id })
              setTool('select')
              return
            }
            // A landmark has no lot to conform to — it's placed freely at a
            // hand-picked shape, with its own business type (independent of
            // the shape) so it can be flavoured same as any other building.
            if (placeMode === 'landmark') {
              const size = DEFAULT_SIZE.landmark
              addBuilding({
                x: w.x,
                y: w.y,
                w: size.w,
                h: size.h,
                rotation: 0,
                isCustom: true,
                businessType: placeLandmarkType,
                isLandmark: true,
                shape: placeShape,
                name: undefined,
              })
              // Stays in Place tool — landmarks are often placed a few at a
              // time (e.g. trying different shapes), so this shouldn't
              // require reselecting the tool after each one. Lane-locked
              // placement below still hands off to Select as usual, since
              // that's normally a one-off "add and then edit/name it" action.
              const list = useMapStore.getState().scene.buildings
              const added = list[list.length - 1]
              if (added) select({ kind: 'building', id: added.id })
              return
            }
            // A generic building has no silhouette of its own — it's meant to
            // blend into the block, so it must actually FIT one: same rules as
            // procedural generation (a real, lane-fronting, corridor-clear
            // lot), not a floating rectangle. If there's no such lot here, the
            // placement is refused outright — stay in Place tool so another
            // spot can be tried, rather than falling back to a plain rect.
            if (placeType === 'generic') {
              if (placeConformingBuilding(w)) {
                const list = useMapStore.getState().scene.buildings
                const added = list[list.length - 1]
                if (added) select({ kind: 'building', id: added.id })
                setTool('select')
              }
              return
            }
            const size = DEFAULT_SIZE[placeType]
            addBuilding({
              x: w.x,
              y: w.y,
              w: size.w,
              h: size.h,
              rotation: 0,
              isCustom: true,
              businessType: placeType,
              name: undefined,
            })
            // Select the freshly-added building (it is the last in the list).
            const list = useMapStore.getState().scene.buildings
            const added = list[list.length - 1]
            if (added) select({ kind: 'building', id: added.id })
            setTool('select')
          }}
        />
      )}
    </g>
  )
}
