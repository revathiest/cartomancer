import type { Rng } from '../generation/rng.ts'
import type { Point } from '../shared/types.ts'
import type { Corridor, Door, Room, SecurityKind } from './types.ts'

// ---------------------------------------------------------------------------
// Grid-based corridor routing, shared by the procedural generator AND manual
// edit-mode connection creation/repathing — rooms are rasterized into an
// owner grid, and every corridor is pathed through cells that belong to no
// OTHER room, so a corridor can only ever meet a room at the ends it's
// actually connecting, never cut across a third room's floor.
// ---------------------------------------------------------------------------

export type OwnerGrid = { data: Int32Array; w: number; h: number }
export type Cell = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

/** World units per grid cell — keeps dungeon scale in the same ballpark as
 *  city maps. Lives here (not in generateDungeon.ts, which re-exports it for
 *  existing callers) since grid/world conversion is fundamentally a pathing
 *  concept, needed by manual edit-mode connection ops too. */
export const CELL_SIZE = 20

export function toGridRect(r: Rect): Rect {
  return { x: Math.floor(r.x / CELL_SIZE), y: Math.floor(r.y / CELL_SIZE), w: Math.round(r.w / CELL_SIZE), h: Math.round(r.h / CELL_SIZE) }
}

export function toWorldRect(r: Rect): Rect {
  return { x: r.x * CELL_SIZE, y: r.y * CELL_SIZE, w: r.w * CELL_SIZE, h: r.h * CELL_SIZE }
}

export function toGridPoint(p: Point): Point {
  return { x: Math.floor(p.x / CELL_SIZE), y: Math.floor(p.y / CELL_SIZE) }
}

export function toWorldPoint(p: Point): Point {
  return { x: p.x * CELL_SIZE, y: p.y * CELL_SIZE }
}

/** A door's grid-space `pos` is cell-center-indexed — an integer means a
 *  cell's center, a half-integer (as `connectEndpoints`/`tieIntoCells`
 *  always produce, being the midpoint between two adjacent cells) means the
 *  boundary between two cells — so converting it to world space needs the
 *  extra `+0.5` plain `toWorldPoint` doesn't do. Matches the convention
 *  generateDungeon.ts's final conversion pass already uses. */
export function toWorldDoorPos(p: Point): Point {
  return { x: (p.x + 0.5) * CELL_SIZE, y: (p.y + 0.5) * CELL_SIZE }
}

export function buildOwnerGrid(rooms: Room[], w: number, h: number): OwnerGrid {
  const data = new Int32Array(w * h).fill(-1)
  rooms.forEach((room, index) => {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        if (x >= 0 && y >= 0 && x < w && y < h) data[y * w + x] = index
      }
    }
  })
  return { data, w, h }
}

export function ownerAt(grid: OwnerGrid, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return -2 // out of bounds — never passable
  return grid.data[y * grid.w + x]
}

/** Marks every cell of `rect` as permanently blocked (never free, never
 *  owned by a room) so corridor pathfinding routes around it. */
export function markReserved(grid: OwnerGrid, rect: Rect): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (x >= 0 && y >= 0 && x < grid.w && y < grid.h) grid.data[y * grid.w + x] = -3
    }
  }
}

/** Marks every cell of a just-drawn corridor — plus a 1-cell buffer around
 *  it — as occupied, so a LATER connect call's pathfinding can't route
 *  through or immediately alongside it. Without this, two separate
 *  connections can end up touching, which the corridor-union rendering then
 *  fuses into one blob — making it look like a room has two doors into "the
 *  same hallway" when they're really two distinct connections. Only free
 *  (-1) cells are claimed; room interiors are never touched. */
export function markCorridorOccupied(grid: OwnerGrid, cells: Set<string>): void {
  for (const key of cells) {
    const [cx, cy] = key.split(',').map(Number)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue
        if (grid.data[y * grid.w + x] === -1) grid.data[y * grid.w + x] = -4
      }
    }
  }
}

/** Removes a corridor's own claimed territory (both its floor cells and the
 *  1-cell buffer `markCorridorOccupied` laid around them) back to free (-1)
 *  — used before repathing a connection, so its OLD route doesn't block its
 *  OWN new route. Only clears cells that are still marked "occupied" (-4);
 *  never touches a room or a cell some other corridor has since claimed. */
export function unmarkCorridorOccupied(grid: OwnerGrid, cells: Set<string>): void {
  for (const key of cells) {
    const [cx, cy] = key.split(',').map(Number)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) continue
        if (grid.data[y * grid.w + x] === -4) grid.data[y * grid.w + x] = -1
      }
    }
  }
}

export type PathGoal = { cell: Cell } | { cells: Set<string> }

