import { useDungeonStore } from './dungeonStore.ts'
import type { ConnectionEndpoint, DungeonScene, MonsterGroup, Room, SecurityKind } from './types.ts'

const SECURITY_OPTIONS: SecurityKind[] = ['none', 'mundane', 'magical']

/** The room's monster/loot note, hand-editable — rebuilds the whole
 *  `monsters`/`loot` pair on every change via `updateRoomEncounter` rather
 *  than patching a single field, since `monsters` is a plain array (add/
 *  remove/edit-in-place all just produce a new array) and `loot` is a bare
 *  string, not a keyed object either has properties to individually patch. */
function EncounterEditor({ room }: { room: Room }) {
  const updateRoomEncounter = useDungeonStore((s) => s.updateRoomEncounter)
  const snapshot = useDungeonStore((s) => s.snapshot)
  const monsters = room.encounter?.monsters ?? []
  const loot = room.encounter?.loot ?? null

  const setMonsters = (next: MonsterGroup[]) => updateRoomEncounter(room.id, { monsters: next, loot })
  const setLoot = (next: string | null) => updateRoomEncounter(room.id, { monsters, loot: next })

  return (
    <>
      <h2 className="panel-h">Encounter</h2>
      {monsters.length === 0 && <p className="hint">No monsters in this room.</p>}
      {monsters.map((m, i) => (
        <div className="row" key={i}>
          <label className="field">
            <span>CR</span>
            <input
              type="number"
              className="input"
              step={0.125}
              min={0}
              value={m.cr}
              onFocus={snapshot}
              onChange={(e) => setMonsters(monsters.map((mm, j) => (j === i ? { ...mm, cr: Number(e.target.value) } : mm)))}
            />
          </label>
          <label className="field">
            <span>Count</span>
            <input
              type="number"
              className="input"
              min={1}
              value={m.count}
              onFocus={snapshot}
              onChange={(e) => setMonsters(monsters.map((mm, j) => (j === i ? { ...mm, count: Math.max(1, Number(e.target.value)) } : mm)))}
            />
          </label>
          <button
            className="btn"
            title="Remove this monster group"
            onClick={() => {
              snapshot()
              setMonsters(monsters.filter((_, j) => j !== i))
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="btn full"
        onClick={() => {
          snapshot()
          setMonsters([...monsters, { cr: 1, count: 1 }])
        }}
      >
        + Add monster group
      </button>

      <label className="field">
        <span>Loot</span>
        <input type="text" className="input" placeholder="none" value={loot ?? ''} onFocus={snapshot} onChange={(e) => setLoot(e.target.value || null)} />
      </label>

      <p className="hint">Shown on the map as the room's note, when "Show encounter notes on map" is on.</p>
    </>
  )
}

function RoomEditor({ id }: { id: string }) {
  const room = useDungeonStore((s) => s.scene.rooms.find((r) => r.id === id))
  const entranceRoomId = useDungeonStore((s) => s.scene.entranceRoomId)
  const bossRoomId = useDungeonStore((s) => s.scene.bossRoomId)
  const resizeRoom = useDungeonStore((s) => s.resizeRoom)
  const deleteRoom = useDungeonStore((s) => s.deleteRoom)
  const snapshot = useDungeonStore((s) => s.snapshot)

  if (!room) return <p className="hint">Room not found.</p>

  return (
    <>
      <h2 className="panel-h">Room</h2>
      {id === entranceRoomId && <p className="hint">This is the dungeon's entrance room.</p>}
      {id === bossRoomId && <p className="hint">This is the boss room.</p>}

      <label className="field">
        <span>X: {Math.round(room.x)}</span>
        <input type="number" className="input" value={Math.round(room.x)} onFocus={snapshot} onChange={(e) => resizeRoom(id, { x: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>Y: {Math.round(room.y)}</span>
        <input type="number" className="input" value={Math.round(room.y)} onFocus={snapshot} onChange={(e) => resizeRoom(id, { y: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>Width: {Math.round(room.w)}</span>
        <input
          type="number"
          className="input"
          min={20}
          value={Math.round(room.w)}
          onFocus={snapshot}
          onChange={(e) => resizeRoom(id, { w: Math.max(20, Number(e.target.value)) })}
        />
      </label>
      <label className="field">
        <span>Height: {Math.round(room.h)}</span>
        <input
          type="number"
          className="input"
          min={20}
          value={Math.round(room.h)}
          onFocus={snapshot}
          onChange={(e) => resizeRoom(id, { h: Math.max(20, Number(e.target.value)) })}
        />
      </label>

      <p className="hint">
        Drag the room's body to move it, or a corner handle to resize it, while the <b>Room</b> tool is active.
      </p>

      <EncounterEditor room={room} />

      <button className="btn danger full" onClick={() => deleteRoom(id)}>
        🗑 Delete room
      </button>
    </>
  )
}

/** A short, human description of one end of a hallway — a room (named by
 *  its special role if it has one), or a junction where other hallways
 *  meet (created when a connected room was deleted). */
function endpointLabel(scene: DungeonScene, endpoint: ConnectionEndpoint): string {
  if (endpoint.kind === 'junction') return 'a junction with other hallways'
  const room = scene.rooms.find((r) => r.id === endpoint.id)
  if (!room) return 'a room (no longer here)'
  if (room.id === scene.entranceRoomId) return 'the entrance room'
  if (room.id === scene.bossRoomId) return 'the boss room'
  return 'a room'
}

function ConnectionEditor({ id }: { id: string }) {
  const connection = useDungeonStore((s) => s.scene.connections.find((c) => c.id === id))
  const scene = useDungeonStore((s) => s.scene)
  const deleteConnection = useDungeonStore((s) => s.deleteConnection)

  if (!connection) return <p className="hint">Hallway not found.</p>

  return (
    <>
      <h2 className="panel-h">Hallway</h2>
      <p className="field-static">
        Connects {endpointLabel(scene, connection.a)} to {endpointLabel(scene, connection.b)}.
      </p>
      <p className="hint">
        A hallway is pathed automatically between its two ends — there's nothing to drag or resize directly. Moving either
        connected room repaths it to follow; deleting a connected room merges its hallways at a shared junction instead of
        leaving them dangling.
      </p>
      <button className="btn danger full" onClick={() => deleteConnection(id)}>
        🗑 Delete hallway
      </button>
    </>
  )
}

function DoorEditor({ id }: { id: string }) {
  const door = useDungeonStore((s) => s.scene.doors.find((d) => d.id === id))
  const updateDoor = useDungeonStore((s) => s.updateDoor)
  const deleteDoor = useDungeonStore((s) => s.deleteDoor)

  if (!door) return <p className="hint">Door not found.</p>

  return (
    <>
      <h2 className="panel-h">Door</h2>

      <label className="check">
        <input
          type="checkbox"
          checked={door.open}
          onChange={(e) =>
            updateDoor(id, e.target.checked ? { open: true, secret: false, stuck: false, locked: 'none', trapped: 'none' } : { open: false })
          }
        />
        <span>Open (swung open — can't be secret, stuck, locked, or trapped)</span>
      </label>

      {!door.open && (
        <>
          <label className="check">
            <input type="checkbox" checked={door.secret} onChange={(e) => updateDoor(id, { secret: e.target.checked })} />
            <span>Secret</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={door.stuck} onChange={(e) => updateDoor(id, { stuck: e.target.checked })} />
            <span>Stuck</span>
          </label>

          <label className="field">
            <span>Locked</span>
            <select className="input" value={door.locked} onChange={(e) => updateDoor(id, { locked: e.target.value as SecurityKind })}>
              {SECURITY_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Trapped</span>
            <select className="input" value={door.trapped} onChange={(e) => updateDoor(id, { trapped: e.target.value as SecurityKind })}>
              {SECURITY_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <button className="btn danger full" onClick={() => deleteDoor(id)}>
        🗑 Delete door
      </button>
    </>
  )
}

function StairEditor({ id }: { id: string }) {
  const stair = useDungeonStore((s) => s.scene.stairs.find((st) => st.id === id))
  const deleteStair = useDungeonStore((s) => s.deleteStair)

  if (!stair) return <p className="hint">Stair not found.</p>

  return (
    <>
      <h2 className="panel-h">Stairway</h2>
      <p className="field-static">
        Level {stair.levelFrom + 1} ↔ Level {stair.levelTo + 1}
      </p>
      <p className="hint">Deleting this only removes the stair markers — it doesn't reconnect the two levels any other way.</p>
      <button className="btn danger full" onClick={() => deleteStair(id)}>
        🗑 Delete stairway
      </button>
    </>
  )
}

const TOOL_HINTS: Record<string, string> = {
  select: 'Click a room, hallway, door, or stairway on the map to inspect or edit it.',
  room: 'Drag empty space to add a room. Click an existing room to select it, drag its body to move it, or drag a corner to resize it.',
  corridor:
    'Click a room, then click another room, to path a hallway between them — closed doors are added automatically at both ends. Click the same room again to cancel.',
}

export function DungeonSelectionPanel() {
  const selection = useDungeonStore((s) => s.selection)
  const tool = useDungeonStore((s) => s.tool)
  const pendingConnection = useDungeonStore((s) => s.pendingConnection)

  const hint = tool === 'corridor' && pendingConnection ? 'Click another room to connect it, or click the highlighted room again to cancel.' : TOOL_HINTS[tool]

  return (
    <div className="panel">
      {!selection && <p className="hint">{hint}</p>}
      {selection?.kind === 'room' && <RoomEditor id={selection.id} />}
      {selection?.kind === 'connection' && <ConnectionEditor id={selection.id} />}
      {selection?.kind === 'door' && <DoorEditor id={selection.id} />}
      {selection?.kind === 'stair' && <StairEditor id={selection.id} />}
    </div>
  )
}
