import { useRef } from 'react'
import type { Point } from '../shared/types.ts'
import { toPath } from '../shared/geometry.ts'
import { EditableVertex } from './EditableVertex.tsx'
import { useClientToWorld } from './coords.ts'
import { useMapStore } from '../state/mapStore.ts'
import { THEME } from '../rendering/style/theme.ts'

type Props = {
  points: Point[]
  closed?: boolean
  selected?: boolean
  /** Show draggable vertex handles (typically only when selected). */
  showVertices?: boolean
  onVertexDrag: (index: number, p: Point) => void
  /** If provided, dragging the interior translates all vertices together. */
  onBodyDrag?: (dx: number, dy: number) => void
  onSelect?: () => void
}

/** Edit overlay for a polygon (district) or open ring (wall): draggable
 *  vertices plus optional whole-object body drag. */
export function EditablePolygon({ points, closed = true, selected, showVertices = true, onVertexDrag, onBodyDrag, onSelect }: Props) {
  const clientToWorld = useClientToWorld()
  const snapshot = useMapStore((s) => s.snapshot)
  const last = useRef<Point | null>(null)
  const dragging = useRef(false)

  return (
    <g>
      {onBodyDrag && (
        <path
          d={toPath(points, closed)}
          fill="#ffffff"
          fillOpacity={0.001}
          style={{ cursor: 'move' }}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            ;(e.target as Element).setPointerCapture(e.pointerId)
            dragging.current = true
            last.current = clientToWorld(e.clientX, e.clientY)
            snapshot()
            onSelect?.()
          }}
          onPointerMove={(e) => {
            if (!dragging.current || !last.current) return
            const now = clientToWorld(e.clientX, e.clientY)
            onBodyDrag(now.x - last.current.x, now.y - last.current.y)
            last.current = now
          }}
          onPointerUp={(e) => {
            dragging.current = false
            last.current = null
            ;(e.target as Element).releasePointerCapture(e.pointerId)
          }}
        />
      )}

      {selected && (
        <path d={toPath(points, closed)} fill="none" stroke={THEME.selection} strokeWidth={2.5} strokeDasharray="8 6" pointerEvents="none" />
      )}

      {showVertices &&
        points.map((p, i) => (
          <EditableVertex
            key={i}
            point={p}
            onDragStart={snapshot}
            onDrag={(np) => onVertexDrag(i, np)}
          />
        ))}
    </g>
  )
}