function goalReached(goal: PathGoal, x: number, y: number): boolean {
  if ('cell' in goal) return x === goal.cell.x && y === goal.cell.y
  return goal.cells.has(`${x},${y}`)
}

/** BFS from `start` to `goal` — a fixed cell, or "any cell in this set" (used
 *  to tie a new hallway into the SIDE of an existing one, forming a T,
 *  rather than a specific endpoint). `passIdx` lists owner-grid indices that
 *  count as passable "as yourself" in addition to free (-1) cells — the
 *  start/end room's own index; empty when that end is a junction or a bare
 *  point (nothing there to walk through, free space already covers it). */
export function findPath(grid: OwnerGrid, start: Cell, goal: PathGoal, passIdx: number[], allowOccupied: boolean): Cell[] | null {
  const passable = (x: number, y: number) => {
    const owner = ownerAt(grid, x, y)
    if (owner === -1 || passIdx.includes(owner)) return true
    return allowOccupied && owner === -4 // cells within a buffer of an EARLIER corridor
  }

  const key = (x: number, y: number) => y * grid.w + x
  const visited = new Set<number>([key(start.x, start.y)])
  const cameFrom = new Map<number, Cell>()
  const queue: Cell[] = [start]
  let head = 0

  while (head < queue.length) {
    const cur = queue[head++]
    if (goalReached(goal, cur.x, cur.y)) {
      const path: Cell[] = [cur]
      let k = key(cur.x, cur.y)
      while (cameFrom.has(k)) {
        const p = cameFrom.get(k)!
        path.push(p)
        k = key(p.x, p.y)
      }
      return path.reverse()
    }
    const neighbors: Cell[] = [
      { x: cur.x + 1, y: cur.y },
      { x: cur.x - 1, y: cur.y },
      { x: cur.x, y: cur.y + 1 },
      { x: cur.x, y: cur.y - 1 },
    ]
    for (const n of neighbors) {
      const k = key(n.x, n.y)
      if (visited.has(k)) continue
      if (!passable(n.x, n.y)) continue
      visited.add(k)
      cameFrom.set(k, cur)
      queue.push(n)
    }
  }
  return null
}

/** Widens a centerline path into a `width`-cell-thick ribbon, clamping the
 *  perpendicular extent at every step so it never spills onto a foreign
 *  room's floor. Only free (unclaimed) cells are kept — the portions of the
 *  path still inside a connected room are already covered by that room's own
 *  rectangle. `allowOccupied` must match whatever `findPath` used to find
 *  this path, or the two disagree: the path connects the endpoints but the
 *  rendered corridor has a hole in it, leaving a disconnected fragment. */
export function widenPath(path: Cell[], grid: OwnerGrid, width: number, passIdx: number[], allowOccupied: boolean): Set<string> {
  const cells = new Set<string>()
  const lo = -Math.floor((width - 1) / 2)
  const hi = Math.ceil((width - 1) / 2)

  for (let i = 0; i < path.length; i++) {
    const cur = path[i]
    const next = path[i + 1] ?? path[i - 1] ?? cur
    const horizontalMove = next.y === cur.y
    const perp = horizontalMove ? { x: 0, y: 1 } : { x: 1, y: 0 }

    for (let k = lo; k <= hi; k++) {
      const px = cur.x + perp.x * k
      const py = cur.y + perp.y * k
      const owner = ownerAt(grid, px, py)
      const occupied = allowOccupied && owner === -4
      if (owner !== -1 && !passIdx.includes(owner) && !occupied) continue // would spill onto a foreign room
      if (owner === -1 || occupied) cells.add(`${px},${py}`)
    }
  }
  return cells
}

/** Merges a set of grid cells into axis-aligned rectangles: first into
 *  per-row runs, then stitches consecutive rows sharing the same run back
 *  together into one tall rectangle. Without this second pass a straight
 *  corridor comes out as a stack of 1-cell-tall strips, and the hand-drawn
 *  "rough" filter (which warps each shape relative to its OWN bounding box)
 *  turns that into a rung-ladder mess instead of one continuous hallway. */
