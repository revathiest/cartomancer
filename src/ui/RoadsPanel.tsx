import { useState } from 'react'
import { useMapStore } from '../state/mapStore.ts'
import type { RoadKind, RoadNodeKind } from '../shared/types.ts'

// 'gate' is deliberately absent: gates are never hand-placed. Connecting two
// nodes across the wall automatically splices a gate in at the crossing (see
// connectNodes in mapStore.ts) — a street through the wall is always a gate.
const NODE_KINDS: { kind: RoadNodeKind; label: string; hint: string }[] = [
  { kind: 'junction', label: 'Junction', hint: 'A normal intersection or bend.' },
  { kind: 'exit', label: 'Exit', hint: 'A road end outside the wall (leads away).' },
  { kind: 'plaza', label: 'Plaza', hint: 'A central hub / square.' },
]

export function RoadsPanel() {
  const bounds = useMapStore((s) => s.scene.bounds)
  const nodes = useMapStore((s) => s.scene.roadNodes)
  const edges = useMapStore((s) => s.scene.roadEdges)
  const selection = useMapStore((s) => s.selection)
  const connectMode = useMapStore((s) => s.connectMode)
  const setConnectMode = useMapStore((s) => s.setConnectMode)
  const addRoadNode = useMapStore((s) => s.addRoadNode)
  const setRoadNodeKind = useMapStore((s) => s.setRoadNodeKind)
  const setRoadEdgeKind = useMapStore((s) => s.setRoadEdgeKind)
  const deleteSelected = useMapStore((s) => s.deleteSelected)
  const regenerateRoads = useMapStore((s) => s.regenerateRoads)

  const [addKind, setAddKind] = useState<RoadNodeKind>('junction')

  const selectedNode =
    selection?.kind === 'roadNode' ? nodes.find((n) => n.id === selection.id) : undefined
  const selectedEdge =
    selection?.kind === 'road' ? edges.find((e) => e.id === selection.id) : undefined

  const handleAdd = () => {
    const jitter = () => (Math.random() - 0.5) * bounds.width * 0.2
    addRoadNode({ x: bounds.width / 2 + jitter(), y: bounds.height / 2 + jitter() }, addKind)
  }

  const canDelete = selection?.kind === 'roadNode' || selection?.kind === 'road'

  return (
    <div className="panel">
      <h2 className="panel-h">Roads</h2>
      <p className="hint">
        Roads are a graph of <b>nodes</b> joined by <b>streets</b>. Drag a node to
        move its streets; a line of nodes renders as one continuous road.
      </p>

      <label className="field">
        <span>New node type</span>
        <select className="input" value={addKind} onChange={(e) => setAddKind(e.target.value as RoadNodeKind)}>
          {NODE_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <button className="btn full" onClick={handleAdd}>
        ＋ Add {addKind} node
      </button>

      <button
        className={connectMode ? 'btn accent full' : 'btn full'}
        onClick={() => setConnectMode(!connectMode)}
      >
        {connectMode ? '✓ Connecting — click two nodes' : '🔗 Connect nodes'}
      </button>

      {selectedNode && selectedNode.kind === 'gate' && (
        <div className="field">
          <span>Selected node type</span>
          <div className="input" aria-disabled>
            Gate (automatic)
          </div>
          <span className="hint">
            Created automatically where a street crosses the wall — it can&apos;t be
            reassigned. Delete it below to close up the wall.
          </span>
        </div>
      )}

      {selectedNode && selectedNode.kind !== 'gate' && (
        <label className="field">
          <span>Selected node type</span>
          <select
            className="input"
            value={selectedNode.kind}
            onChange={(e) => setRoadNodeKind(selectedNode.id, e.target.value as RoadNodeKind)}
          >
            {NODE_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
          <span className="hint">{NODE_KINDS.find((k) => k.kind === selectedNode.kind)?.hint}</span>
        </label>
      )}

      {selectedEdge && (
        <label className="field">
          <span>Selected street</span>
          <select
            className="input"
            value={selectedEdge.kind}
            onChange={(e) => setRoadEdgeKind(selectedEdge.id, e.target.value as RoadKind)}
          >
            <option value="primary">Main road (wide)</option>
            <option value="secondary">Side street (narrow)</option>
          </select>
        </label>
      )}

      <button className="btn danger full" disabled={!canDelete} onClick={deleteSelected}>
        🗑 Delete selected {selection?.kind === 'road' ? 'street' : 'node'}
      </button>

      <p className="hint">
        <b>{nodes.length}</b> nodes, <b>{edges.length}</b> streets. Connect nodes
        across the wall and a <b>gate</b> opens there automatically; an <b>exit</b>{' '}
        node is a road leading out of the city. Streets can never cross open water.
      </p>

      <button
        className="btn full"
        onClick={() => {
          if (confirm('Rebuild the automatic road network for the current districts? This discards your road edits.')) {
            regenerateRoads()
          }
        }}
      >
        ⟳ Regenerate roads
      </button>
      <p className="hint">
        Your road edits now persist when you move or resize districts — use this
        only to start the road layout over.
      </p>
    </div>
  )
}
