import { useRef, useState } from 'react'
import type { Point } from '../shared/types.ts'
import { useClientToWorld } from './coords.ts'
import { THEME } from '../rendering/style/theme.ts'

type Props = {
  point: Point
  radius?: number
  onDrag: (p: Point) => void
  onRemove?: () => void
  /** Called once when a drag gesture begins (useful for whole-object moves). */
  onDragStart?: () => void
}

/**
 * A drag handle for a single geometry point. Invisible until hovered/active.
 * Uses pointer capture so the drag keeps tracking outside the handle.
 */
export function EditableVertex({ point, radius = 9, onDrag, onRemove, onDragStart }: Props) {
  const clientToWorld = useClientToWorld()
  const [active, setActive] = useState(false)
  const [hover, setHover] = useState(false)
  const dragging = useRef(false)

  return (
    <circle
      cx={point.x}
      cy={point.y}
      r={radius}
      fill={active ? THEME.selection : '#ffffff'}
      fillOpacity={active || hover ? 0.9 : 0.001}
      stroke={THEME.selection}
      strokeWidth={active || hover ? 2 : 0}
      style={{ cursor: 'grab' }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        ;(e.target as Element).setPointerCapture(e.pointerId)
        dragging.current = true
        setActive(true)
        onDragStart?.()
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return
        onDrag(clientToWorld(e.clientX, e.clientY))
      }}
      onPointerUp={(e) => {
        dragging.current = false
        setActive(false)
        ;(e.target as Element).releasePointerCapture(e.pointerId)
      }}
      onContextMenu={(e) => {
        if (!onRemove) return
        e.preventDefault()
        e.stopPropagation()
        onRemove()
      }}
    />
  )
}