export function cellsToRects(cells: Set<string>): Rect[] {
  const byRow = new Map<number, number[]>()
  for (const key of cells) {
    const [x, y] = key.split(',').map(Number)
    if (!byRow.has(y)) byRow.set(y, [])
    byRow.get(y)!.push(x)
  }

  const rowRuns: { x: number; y: number; w: number }[] = []
  for (const [y, xs] of byRow) {
    xs.sort((a, b) => a - b)
    let runStart = xs[0]
    let prev = xs[0]
    for (let i = 1; i <= xs.length; i++) {
      const x = xs[i]
      if (x === prev + 1) {
        prev = x
        continue
      }
      rowRuns.push({ x: runStart, y, w: prev - runStart + 1 })
      if (i < xs.length) {
        runStart = x
        prev = x
      }
    }
  }

  const byRunShape = new Map<string, number[]>()
  for (const run of rowRuns) {
    const key = `${run.x},${run.w}`
    if (!byRunShape.has(key)) byRunShape.set(key, [])
    byRunShape.get(key)!.push(run.y)
  }

  const rects: Rect[] = []
  for (const [key, ys] of byRunShape) {
    const [x, w] = key.split(',').map(Number)
    ys.sort((a, b) => a - b)
    let start = ys[0]
    let prev = ys[0]
    for (let i = 1; i <= ys.length; i++) {
      const y = ys[i]
      if (y === prev + 1) {
        prev = y
        continue
      }
      rects.push({ x, y: start, w, h: prev - start + 1 })
      if (i < ys.length) {
        start = y
        prev = y
      }
    }
  }
  return rects
}

const LOCK_WEIGHTS: readonly [SecurityKind, number][] = [
  ['none', 70],
  ['mundane', 22],
  ['magical', 8],
]
const TRAP_WEIGHTS: readonly [SecurityKind, number][] = [
  ['none', 85],
  ['mundane', 10],
  ['magical', 5],
]

type DoorFlags = Pick<Door, 'open' | 'secret' | 'stuck' | 'locked' | 'trapped'>

/** Rolls every door flag independently, EXCEPT `open` — an open door has
 *  demonstrably no lock, trap, or stuck mechanism, so those force off. Used
 *  for procedurally generated doors; hand-added ones (the new
 *  connect-two-rooms tool, and repathing) always start fully closed instead
 *  — see `closedDoorFlags`. */
export function rollDoorFlags(rng: Rng): DoorFlags {
  const open = rng.next() < 0.15
  if (open) return { open: true, secret: false, stuck: false, locked: 'none', trapped: 'none' }
  return {
    open: false,
    secret: rng.next() < 0.06,
    stuck: rng.next() < 0.1,
    locked: rng.weighted(LOCK_WEIGHTS),
    trapped: rng.weighted(TRAP_WEIGHTS),
  }
}

export function closedDoorFlags(): DoorFlags {
  return { open: false, secret: false, stuck: false, locked: 'none', trapped: 'none' }
}

/** One side of a connection being pathed: a room (gets a door, and its
 *  interior is walkable "as itself"), or a bare point — a junction, or a
 *  cell on the map with no room there — which gets no door and no special
 *  walkable interior. `nextId`/`level` aren't part of this shape since the
 *  caller stamps those on afterward. */
export type PathEndpoint = { kind: 'room'; room: Room; idx: number } | { kind: 'point'; cell: Cell }

function endpointCell(e: PathEndpoint): Cell {
  return e.kind === 'room' ? { x: Math.floor(e.room.x + e.room.w / 2), y: Math.floor(e.room.y + e.room.h / 2) } : e.cell
}

export type ConnectOptions = {
  /** Tree edges (required for connectivity) skip the buffer entirely and
   *  always take the direct route — a required connection shouldn't be
   *  distorted, or worse, forced into a long wraparound detour, just to
   *  avoid touching another corridor. Optional edges (loops, manual
   *  connections) respect it, so they don't fuse with an existing corridor
   *  and create a duplicate door into "the same hallway". */
  respectBuffer: boolean
  /** If the routed path ends up more than this many times the straight-line
   *  cell distance between the two endpoints, the connection is discarded
   *  entirely rather than drawing a hallway that wraps halfway around the
   *  map to avoid other corridors. */
  maxPathLength?: number
}

export type ConnectResult =
  | { success: true; corridors: Corridor[]; doors: Door[]; doorAId: string | null; doorBId: string | null }
  | { success: false }

/** Paths, widens, and rectangularizes a corridor between two endpoints (each
 *  a room or a bare point — a junction, or a T-tie-in target), and creates a
 *  door at each end that's a ROOM (never at a point/junction end). This is
 *  the one routine both the procedural generator and manual edit-mode
 *  connection creation/repathing go through, so they always behave
 *  identically. Corridor/door ids are minted via `nextId`; the caller stamps
 *  `level` and (for corridors) `connectionId` on afterward, since this
 *  function doesn't know which connection it's building yet when called for
 *  a brand new one. */
