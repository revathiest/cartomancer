import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { makeRng } from '../generation/rng.ts'
import type { Point } from '../shared/types.ts'
import type { DungeonParams, DungeonScene, Room, Door, Corridor, Connection, ConnectionEndpoint, Junction, RoomEncounter } from './types.ts'
import { defaultDungeonParams, generateDungeon, rerollEncounters as rerollEncountersInScene, legendReservedRect } from './generateDungeon.ts'
import { RANDOMIZABLE_KEYS, SLIDER_RANGES, type RandomizableKey } from './sliderRanges.ts'
import { emptyHistory, record, cloneScene, type History } from './history.ts'
import {
  buildOwnerGrid,
  markReserved,
  connectEndpoints,
  tieIntoCells,
  rectCells,
  roomCenter,
  toGridRect,
  toWorldRect,
  toGridPoint,
  toWorldPoint,
  toWorldDoorPos,
  type PathEndpoint,
  type OwnerGrid,
} from './pathing.ts'

const randomInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1))
const randomFloat = (min: number, max: number) => Number((min + Math.random() * (max - min)).toFixed(2))

type FlagMap = Record<RandomizableKey, boolean>
const allFlags = (value: boolean): FlagMap =>
  Object.fromEntries(RANDOMIZABLE_KEYS.map((k) => [k, value])) as FlagMap

/** Mirrors the city tool's generate/edit split — "generate" shows the
 *  slider panel and Generate button; "edit" shows the tool palette and
 *  selection panel instead. */
export type DungeonEditMode = 'generate' | 'edit'
/** select: click an entity to inspect/edit its properties or delete it.
 *  room: click-drag empty space to add a room; drag an existing room's body
 *  to move it, or a corner handle to resize it.
 *  corridor: click one room, then another, to path a hallway between them —
 *  see `pendingConnection`. No freeform/unconnected corridors. */
export type DungeonEditTool = 'select' | 'room' | 'corridor'
export type DungeonSelectionKind = 'room' | 'connection' | 'door' | 'stair'
export type DungeonSelection = { kind: DungeonSelectionKind; id: string } | null

// Manual edit-mode connection ops never roll random door flags (doorFlags is
// always 'closed'), so this Rng is never actually consulted — it only
// exists because connectEndpoints's signature takes one for the procedural
// ('random') case too. A single shared instance is fine either way.
const manualRng = makeRng(1)
const nextManualId = (prefix: string) => `${prefix}-${nanoid(6)}`

/** Builds an owner grid for one level from the CURRENT scene state — used
 *  by every manual connection op (create/repath/delete-cascade) so they all
 *  path against exactly what's on the map right now, the same way the
 *  procedural generator paths against its in-progress layout. Deliberately
 *  does NOT mark other existing corridors as occupied territory (unlike
 *  generation's buffer pass) — crossing another hallway is normal and
 *  harmless here (they just visually fuse), and skipping it keeps this
 *  simple; only room interiors are hard obstacles. */
function buildLevelGrid(scene: DungeonScene, level: number, params: DungeonParams): { grid: OwnerGrid; roomIndex: Map<string, number>; gridRooms: Room[] } {
  const levelRooms = scene.rooms.filter((r) => r.level === level)
  const gridRooms: Room[] = levelRooms.map((r) => ({ ...toGridRect(r), id: r.id, level }))
  const roomIndex = new Map(gridRooms.map((r, i) => [r.id, i]))
  const grid = buildOwnerGrid(gridRooms, params.gridWidth, params.gridHeight)
  markReserved(grid, legendReservedRect(params))
  return { grid, roomIndex, gridRooms }
}

/** Every pathing helper (connectEndpoints, tieIntoCells) works entirely in
 *  grid space, same as the procedural generator's internals — its output
 *  needs the same grid→world conversion generateDungeon.ts applies at the
 *  very end before it's fit to merge into `scene`, which stores everything
 *  in world units. */
