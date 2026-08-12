import type { Point } from '../shared/types.ts'
import { toPath } from '../shared/geometry.ts'
import { EditableVertex } from './EditableVertex.tsx'
import { useMapStore } from '../state/mapStore.ts'
import { THEME } from '../rendering/style/theme.ts'

type Props = {
  points: Point[]
  selected?: boolean
  /** Show draggable vertex handles + insert markers (typically only when selected). */
  showVertices?: boolean
  onVertexDrag: (index: number, p: Point) => void
  onSelect?: () => void
  /** Right-click a vertex to remove it. */
  onRemove?: (index: number) => void
  /** Click a mid-edge marker to insert a new vertex after `index`. */
  onInsert?: (afterIndex: number) => void
}

/** Edit overlay for a polyline (road / river): draggable vertices, plus
 *  add-vertex markers at each edge midpoint and right-click removal. */
export function EditablePolyline({ points, selected, showVertices = true, onVertexDrag, onSelect, onRemove, onInsert }: Props) {
  const snapshot = useMapStore((s) => s.snapshot)

  return (
    <g>
      {/* Invisible thick hit stroke for click-to-select. */}
      {onSelect && (
        <path
          d={toPath(points, false)}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={0.001}
          strokeWidth={16}
          style={{ cursor: 'pointer' }}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            onSelect()
          }}
        />
      )}

      {selected && (
        <path d={toPath(points, false)} fill="none" stroke={THEME.selection} strokeWidth={2} strokeDasharray="8 6" pointerEvents="none" />
      )}

      {/* Mid-edge insert markers */}
      {showVertices &&
        onInsert &&
        points.slice(0, -1).map((p, i) => {
          const a = p
          const b = points[i + 1]
          const mx = (a.x + b.x) / 2
          const my = (a.y + b.y) / 2
          return (
            <rect
              key={`ins-${i}`}
              x={mx - 5}
              y={my - 5}
              width={10}
              height={10}
              fill={THEME.selection}
              fillOpacity={0.35}
              style={{ cursor: 'copy' }}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                onInsert(i)
              }}
            />
          )
        })}

      {showVertices &&
        points.map((p, i) => (
          <EditableVertex
            key={i}
            point={p}
            onDragStart={snapshot}
            onDrag={(np) => {
              onSelect?.()
              onVertexDrag(i, np)
            }}
            onRemove={onRemove ? () => onRemove(i) : undefined}
          />
        ))}
    </g>
  )
}
