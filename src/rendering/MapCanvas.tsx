import { useCallback, useEffect, useRef, useState } from 'react'
import { useMapStore } from '../state/mapStore.ts'
import { CoordsContext, type ClientToWorld } from '../editor/coords.ts'
import { THEME } from './style/theme.ts'
import { MapDefs } from './style/filters.tsx'
import { Background } from './layers/Background.tsx'
import { Sea } from './layers/Sea.tsx'
import { Districts } from './layers/Districts.tsx'
import { River } from './layers/River.tsx'
import { Roads } from './layers/Roads.tsx'
import { DistrictWalls } from './layers/DistrictWalls.tsx'
import { Wall } from './layers/Wall.tsx'
import { Buildings } from './layers/Buildings.tsx'
import { Labels } from './layers/Labels.tsx'
import { EditablePolyline } from '../editor/EditablePolyline.tsx'
import { BuildingPlacer } from '../editor/BuildingPlacer.tsx'
import { DistrictLayout } from '../editor/DistrictLayout.tsx'
import { RoadGraphEditor } from '../editor/RoadGraphEditor.tsx'

type View = { x: number; y: number; w: number; h: number }

export const MAP_SVG_ID = 'map-svg'
export const EDITOR_OVERLAY_ID = 'editor-overlay'

/** The editable overlay (only mounted in edit mode). */
function EditorOverlay() {
  const scene = useMapStore((s) => s.scene)
  const tool = useMapStore((s) => s.tool)
  const selection = useMapStore((s) => s.selection)
  const select = useMapStore((s) => s.select)
  const updateRiverPoint = useMapStore((s) => s.updateRiverPoint)
  const insertRiverPoint = useMapStore((s) => s.insertRiverPoint)
  const removeRiverPoint = useMapStore((s) => s.removeRiverPoint)
  const filter = useMapStore((s) => s.selectFilter)

  const isSel = (kind: string, id: string) => selection?.kind === kind && selection.id === id
  const can = (k: string) => filter === 'all' || filter === k

  // The district-layout tool replaces the geometry overlay with seed markers.
  if (tool === 'district') {
    return (
      <g id={EDITOR_OVERLAY_ID}>
        <DistrictLayout />
      </g>
    )
  }

  // The roads tool replaces the geometry overlay with the road-graph editor.
  if (tool === 'roads') {
    return (
      <g id={EDITOR_OVERLAY_ID}>
        <RoadGraphEditor />
      </g>
    )
  }

  return (
    <g id={EDITOR_OVERLAY_ID}>
      {/* Districts are laid out in the dedicated Districts tool (seed markers),
          and walls follow the city border — neither is selectable here. */}

      {/* Roads are edited in the dedicated Roads tool (node graph), not here. */}

      {/* River — click to select, drag handles to reroute, mid-markers to add a
          bend, right-click a handle to remove it. */}
      {can('river') && scene.river && scene.river.points.length >= 2 && (
        <EditablePolyline
          points={scene.river.points}
          selected={isSel('river', 'river')}
          showVertices={isSel('river', 'river')}
          onSelect={() => select({ kind: 'river', id: 'river' })}
          onVertexDrag={(i, p) => updateRiverPoint(i, p)}
          onInsert={(i) => insertRiverPoint(i)}
          onRemove={(i) => removeRiverPoint(i)}
        />
      )}

      {/* Buildings (placement + move/rotate) */}
      <BuildingPlacer />
    </g>
  )
}

export function MapCanvas() {
  const bounds = useMapStore((s) => s.scene.bounds)
  const mode = useMapStore((s) => s.mode)
  const select = useMapStore((s) => s.select)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const [view, setView] = useState<View>(() => {
    const pad = bounds.width * 0.05
    return { x: -pad, y: -pad, w: bounds.width + pad * 2, h: bounds.height + pad * 2 }
  })

  // Re-frame the map whenever the world size changes (e.g. district count grew
  // or shrank the city), so it stays fully in view without manual zoom.
  useEffect(() => {
    const pad = bounds.width * 0.05
    setView({ x: -pad, y: -pad, w: bounds.width + pad * 2, h: bounds.height + pad * 2 })
  }, [bounds.width, bounds.height])

  const panState = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null)

  const clientToWorld = useCallback<ClientToWorld>((clientX, clientY) => {
    const svg = svgRef.current
    if (!svg) return { x: clientX, y: clientY }
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: clientX, y: clientY }
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }, [])

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mx = (e.clientX - rect.left) / rect.width
    const my = (e.clientY - rect.top) / rect.height
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12
    const newW = Math.min(bounds.width * 3, Math.max(bounds.width * 0.15, view.w * factor))
    const newH = newW * (view.h / view.w)
    // Keep the point under the cursor fixed.
    const wx = view.x + mx * view.w
    const wy = view.y + my * view.h
    setView({ x: wx - mx * newW, y: wy - my * newH, w: newW, h: newH })
  }

  const onPointerDownSurface = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    panState.current = { x: e.clientX, y: e.clientY, view, moved: false }
  }

  const onPointerMoveSurface = (e: React.PointerEvent) => {
    const ps = panState.current
    if (!ps) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = ps.view.w / rect.width
    const scaleY = ps.view.h / rect.height
    const dx = (e.clientX - ps.x) * scaleX
    const dy = (e.clientY - ps.y) * scaleY
    if (Math.abs(e.clientX - ps.x) + Math.abs(e.clientY - ps.y) > 3) ps.moved = true
    setView({ x: ps.view.x - dx, y: ps.view.y - dy, w: ps.view.w, h: ps.view.h })
  }

  const onPointerUpSurface = (e: React.PointerEvent) => {
    const ps = panState.current
    panState.current = null
    ;(e.target as Element).releasePointerCapture(e.pointerId)
    // A click without drag on empty parchment clears the selection.
    if (ps && !ps.moved) select(null)
  }

  return (
    <CoordsContext.Provider value={clientToWorld}>
      <svg
        ref={svgRef}
        id={MAP_SVG_ID}
        width="100%"
        height="100%"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', background: '#1a1613', touchAction: 'none' }}
        onWheel={onWheel}
      >
        <MapDefs />

        {/* Pan/deselect surface + visible parchment fill. */}
        <rect
          x={view.x}
          y={view.y}
          width={view.w}
          height={view.h}
          fill={THEME.parchment}
          onPointerDown={onPointerDownSurface}
          onPointerMove={onPointerMoveSurface}
          onPointerUp={onPointerUpSurface}
        />

        {/* Purely visual base layers — never intercept pointer events. */}
        <g pointerEvents="none">
          <Background />
          <Districts />
          <River />
          <Roads />
          <DistrictWalls />
          <Wall />
          <Buildings />
          {/* Everything above is clipped to land, so the sea (drawn last) only
              covers actual water — it cleanly hides the river's mouth so the river
              blends into the sea, and nothing else overhangs it. */}
          <Sea />
          <Labels />
        </g>

        {mode === 'edit' && <EditorOverlay />}
      </svg>
    </CoordsContext.Provider>
  )
}