function toWorldCorridors(corridors: Corridor[], connectionId: string, level: number): Corridor[] {
  return corridors.map((c) => ({ ...toWorldRect(c), id: c.id, connectionId, level }))
}
function toWorldDoors(doors: Door[], level: number): Door[] {
  return doors.map((d) => ({ ...d, pos: toWorldDoorPos(d.pos), level }))
}

function endpointWorldPos(scene: DungeonScene, e: ConnectionEndpoint): Point | null {
  if (e.kind === 'room') {
    const room = scene.rooms.find((r) => r.id === e.id)
    return room ? roomCenter(room) : null
  }
  const junction = scene.junctions.find((j) => j.id === e.id)
  return junction ? junction.pos : null
}

function toGridEndpoint(scene: DungeonScene, gridRooms: Room[], roomIndex: Map<string, number>, e: ConnectionEndpoint): PathEndpoint | null {
  if (e.kind === 'room') {
    const idx = roomIndex.get(e.id)
    if (idx === undefined) return null
    return { kind: 'room', room: gridRooms[idx], idx }
  }
  const junction = scene.junctions.find((j) => j.id === e.id)
  if (!junction) return null
  return { kind: 'point', cell: toGridPoint(junction.pos) }
}

/** Removes a connection entirely — every corridor piece, both doors (either
 *  may already be gone/null), and the connection record itself. The
 *  fallback whenever a repath/cascade can't find a valid new path: leaving
 *  a connection pointing at a room that no longer exists isn't an option,
 *  so the whole hallway goes rather than dangling. */
function removeConnectionEntirely(scene: DungeonScene, connectionId: string): void {
  const connection = scene.connections.find((c) => c.id === connectionId)
  if (!connection) return
  scene.corridors = scene.corridors.filter((c) => c.connectionId !== connectionId)
  const doorIds = [connection.doorAId, connection.doorBId].filter((id): id is string => !!id)
  scene.doors = scene.doors.filter((d) => !doorIds.includes(d.id))
  scene.connections = scene.connections.filter((c) => c.id !== connectionId)
}

/** Re-paths one connection from scratch against the CURRENT position of
 *  both its endpoints — used after a connected room's move/resize drag
 *  ends. Always regenerates fresh (closed) doors rather than trying to
 *  preserve whatever flags the old ones had, since the door's position has
 *  to move along with the path; if no path can be found at all (e.g. the
 *  room was dragged somewhere that walls it off), the OLD geometry is put
 *  back rather than leaving the hallway deleted. Returns whether the
 *  repath actually changed anything. */
function repathConnection(scene: DungeonScene, connection: Connection, level: number): boolean {
  const oldCorridors = scene.corridors.filter((c) => c.connectionId === connection.id)
  scene.corridors = scene.corridors.filter((c) => c.connectionId !== connection.id)

  const { grid, roomIndex, gridRooms } = buildLevelGrid(scene, level, scene.params)
  const fromEp = toGridEndpoint(scene, gridRooms, roomIndex, connection.a)
  const toEp = toGridEndpoint(scene, gridRooms, roomIndex, connection.b)
  if (!fromEp || !toEp) {
    scene.corridors.push(...oldCorridors)
    return false
  }

  const result = connectEndpoints(fromEp, toEp, grid, scene.params.corridorWidth, 'closed', manualRng, { respectBuffer: false }, nextManualId)
  if (!result.success) {
    scene.corridors.push(...oldCorridors)
    return false
  }

  const oldDoorIds = [connection.doorAId, connection.doorBId].filter((id): id is string => !!id)
  scene.doors = scene.doors.filter((d) => !oldDoorIds.includes(d.id))
  const worldCorridors = toWorldCorridors(result.corridors, connection.id, level)
  scene.corridors.push(...worldCorridors)
  if (result.doors.length) scene.doors.push(...toWorldDoors(result.doors, level))
  connection.corridorIds = worldCorridors.map((c) => c.id)
  connection.doorAId = result.doorAId
  connection.doorBId = result.doorBId
  return true
}