export function connectEndpoints(
  from: PathEndpoint,
  to: PathEndpoint,
  grid: OwnerGrid,
  width: number,
  doorFlags: 'random' | 'closed',
  rng: Rng,
  options: ConnectOptions,
  nextId: (prefix: string) => string,
): ConnectResult {
  const start = endpointCell(from)
  const passStart = from.kind === 'room' ? [from.idx] : []
  const passEnd = to.kind === 'room' ? [to.idx] : []
  const passIdx = [...passStart, ...passEnd]
  const goal: PathGoal = { cell: endpointCell(to) }

  let usedFallback = !options.respectBuffer
  let path = options.respectBuffer ? findPath(grid, start, goal, passIdx, false) : null
  if (!path) {
    path = findPath(grid, start, goal, passIdx, true)
    usedFallback = true
  }
  if (!path) return { success: false }
  if (options.maxPathLength !== undefined && path.length > options.maxPathLength) return { success: false }

  const cells = widenPath(path, grid, width, passIdx, usedFallback)
  const corridors: Corridor[] = cellsToRects(cells).map((rect) => ({
    id: nextId('corridor'),
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    level: 0,
    connectionId: '',
  }))
  markCorridorOccupied(grid, cells)

  // A door belongs on the WALL — the boundary between a room cell and the
  // first cell that isn't part of that room — not out in the corridor. Walk
  // the centerline and drop one at every point ROOM MEMBERSHIP changes,
  // positioned at the midpoint between the two cells so it lands exactly on
  // their shared edge. A transition only counts against a "point" endpoint
  // if it's literally the other side's room boundary — a point/junction end
  // never gets a door of its own.
  const roomOf = (owner: number) => (owner === (from.kind === 'room' ? from.idx : -99) || owner === (to.kind === 'room' ? to.idx : -99) ? owner : null)
  const doors: Door[] = []
  let doorAId: string | null = null
  let doorBId: string | null = null
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1]
    const cur = path[i]
    const prevRoom = roomOf(ownerAt(grid, prev.x, prev.y))
    const curRoom = roomOf(ownerAt(grid, cur.x, cur.y))
    if (prevRoom === curRoom) continue
    const doorId = nextId('door')
    doors.push({
      id: doorId,
      pos: { x: (prev.x + cur.x) / 2, y: (prev.y + cur.y) / 2 },
      orientation: prev.y === cur.y ? 'vertical' : 'horizontal',
      level: 0,
      ...(doorFlags === 'random' ? rollDoorFlags(rng) : closedDoorFlags()),
    })
    if (from.kind === 'room' && (prevRoom === from.idx || curRoom === from.idx)) doorAId = doorId
    if (to.kind === 'room' && (prevRoom === to.idx || curRoom === to.idx)) doorBId = doorId
  }

  return { success: true, corridors, doors, doorAId, doorBId }
}

export function roomCenter(r: Room): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

/** Every grid cell a (grid-space) rect covers — used to build the target
 *  cell set for a T-tie-in: "path to wherever is nearest on any of these
 *  other hallways," not a specific point. */
export function rectCells(r: Rect): Set<string> {
  const cells = new Set<string>()
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) cells.add(`${x},${y}`)
  }
  return cells
}

export type TieInResult = { success: true; corridors: Corridor[]; door: Door | null } | { success: false }

/** Paths from one endpoint to the NEAREST cell in `targetCells` (rather than
 *  a specific endpoint) — ties a new hallway into the side of an existing
 *  one, forming a T, instead of converging on one exact point. Only ever
 *  creates a door on the `from` side, if it's a room — merging into
 *  existing corridor floor is never a threshold worth a door. */
export function tieIntoCells(
  from: PathEndpoint,
  targetCells: Set<string>,
  grid: OwnerGrid,
  width: number,
  nextId: (prefix: string) => string,
): TieInResult {
  const start = endpointCell(from)
  const passIdx = from.kind === 'room' ? [from.idx] : []
  const goal: PathGoal = { cells: targetCells }

  let path = findPath(grid, start, goal, passIdx, false)
  let usedFallback = false
  if (!path) {
    path = findPath(grid, start, goal, passIdx, true)
    usedFallback = true
  }
  if (!path) return { success: false }

  const cells = widenPath(path, grid, width, passIdx, usedFallback)
  const corridors: Corridor[] = cellsToRects(cells).map((rect) => ({
    id: nextId('corridor'),
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    level: 0,
    connectionId: '',
  }))
  markCorridorOccupied(grid, cells)

  let door: Door | null = null
  if (from.kind === 'room') {
    const roomOf = (owner: number) => (owner === from.idx ? owner : null)
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1]
      const cur = path[i]
      const prevRoom = roomOf(ownerAt(grid, prev.x, prev.y))
      const curRoom = roomOf(ownerAt(grid, cur.x, cur.y))
      if (prevRoom === curRoom) continue
      door = {
        id: nextId('door'),
        pos: { x: (prev.x + cur.x) / 2, y: (prev.y + cur.y) / 2 },
        orientation: prev.y === cur.y ? 'vertical' : 'horizontal',
        level: 0,
        ...closedDoorFlags(),
      }
      break // the path leaves the FROM room exactly once — first transition is the door
    }
  }

  return { success: true, corridors, door }
}
