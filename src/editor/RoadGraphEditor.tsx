import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useMapStore } from '../state/mapStore.ts'
import { useClientToWorld } from './coords.ts'
import { toPath } from '../shared/geometry.ts'
import { THEME } from '../rendering/style/theme.ts'
import type { RoadNode } from '../shared/types.ts'

const NODE_STYLE: Record<RoadNode['kind'], { r: number; fill: string }> = {
  plaza: { r: 13, fill: '#c8933a' },
  gate: { r: 11, fill: '#8c7355' },
  exit: { r: 8, fill: '#b3a894' },
  junction: { r: 8, fill: '#e9d9b0' },
}

/**
 * Road-graph editor: draggable nodes (intersections / dead-ends / gates) joined
 * by edges. Drag a node to move its streets; in Connect mode click two nodes to
 * add a street between them; click an edge to select it (Delete removes it).
 */
export function RoadGraphEditor() {
  const clientToWorld = useClientToWorld()
  const nodes = useMapStore((s) => s.scene.roadNodes)
  const edges = useMapStore((s) => s.scene.roadEdges)
  const selection = useMapStore((s) => s.selection)
  const connectMode = useMapStore((s) => s.connectMode)
  const connectFrom = useMapStore((s) => s.connectFrom)
  const select = useMapStore((s) => s.select)
  const snapshot = useMapStore((s) => s.snapshot)
  const moveRoadNode = useMapStore((s) => s.moveRoadNode)
  const connectNodes = useMapStore((s) => s.connectNodes)
  const setConnectFrom = useMapStore((s) => s.setConnectFrom)
  const reflowBuildings = useMapStore((s) => s.reflowBuildings)

  const dragging = useRef<string | null>(null)
  const moved = useRef(false)
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  const onNodeDown = (id: string) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    if (connectMode) {
      // First click picks the source; second click makes the edge.
      if (!connectFrom) {
        setConnectFrom(id)
      } else {
        connectNodes(connectFrom, id)
        setConnectFrom(id)
      }
      return
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragging.current = id
    snapshot()
    select({ kind: 'roadNode', id })
  }

  return (
    <g>
      {/* One selectable hit line per EDGE (the street between two nodes). */}
      {edges.map((edge) => {
        const a = nodeById.get(edge.a)
        const b = nodeById.get(edge.b)
        if (!a || !b) return null
        const seg = [a.point, b.point]
        const sel = selection?.kind === 'road' && selection.id === edge.id
        return (
          <g key={edge.id}>
            {sel && <path d={toPath(seg, false)} fill="none" stroke={THEME.selection} strokeWidth={5} strokeOpacity={0.8} pointerEvents="none" />}
            <path
              d={toPath(seg, false)}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.001}
              strokeWidth={18}
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => {
                if (e.button !== 0 || connectMode) return
                e.stopPropagation()
                select({ kind: 'road', id: edge.id })
              }}
            />
          </g>
        )
      })}

      {/* Nodes */}
      {nodes.map((n) => {
        const st = NODE_STYLE[n.kind]
        const isSel = selection?.kind === 'roadNode' && selection.id === n.id
        const isFrom = connectFrom === n.id
        return (
          <circle
            key={n.id}
            cx={n.point.x}
            cy={n.point.y}
            r={st.r}
            fill={st.fill}
            stroke={isFrom ? '#d64545' : isSel ? '#d64545' : '#3a2c1c'}
            strokeWidth={isSel || isFrom ? 4 : 2}
            style={{ cursor: connectMode ? 'crosshair' : 'move' }}
            onPointerDown={onNodeDown(n.id)}
            onPointerMove={(e) => {
              if (dragging.current !== n.id) return
              moved.current = true
              moveRoadNode(n.id, clientToWorld(e.clientX, e.clientY))
            }}
            onPointerUp={(e) => {
              if (dragging.current !== n.id) return
              dragging.current = null
              ;(e.target as Element).releasePointerCapture(e.pointerId)
              // Buildings reflow to the road's new path once the drag settles.
              if (moved.current) reflowBuildings()
              moved.current = false
            }}
          />
        )
      })}
    </g>
  )
}