/** The room-deletion cascade: every connection that touched the deleted
 *  room gets rerouted to a new junction dropped at the room's former
 *  center, so hallways stay joined to EACH OTHER instead of dead-ending in
 *  empty space — up to 4 of them meet directly at that junction (whichever
 *  4 are closest to the deleted room's center — simplest to path reliably);
 *  any beyond that tee into the side of one of those 4 instead of all
 *  converging on one point. A connection whose repath/tie-in genuinely
 *  can't find a path is removed outright rather than left dangling. */
function cascadeDeleteRoom(scene: DungeonScene, roomId: string, params: DungeonParams): void {
  const room = scene.rooms.find((r) => r.id === roomId)
  if (!room) return
  const level = room.level
  const touching = scene.connections.filter((c) => (c.a.kind === 'room' && c.a.id === roomId) || (c.b.kind === 'room' && c.b.id === roomId))

  scene.rooms = scene.rooms.filter((r) => r.id !== roomId)
  if (scene.entranceRoomId === roomId) {
    scene.entranceRoomId = null
    scene.entranceSide = null
  }
  if (scene.bossRoomId === roomId) scene.bossRoomId = null

  if (touching.length === 0) return

  const centerWorld = roomCenter(room)
  const junctionId = nextManualId('junction')

  const withDist = touching
    .map((connection) => {
      const deletedIsA = connection.a.kind === 'room' && connection.a.id === roomId
      const otherEnd = deletedIsA ? connection.b : connection.a
      const pos = endpointWorldPos(scene, otherEnd)
      const dist = pos ? Math.hypot(pos.x - centerWorld.x, pos.y - centerWorld.y) : Infinity
      return { connection, otherEnd, deletedIsA, dist }
    })
    .sort((a, b) => a.dist - b.dist)

  const direct = withDist.slice(0, 4)
  const overflow = withDist.slice(4)

  // Every touched connection's OLD corridor pieces are being replaced (or
  // the connection removed outright) — clear them all up front. The
  // deleted-room-side door of each goes too; junctions never have doors.
  const touchedIds = new Set(touching.map((c) => c.id))
  scene.corridors = scene.corridors.filter((c) => !touchedIds.has(c.connectionId))
  const deletedSideDoorIds = new Set<string>()
  for (const { connection, deletedIsA } of withDist) {
    const doorId = deletedIsA ? connection.doorAId : connection.doorBId
    if (doorId) deletedSideDoorIds.add(doorId)
  }
  scene.doors = scene.doors.filter((d) => !deletedSideDoorIds.has(d.id))

  const { grid, roomIndex, gridRooms } = buildLevelGrid(scene, level, params)
  const junctionEndpoint: PathEndpoint = { kind: 'point', cell: toGridPoint(centerWorld) }
  let junctionUsed = false

  for (const { connection, otherEnd, deletedIsA } of direct) {
    const fromEp = toGridEndpoint(scene, gridRooms, roomIndex, otherEnd)
    if (!fromEp) {
      removeConnectionEntirely(scene, connection.id)
      continue
    }
    const result = connectEndpoints(fromEp, junctionEndpoint, grid, params.corridorWidth, 'closed', manualRng, { respectBuffer: false }, nextManualId)
    if (!result.success) {
      removeConnectionEntirely(scene, connection.id)
      continue
    }
    const worldCorridors = toWorldCorridors(result.corridors, connection.id, level)
    scene.corridors.push(...worldCorridors)
    if (result.doors.length) scene.doors.push(...toWorldDoors(result.doors, level))
    connection.corridorIds = worldCorridors.map((c) => c.id)
    if (deletedIsA) {
      connection.a = { kind: 'junction', id: junctionId }
      connection.doorAId = null
      connection.doorBId = result.doorAId // the surviving side's fresh door, if it's a room
    } else {
      connection.b = { kind: 'junction', id: junctionId }
      connection.doorBId = null
      connection.doorAId = result.doorAId
    }
    junctionUsed = true
  }

  if (overflow.length > 0) {
    const directCells = new Set<string>()
    for (const { connection } of direct) {
      for (const cid of connection.corridorIds) {
        const corridor = scene.corridors.find((c) => c.id === cid)
        if (corridor) for (const cell of rectCells(toGridRect(corridor))) directCells.add(cell)
      }
    }
    for (const { connection, otherEnd, deletedIsA } of overflow) {
      const fromEp = toGridEndpoint(scene, gridRooms, roomIndex, otherEnd)
      if (!fromEp || directCells.size === 0) {
        removeConnectionEntirely(scene, connection.id)
        continue
      }
      const result = tieIntoCells(fromEp, directCells, grid, params.corridorWidth, nextManualId)
      if (!result.success) {
        removeConnectionEntirely(scene, connection.id)
        continue
      }
      // Computed from the pre-conversion grid-space rect — toWorldPoint
      // expects grid units in, world units out.
      const lastRect = result.corridors[result.corridors.length - 1]
      const tiePos = lastRect ? toWorldPoint({ x: lastRect.x + lastRect.w / 2, y: lastRect.y + lastRect.h / 2 }) : centerWorld
      const worldCorridors = toWorldCorridors(result.corridors, connection.id, level)
      scene.corridors.push(...worldCorridors)
      const tieJunctionId = nextManualId('junction')
      const tieJunction: Junction = { id: tieJunctionId, level, pos: tiePos }
      scene.junctions.push(tieJunction)
      connection.corridorIds = worldCorridors.map((c) => c.id)
      const worldDoor = result.door ? toWorldDoors([result.door], level)[0] : null
      if (worldDoor) scene.doors.push(worldDoor)
      if (deletedIsA) {
        connection.a = { kind: 'junction', id: tieJunctionId }
        connection.doorAId = null
        connection.doorBId = result.door?.id ?? null
      } else {
        connection.b = { kind: 'junction', id: tieJunctionId }
        connection.doorBId = null
        connection.doorAId = result.door?.id ?? null
      }
    }
  }

  if (junctionUsed) scene.junctions.push({ id: junctionId, level, pos: centerWorld })
}

type DungeonStore = {
  params: DungeonParams
  scene: DungeonScene
  randomizeSeedOnGenerate: boolean
  /** Sliders excluded from "generate" randomization even if flagged. */
  paramLocks: FlagMap
  /** Sliders that get a fresh random value each time "Generate" is clicked. */
  paramRandomize: FlagMap
  setParams: (patch: Partial<DungeonParams>) => void
  randomizeSeed: () => void
  setRandomizeSeedOnGenerate: (on: boolean) => void
  toggleLock: (key: RandomizableKey) => void
  toggleRandomize: (key: RandomizableKey) => void
  regenerate: () => void
  /** The main "Generate Dungeon" action: randomizes the seed (if enabled) and
   *  any unlocked, randomize-flagged sliders, then rebuilds the scene. */
  generateNew: () => void
  /** Re-rolls every room's monster/loot note without touching the layout. */
  rerollEncounters: () => void
  showRoomNotes: boolean
  toggleShowRoomNotes: () => void
  /** Which stacked level is currently displayed — clamped back to 0 whenever
   *  a fresh scene is generated, since a previously-valid level may no
   *  longer exist if levelCount shrank. */
  currentLevel: number
  setCurrentLevel: (level: number) => void

  mode: DungeonEditMode
  setMode: (mode: DungeonEditMode) => void
  tool: DungeonEditTool
  setTool: (tool: DungeonEditTool) => void
  selection: DungeonSelection
  select: (selection: DungeonSelection) => void
  deleteSelected: () => void

  history: History
  hasManualEdits: boolean
  /** Records an undo point without changing anything else — call once at
   *  the START of a drag/gesture, before any `mutate()` calls for it. */
  snapshot: () => void
  /** Applies `fn` to a clone of the current scene WITHOUT recording history
   *  — for the continuous steps of an already-snapshotted drag. */
  mutate: (fn: (scene: DungeonScene) => void) => void
  /** Records history, then applies `fn` — for atomic one-shot edits
   *  (add/delete/flag toggle) that are inherently a single undo step. */
  recordMutate: (fn: (scene: DungeonScene) => void) => void
  undo: () => void
  redo: () => void
  /** Loads a previously-saved scene, dropping into edit mode on it — same
   *  as the city tool's `loadScene`. */
  loadScene: (scene: DungeonScene) => void

  addRoom: (rect: { x: number; y: number; w: number; h: number }) => string
  moveRoom: (id: string, dx: number, dy: number) => void
  resizeRoom: (id: string, patch: Partial<Pick<Room, 'x' | 'y' | 'w' | 'h'>>) => void
  /** Replaces a room's monster/loot note wholesale — the sidebar's Encounter
   *  editor rebuilds the whole `monsters`/`loot` pair on every field change
   *  rather than patching in place, since both are plain arrays/values, not
   *  keyed objects. */
  updateRoomEncounter: (id: string, encounter: RoomEncounter | null) => void
  deleteRoom: (id: string) => void
  /** Re-paths every connection touching this room against its CURRENT
   *  position/size — call once when a move/resize drag ends, not on every
   *  intermediate step (repathing is a real grid search, too slow to run
   *  on every pointermove). */
  repathRoomConnections: (roomId: string) => void

  /** First click of the Corridor tool's "connect two rooms" flow sets this;
   *  the second click (via `clickConnectionRoom`) consumes it. */
  pendingConnection: { roomId: string } | null
  /** Handles one room click while the Corridor tool is active: first click
   *  starts a pending connection, a second click on a DIFFERENT room paths
   *  a hallway between them (closed doors auto-added at both room ends),
   *  clicking the SAME room cancels. Already-connected room pairs are
   *  blocked outright — no second parallel hallway, and the existing one
   *  isn't reselected either. */
  clickConnectionRoom: (roomId: string) => void
  cancelConnection: () => void
  deleteConnection: (id: string) => void

  addDoor: (door: Omit<Door, 'id'>) => string
  updateDoor: (id: string, patch: Partial<Omit<Door, 'id'>>) => void
  deleteDoor: (id: string) => void

  deleteStair: (id: string) => void
}

const initialParams = defaultDungeonParams()

export const useDungeonStore = create<DungeonStore>((set, get) => ({
  params: initialParams,
  scene: generateDungeon(initialParams),
  randomizeSeedOnGenerate: false,
  // Locked by default — a slider only randomizes on Generate once you
  // explicitly unlock it and flag it below. Manual dragging always works
  // regardless of lock state; the lock only guards against auto-randomize.
  paramLocks: allFlags(true),
  paramRandomize: allFlags(false),
  setParams: (patch) => set((state) => ({ params: { ...state.params, ...patch } })),
  randomizeSeed: () => set((state) => ({ params: { ...state.params, seed: Math.floor(Math.random() * 1_000_000) } })),
  setRandomizeSeedOnGenerate: (on) => set({ randomizeSeedOnGenerate: on }),
  toggleLock: (key) => set((state) => ({ paramLocks: { ...state.paramLocks, [key]: !state.paramLocks[key] } })),
  toggleRandomize: (key) => set((state) => ({ paramRandomize: { ...state.paramRandomize, [key]: !state.paramRandomize[key] } })),
  regenerate: () =>
    set({
      scene: generateDungeon(get().params),
      currentLevel: 0,
      history: emptyHistory(),
      selection: null,
      pendingConnection: null,
      hasManualEdits: false,
    }),
  generateNew: () => {
    const { params, randomizeSeedOnGenerate, paramLocks, paramRandomize } = get()
    const patch: Partial<DungeonParams> = {}

    if (randomizeSeedOnGenerate) patch.seed = Math.floor(Math.random() * 1_000_000)
    patch.encounterSeed = Math.floor(Math.random() * 1_000_000)

    for (const key of RANDOMIZABLE_KEYS) {
      if (key === 'minRoomSize' || key === 'maxRoomSize') continue // handled together below
      if (paramRandomize[key] && !paramLocks[key]) {
        const [lo, hi] = SLIDER_RANGES[key]
        const isDecimal = key === 'loopChance' || key === 'monsterChance' || key === 'lootChance' || key === 'loopMaxDetour'
        patch[key] = isDecimal ? randomFloat(lo, hi) : randomInt(lo, hi)
      }
    }

    // Room-size bounds are coupled (min <= max) — randomize whichever side is
    // flagged and unlocked, then reconcile so the pair stays valid.
    const randMin = paramRandomize.minRoomSize && !paramLocks.minRoomSize
    const randMax = paramRandomize.maxRoomSize && !paramLocks.maxRoomSize
    if (randMin || randMax) {
      let min = randMin ? randomInt(...SLIDER_RANGES.minRoomSize) : params.minRoomSize
      let max = randMax ? randomInt(...SLIDER_RANGES.maxRoomSize) : params.maxRoomSize
      if (min > max) {
        if (randMin && randMax) [min, max] = [Math.min(min, max), Math.max(min, max)]
        else if (randMin) min = max
        else max = min
      }
      patch.minRoomSize = min
      patch.maxRoomSize = max
    }

    const nextParams = { ...params, ...patch }
    set({
      params: nextParams,
      scene: generateDungeon(nextParams),
      currentLevel: 0,
      history: emptyHistory(),
      selection: null,
      pendingConnection: null,
      hasManualEdits: false,
    })
  },
  rerollEncounters: () => {
    const newSeed = Math.floor(Math.random() * 1_000_000)
    const { partyLevel, partySize, monsterChance, lootChance } = get().params
    set((state) => ({
      scene: rerollEncountersInScene(state.scene, partyLevel, partySize, monsterChance, lootChance, newSeed),
      params: { ...state.params, partyLevel, partySize, monsterChance, lootChance, encounterSeed: newSeed },
    }))
  },
  showRoomNotes: true,
  toggleShowRoomNotes: () => set((state) => ({ showRoomNotes: !state.showRoomNotes })),
  currentLevel: 0,
  setCurrentLevel: (level) => set({ currentLevel: level }),

  mode: 'generate',
  setMode: (mode) => set({ mode, selection: null, tool: 'select', pendingConnection: null }),
  tool: 'select',
  setTool: (tool) => set({ tool, pendingConnection: null }),
  selection: null,
  select: (selection) => set({ selection }),
  deleteSelected: () => {
    const { selection } = get()
    if (!selection) return
    if (selection.kind === 'room') get().deleteRoom(selection.id)
    else if (selection.kind === 'connection') get().deleteConnection(selection.id)
    else if (selection.kind === 'door') get().deleteDoor(selection.id)
    else if (selection.kind === 'stair') get().deleteStair(selection.id)
  },

  history: emptyHistory(),
  hasManualEdits: false,
  snapshot: () => set((state) => ({ history: record(state.history, state.scene), hasManualEdits: true })),
  mutate: (fn) =>
    set((state) => {
      const draft = cloneScene(state.scene)
      fn(draft)
      return { scene: draft }
    }),
  recordMutate: (fn) =>
    set((state) => {
      const history = record(state.history, state.scene)
      const draft = cloneScene(state.scene)
      fn(draft)
      return { history, scene: draft, hasManualEdits: true }
    }),
  undo: () =>
    set((state) => {
      const { past, future } = state.history
      if (past.length === 0) return {}
      const previous = past[past.length - 1]
      return {
        scene: previous,
        history: { past: past.slice(0, -1), future: [cloneScene(state.scene), ...future] },
        selection: null,
      }
    }),
  redo: () =>
    set((state) => {
      const { past, future } = state.history
      if (future.length === 0) return {}
      const next = future[0]
      return {
        scene: next,
        history: { past: [...past, cloneScene(state.scene)], future: future.slice(1) },
        selection: null,
      }
    }),
  loadScene: (scene) =>
    set({
      scene,
      params: scene.params,
      mode: 'edit',
      tool: 'select',
      selection: null,
      pendingConnection: null,
      currentLevel: 0,
      history: emptyHistory(),
      hasManualEdits: false,
    }),

  addRoom: (rect) => {
    const id = nanoid(8)
    get().recordMutate((scene) => {
      scene.rooms.push({ id, ...rect, level: get().currentLevel })
    })
    return id
  },
  moveRoom: (id, dx, dy) =>
    get().mutate((scene) => {
      const room = scene.rooms.find((r) => r.id === id)
      if (room) {
        room.x += dx
        room.y += dy
      }
    }),
  resizeRoom: (id, patch) =>
    get().mutate((scene) => {
      const room = scene.rooms.find((r) => r.id === id)
      if (room) Object.assign(room, patch)
    }),
  updateRoomEncounter: (id, encounter) =>
    get().mutate((scene) => {
      const room = scene.rooms.find((r) => r.id === id)
      if (room) room.encounter = encounter
    }),
  deleteRoom: (id) =>
    get().recordMutate((scene) => {
      cascadeDeleteRoom(scene, id, scene.params)
    }),
  repathRoomConnections: (roomId) =>
    get().mutate((scene) => {
      const room = scene.rooms.find((r) => r.id === roomId)
      if (!room) return
      const touching = scene.connections.filter((c) => (c.a.kind === 'room' && c.a.id === roomId) || (c.b.kind === 'room' && c.b.id === roomId))
      for (const connection of touching) repathConnection(scene, connection, room.level)
    }),

  pendingConnection: null,
  cancelConnection: () => set({ pendingConnection: null }),
  clickConnectionRoom: (roomId) => {
    const { pendingConnection } = get()
    if (!pendingConnection) {
      set({ pendingConnection: { roomId } })
      return
    }
    if (pendingConnection.roomId === roomId) {
      set({ pendingConnection: null }) // clicked the same room again — cancel
      return
    }
    const aRoomId = pendingConnection.roomId
    const bRoomId = roomId
    set({ pendingConnection: null })

    const alreadyConnected = get().scene.connections.some(
      (c) =>
        (c.a.kind === 'room' && c.a.id === aRoomId && c.b.kind === 'room' && c.b.id === bRoomId) ||
        (c.a.kind === 'room' && c.a.id === bRoomId && c.b.kind === 'room' && c.b.id === aRoomId),
    )
    if (alreadyConnected) return // blocked outright — no second parallel hallway, no reselecting the existing one

    get().recordMutate((scene) => {
      const roomA = scene.rooms.find((r) => r.id === aRoomId)
      const roomB = scene.rooms.find((r) => r.id === bRoomId)
      if (!roomA || !roomB || roomA.level !== roomB.level) return
      const level = roomA.level
      const { grid, roomIndex, gridRooms } = buildLevelGrid(scene, level, scene.params)
      const aIdx = roomIndex.get(aRoomId)
      const bIdx = roomIndex.get(bRoomId)
      if (aIdx === undefined || bIdx === undefined) return
      const result = connectEndpoints(
        { kind: 'room', room: gridRooms[aIdx], idx: aIdx },
        { kind: 'room', room: gridRooms[bIdx], idx: bIdx },
        grid,
        scene.params.corridorWidth,
        'closed',
        manualRng,
        { respectBuffer: false },
        nextManualId,
      )
      if (!result.success) return
      const connectionId = nextManualId('connection')
      const worldCorridors = toWorldCorridors(result.corridors, connectionId, level)
      scene.corridors.push(...worldCorridors)
      scene.doors.push(...toWorldDoors(result.doors, level))
      scene.connections.push({
        id: connectionId,
        level,
        a: { kind: 'room', id: aRoomId },
        b: { kind: 'room', id: bRoomId },
        corridorIds: worldCorridors.map((c) => c.id),
        doorAId: result.doorAId,
        doorBId: result.doorBId,
      })
    })
  },
  deleteConnection: (id) =>
    get().recordMutate((scene) => {
      removeConnectionEntirely(scene, id)
    }),

  addDoor: (door) => {
    const id = nanoid(8)
    get().recordMutate((scene) => {
      scene.doors.push({ id, ...door })
    })
    return id
  },
  updateDoor: (id, patch) =>
    get().recordMutate((scene) => {
      const door = scene.doors.find((d) => d.id === id)
      if (door) Object.assign(door, patch)
    }),
  deleteDoor: (id) =>
    get().recordMutate((scene) => {
      scene.doors = scene.doors.filter((d) => d.id !== id)
    }),

  deleteStair: (id) =>
    get().recordMutate((scene) => {
      scene.stairs = scene.stairs.filter((s) => s.id !== id)
    }),
}))
