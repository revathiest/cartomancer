import type { DungeonParams, DungeonScene, Room, Corridor, Door, SecurityKind, Stair } from './types.ts'
import { makeRng, type Rng } from '../generation/rng.ts'
import { generateRoomEncounter, generateBossEncounter } from './encounters.ts'
import { LEGEND_WIDTH, LEGEND_HEIGHT, LEGEND_MARGIN } from './legendLayout.ts'

/** World units per grid cell — keeps dungeon scale in the same ballpark as city maps. */
export const CELL_SIZE = 20

type DoorFlags = Pick<Door, 'open' | 'secret' | 'stuck' | 'locked' | 'trapped'>

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

/** Rolls every door flag independently, EXCEPT `open` — an open door has
 *  demonstrably no lock, trap, or stuck mechanism, so those force off. */
function rollDoorFlags(rng: Rng): DoorFlags {
  const open = rng.next() < 0.15
  // A door is open XOR secret — an open door is demonstrably not hidden,
  // and a secret door is by definition closed (that's what makes it findable
  // as a discovery rather than just an open passage).
  if (open) return { open: true, secret: false, stuck: false, locked: 'none', trapped: 'none' }
  return {
    open: false,
    secret: rng.next() < 0.06,
    stuck: rng.next() < 0.1,
    locked: rng.weighted(LOCK_WEIGHTS),
    trapped: rng.weighted(TRAP_WEIGHTS),
  }
}

type BspNode = {
  x: number
  y: number
  w: number
  h: number
  left?: BspNode
  right?: BspNode
  room?: Room
}

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

/** Recursively partitions `node`, splitting along whichever axis is longer so
 *  leaves stay roughly square, and stops once a further split couldn't leave
 *  both halves big enough for a minimum-size room. */
function split(node: BspNode, depth: number, params: DungeonParams, rng: Rng): void {
  const minLeaf = params.minRoomSize + 2 // +margin so a room always fits with a 1-cell gap
  if (depth >= params.maxDepth) return
  if (node.w < minLeaf * 2 && node.h < minLeaf * 2) return

  const splitVertical = node.w > node.h ? true : node.w < node.h ? false : rng.next() < 0.5
  if (splitVertical) {
    if (node.w < minLeaf * 2) return
    const cut = Math.round(node.w * rng.range(0.4, 0.6))
    if (cut < minLeaf || node.w - cut < minLeaf) return
    node.left = { x: node.x, y: node.y, w: cut, h: node.h }
    node.right = { x: node.x + cut, y: node.y, w: node.w - cut, h: node.h }
  } else {
    if (node.h < minLeaf * 2) return
    const cut = Math.round(node.h * rng.range(0.4, 0.6))
    if (cut < minLeaf || node.h - cut < minLeaf) return
    node.left = { x: node.x, y: node.y, w: node.w, h: cut }
    node.right = { x: node.x, y: node.y + cut, w: node.w, h: node.h - cut }
  }

  split(node.left, depth + 1, params, rng)
  split(node.right, depth + 1, params, rng)
}

/** Places one room inside a leaf, sized within [minRoomSize, maxRoomSize] and
 *  clamped to fit the leaf with a 1-cell margin on every side. If the leaf
 *  overlaps the legend's reserved corner, the usable area is clipped down to
 *  whichever side (narrower-but-full-height, or shorter-but-full-width)
 *  still fits a room — or, if neither does, no room is placed in this leaf
 *  at all. */
function placeRoom(node: BspNode, params: DungeonParams, rng: Rng, reserved: { x: number; y: number; w: number; h: number }): Room | null {
  let usable = node
  const overlapsReserved = node.x + node.w > reserved.x && node.y + node.h > reserved.y
  if (overlapsReserved) {
    const minLeaf = params.minRoomSize + 2
    const widthClipped = { x: node.x, y: node.y, w: Math.max(0, reserved.x - node.x), h: node.h }
    const heightClipped = { x: node.x, y: node.y, w: node.w, h: Math.max(0, reserved.y - node.y) }
    if (widthClipped.w >= minLeaf) usable = widthClipped
    else if (heightClipped.h >= minLeaf) usable = heightClipped
    else return null // this leaf is entirely consumed by the reserved corner
  }

  const maxW = Math.max(params.minRoomSize, Math.min(params.maxRoomSize, usable.w - 2))
  const maxH = Math.max(params.minRoomSize, Math.min(params.maxRoomSize, usable.h - 2))
  const w = rng.int(params.minRoomSize, maxW)
  const h = rng.int(params.minRoomSize, maxH)
  const x = usable.x + rng.int(1, Math.max(1, usable.w - w - 1))
  const y = usable.y + rng.int(1, Math.max(1, usable.h - h - 1))
  const room: Room = { id: nextId('room'), x, y, w, h, level: 0 } // level tag overwritten by generateDungeon's per-level pass
  node.room = room
  return room
}

/** Depth-first: places rooms in every leaf, returning the flat list. A leaf
 *  fully consumed by the legend's reserved corner simply contributes no room. */
function placeRooms(
  node: BspNode,
  params: DungeonParams,
  rng: Rng,
  reserved: { x: number; y: number; w: number; h: number },
  out: Room[],
): void {
  if (node.left && node.right) {
    placeRooms(node.left, params, rng, reserved, out)
    placeRooms(node.right, params, rng, reserved, out)
  } else {
    const room = placeRoom(node, params, rng, reserved)
    if (room) out.push(room)
  }
}

/** Gathers every room placed anywhere under `node`. */
function roomsInSubtree(node: BspNode, out: Room[]): Room[] {
  if (node.room) {
    out.push(node.room)
  } else if (node.left && node.right) {
    roomsInSubtree(node.left, out)
    roomsInSubtree(node.right, out)
  }
  return out
}

function roomCenter(r: Room): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

/** Finds the closest pair of rooms between two lists (by center distance), so
 *  corridors connecting sibling subtrees stay as short — and therefore as
 *  unlikely to wander through unrelated rooms — as possible. */
function closestPair(a: Room[], b: Room[]): [Room, Room] {
  let best: [Room, Room] = [a[0], b[0]]
  let bestDist = Infinity
  for (const ra of a) {
    const ca = roomCenter(ra)
    for (const rb of b) {
      const cb = roomCenter(rb)
      const d = (ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2
      if (d < bestDist) {
        bestDist = d
        best = [ra, rb]
      }
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Grid-based corridor routing. Rooms are rasterized into an owner grid, and
// every corridor is pathed through cells that belong to no OTHER room — so a
// corridor can only ever meet a room at the two ends it's actually connecting,
// never cut across a third room's floor.
// ---------------------------------------------------------------------------

type OwnerGrid = { data: Int32Array; w: number; h: number }

function buildOwnerGrid(rooms: Room[], w: number, h: number): OwnerGrid {
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

function ownerAt(grid: OwnerGrid, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return -2 // out of bounds — never passable
  return grid.data[y * grid.w + x]
}

type Cell = { x: number; y: number }

/** BFS through cells that are either unclaimed floor or belong to `fromIdx`/
 *  `toIdx` themselves, so the path may start and end inside those two rooms
 *  but can never enter any other room's footprint. */
function findPath(grid: OwnerGrid, from: Room, to: Room, fromIdx: number, toIdx: number, allowOccupied: boolean): Cell[] | null {
  const start: Cell = { x: Math.floor(from.x + from.w / 2), y: Math.floor(from.y + from.h / 2) }
  const goal: Cell = { x: Math.floor(to.x + to.w / 2), y: Math.floor(to.y + to.h / 2) }

  const passable = (x: number, y: number) => {
    const owner = ownerAt(grid, x, y)
    if (owner === -1 || owner === fromIdx || owner === toIdx) return true
    return allowOccupied && owner === -4 // cells within a buffer of an EARLIER corridor
  }

  const key = (x: number, y: number) => y * grid.w + x
  const visited = new Set<number>([key(start.x, start.y)])
  const cameFrom = new Map<number, Cell>()
  const queue: Cell[] = [start]
  let head = 0

  while (head < queue.length) {
    const cur = queue[head++]
    if (cur.x === goal.x && cur.y === goal.y) {
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
 *  path still inside the two connected rooms are already covered by the room
 *  rectangles themselves. `allowOccupied` must match whatever `findPath` used
 *  to find this path — if the path was allowed to cross another corridor's
 *  claimed territory (the rare fallback case), the render has to be allowed
 *  to draw floor there too, or the two disagree: the path connects the rooms
 *  but the rendered corridor has a hole in it, leaving a disconnected,
 *  doorless fragment sitting next to it. */
function widenPath(path: Cell[], grid: OwnerGrid, width: number, fromIdx: number, toIdx: number, allowOccupied: boolean): Set<string> {
  const cells = new Set<string>()
  const lo = -Math.floor((width - 1) / 2)
  const hi = Math.ceil((width - 1) / 2)

  for (let i = 0; i < path.length; i++) {
    const cur = path[i]
    const next = path[i + 1] ?? path[i - 1] ?? cur
    const horizontalMove = next.y === cur.y
    // Thickness runs perpendicular to the direction of travel.
    const perp = horizontalMove ? { x: 0, y: 1 } : { x: 1, y: 0 }

    for (let k = lo; k <= hi; k++) {
      const px = cur.x + perp.x * k
      const py = cur.y + perp.y * k
      const owner = ownerAt(grid, px, py)
      const occupied = allowOccupied && owner === -4
      if (owner !== -1 && owner !== fromIdx && owner !== toIdx && !occupied) continue // would spill onto a foreign room
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
function cellsToRects(cells: Set<string>): { x: number; y: number; w: number; h: number }[] {
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

  const rects: { x: number; y: number; w: number; h: number }[] = []
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

/** Connects two rooms with a collision-avoiding corridor, appending its
 *  geometry (as merged rectangles) and doorways to the output arrays. Returns
 *  true if a connection was actually made, so callers can record the edge in
 *  the room-adjacency graph (used to find the entrance/boss rooms). */
/** Marks every cell of a just-drawn corridor — plus a 1-cell buffer around
 *  it — as occupied, so a LATER connect() call's pathfinding can't route
 *  through or immediately alongside it. Without this, two separate
 *  connections (e.g. a tree edge and a loop shortcut) can end up touching,
 *  which the corridor-union rendering then fuses into one blob — making it
 *  look like a room has two doors into "the same hallway" when they're
 *  really two distinct connections. Only free (-1) cells are claimed; room
 *  interiors are never touched. */
function markCorridorOccupied(grid: OwnerGrid, cells: Set<string>): void {
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

type ConnectOptions = {
  /** Tree edges (required for connectivity) skip the buffer entirely and
   *  always take the direct route — a required connection shouldn't be
   *  distorted, or worse, forced into a long wraparound detour, just to
   *  avoid touching another corridor. Loop edges (optional) respect it, so
   *  they don't fuse with an existing corridor and create a duplicate door
   *  into "the same hallway". */
  respectBuffer: boolean
  /** If the routed path ends up more than this many times the straight-line
   *  cell distance between the two rooms, the connection is discarded
   *  entirely (nothing drawn, edge not recorded) rather than drawing a
   *  hallway that wraps halfway around the map to avoid other corridors.
   *  Only meaningful for optional (loop) connections — a required tree edge
   *  has no length cap, since dropping it could disconnect a subtree. */
  maxPathLength?: number
}

function connect(
  a: Room,
  b: Room,
  aIdx: number,
  bIdx: number,
  grid: OwnerGrid,
  width: number,
  rng: Rng,
  corridors: Corridor[],
  doors: Door[],
  options: ConnectOptions,
): boolean {
  // Prefer a route that keeps clear of earlier corridors entirely; only if
  // that's truly impossible, fall back to one that may touch them — full
  // connectivity matters more than the rare cosmetic exception. Whichever
  // pass actually succeeds, `widenPath` MUST be told which — otherwise the
  // path can legally cross another corridor's territory while the render
  // refuses to draw floor there, leaving a disconnected, doorless fragment.
  let usedFallback = !options.respectBuffer
  let path = options.respectBuffer ? findPath(grid, a, b, aIdx, bIdx, false) : null
  if (!path) {
    path = findPath(grid, a, b, aIdx, bIdx, true)
    usedFallback = true
  }
  if (!path) return false // disconnected footprint (shouldn't happen with a fully-partitioned BSP tree)
  if (options.maxPathLength !== undefined && path.length > options.maxPathLength) return false

  const cells = widenPath(path, grid, width, aIdx, bIdx, usedFallback)
  for (const rect of cellsToRects(cells)) {
    corridors.push({ id: nextId('corridor'), x: rect.x, y: rect.y, w: rect.w, h: rect.h, level: 0 }) // overwritten per-level below
  }
  markCorridorOccupied(grid, cells)

  // A door belongs on the WALL — the boundary between a room cell and the
  // first cell that isn't part of that room — not out in the corridor. Walk
  // the centerline and drop one at every point ROOM MEMBERSHIP changes
  // (room→free, free→room, or a direct room→room hop when two rooms touch
  // with no corridor cells between them at all), positioned at the midpoint
  // between the two cells so it lands exactly on their shared edge. Free and
  // occupied (-4, another corridor's claimed territory the fallback path
  // was allowed to cross) both count as "no room" here — a free→occupied
  // hop is just corridor floor meeting more corridor floor, not a wall.
  const roomOf = (owner: number) => (owner === aIdx || owner === bIdx ? owner : null)
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1]
    const cur = path[i]
    if (roomOf(ownerAt(grid, prev.x, prev.y)) === roomOf(ownerAt(grid, cur.x, cur.y))) continue
    doors.push({
      id: nextId('door'),
      pos: { x: (prev.x + cur.x) / 2, y: (prev.y + cur.y) / 2 },
      orientation: prev.y === cur.y ? 'vertical' : 'horizontal',
      level: 0, // overwritten per-level in generateDungeon
      ...rollDoorFlags(rng),
    })
  }
  return true
}

/** Walks the BSP tree bottom-up, connecting every pair of sibling subtrees
 *  (via their closest rooms) so the whole dungeon ends up as one connected
 *  graph. A subtree that ended up with zero rooms (possible near the legend's
 *  reserved corner) simply can't be connected — tolerate it rather than
 *  crashing. Successful connections are recorded as edges in `edges` for the
 *  entrance/boss room search. */
function connectTree(
  node: BspNode,
  roomIndex: Map<string, number>,
  grid: OwnerGrid,
  params: DungeonParams,
  rng: Rng,
  corridors: Corridor[],
  doors: Door[],
  edges: [number, number][],
): void {
  if (!node.left || !node.right) return
  connectTree(node.left, roomIndex, grid, params, rng, corridors, doors, edges)
  connectTree(node.right, roomIndex, grid, params, rng, corridors, doors, edges)
  const leftRooms = roomsInSubtree(node.left, [])
  const rightRooms = roomsInSubtree(node.right, [])
  if (leftRooms.length === 0 || rightRooms.length === 0) return
  const [a, b] = closestPair(leftRooms, rightRooms)
  const aIdx = roomIndex.get(a.id)!
  const bIdx = roomIndex.get(b.id)!
  if (connect(a, b, aIdx, bIdx, grid, params.corridorWidth, rng, corridors, doors, { respectBuffer: false })) edges.push([aIdx, bIdx])
}

/** Adds a handful of extra short corridors between nearby rooms that aren't
 *  already directly connected, so the layout isn't purely tree-shaped. */
function addLoops(
  rooms: Room[],
  roomIndex: Map<string, number>,
  grid: OwnerGrid,
  params: DungeonParams,
  rng: Rng,
  corridors: Corridor[],
  doors: Door[],
  edges: [number, number][],
): void {
  // A room pair already joined by the spanning tree gets no second corridor —
  // that would mean two doors between the exact same room and hallway (one
  // from the tree edge, one from the "loop"), which isn't a loop at all, just
  // a redundant duplicate door. At most one door per hallway/room pair.
  const connected = new Set(edges.map(([a, b]) => `${Math.min(a, b)},${Math.max(a, b)}`))

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (connected.has(`${i},${j}`)) continue
      if (rng.next() > params.loopChance) continue
      const a = rooms[i]
      const b = rooms[j]
      const ca = roomCenter(a)
      const cb = roomCenter(b)
      const dx = Math.abs(ca.x - cb.x)
      const dy = Math.abs(ca.y - cb.y)
      // Only loop-connect rooms that are already close, so extra corridors
      // read as shortcuts rather than long cross-dungeon tunnels.
      const closeEnough = dx < (a.w + b.w) * 1.5 && dy < (a.h + b.h) * 1.5
      if (!closeEnough) continue
      const aIdx = roomIndex.get(a.id)!
      const bIdx = roomIndex.get(b.id)!
      // Cap how far the ACTUAL routed path may stray from the straight-line
      // distance — otherwise an occasional "shortcut" winds halfway around
      // the map to avoid other corridors, which isn't a shortcut at all.
      // dx/dy are already in grid cells (rooms live in grid space until the
      // final world-unit conversion), matching `path.length`'s units.
      const straightLineCells = dx + dy
      const maxPathLength = straightLineCells * params.loopMaxDetour
      if (
        connect(a, b, aIdx, bIdx, grid, Math.max(1, params.corridorWidth - 1), rng, corridors, doors, {
          respectBuffer: true,
          maxPathLength,
        })
      ) {
        edges.push([aIdx, bIdx])
        connected.add(`${i},${j}`)
      }
    }
  }
}

/** Rectangle (in grid cells) reserved at the bottom-right corner for the map
 *  legend, sized to its EXPANDED footprint regardless of whether it's
 *  currently collapsed on screen — so toggling it never causes an overlap
 *  the generator didn't already avoid. Clamped so a tiny grid never loses
 *  more than half its area to the reservation. */
function legendReservedRect(params: DungeonParams): { x: number; y: number; w: number; h: number } {
  const w = Math.min(Math.ceil((LEGEND_WIDTH + LEGEND_MARGIN) / CELL_SIZE), Math.floor(params.gridWidth / 2))
  const h = Math.min(Math.ceil((LEGEND_HEIGHT + LEGEND_MARGIN) / CELL_SIZE), Math.floor(params.gridHeight / 2))
  return { x: params.gridWidth - w, y: params.gridHeight - h, w, h }
}

/** Marks every cell of `rect` as permanently blocked (never free, never
 *  owned by a room) so corridor pathfinding routes around it. */
function markReserved(grid: OwnerGrid, rect: { x: number; y: number; w: number; h: number }): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (x >= 0 && y >= 0 && x < grid.w && y < grid.h) grid.data[y * grid.w + x] = -3
    }
  }
}

/** BFS over the room-adjacency graph (built from successful `connect()`
 *  calls) from `startIdx`, returning each reachable room's hop distance. */
function bfsDistances(edges: [number, number][], roomCount: number, startIdx: number): number[] {
  const adjacency: number[][] = Array.from({ length: roomCount }, () => [])
  for (const [a, b] of edges) {
    adjacency[a].push(b)
    adjacency[b].push(a)
  }
  const dist = new Array(roomCount).fill(-1)
  dist[startIdx] = 0
  const queue = [startIdx]
  let head = 0
  while (head < queue.length) {
    const cur = queue[head++]
    for (const next of adjacency[cur]) {
      if (dist[next] !== -1) continue
      dist[next] = dist[cur] + 1
      queue.push(next)
    }
  }
  return dist
}

type Side = 'N' | 'S' | 'E' | 'W'

/** Room closest to the outer edge of the grid — where the party enters from
 *  — plus which of its four walls that edge actually is, so the entrance
 *  opening can be drawn on the correct side. Ties broken by array/side
 *  check order (deterministic). */
function findEntrance(rooms: Room[], params: DungeonParams): { index: number; side: Side } {
  let best = 0
  let bestDist = Infinity
  let bestSide: Side = 'N'
  rooms.forEach((r, i) => {
    const distances: [Side, number][] = [
      ['N', r.y],
      ['W', r.x],
      ['E', params.gridWidth - (r.x + r.w)],
      ['S', params.gridHeight - (r.y + r.h)],
    ]
    for (const [side, dist] of distances) {
      if (dist < bestDist) {
        bestDist = dist
        best = i
        bestSide = side
      }
    }
  })
  return { index: best, side: bestSide }
}

/** Index of the room with the greatest corridor-hop distance from the
 *  entrance — the deepest room in the dungeon, i.e. the boss's lair. */
function findBossIndex(edges: [number, number][], rooms: Room[], entranceIdx: number): number {
  const dist = bfsDistances(edges, rooms.length, entranceIdx)
  let best = entranceIdx
  let bestDist = -1
  dist.forEach((d, i) => {
    if (d > bestDist) {
      bestDist = d
      best = i
    }
  })
  return best
}

/** One level's raw layout, still in grid space (pre-world-unit conversion,
 *  pre-level-tag) — everything `generateDungeon` used to build inline,
 *  factored out so it can run once per stacked level. */
type LevelLayout = {
  rooms: Room[]
  corridors: Corridor[]
  doors: Door[]
  edges: [number, number][]
}

function buildLevelLayout(params: DungeonParams, rng: Rng): LevelLayout {
  const root: BspNode = { x: 0, y: 0, w: params.gridWidth, h: params.gridHeight }
  split(root, 0, params, rng)

  const reserved = legendReservedRect(params)
  const rooms: Room[] = []
  placeRooms(root, params, rng, reserved, rooms)
  const roomIndex = new Map(rooms.map((r, i) => [r.id, i]))
  const grid = buildOwnerGrid(rooms, params.gridWidth, params.gridHeight)
  markReserved(grid, reserved)

  const corridors: Corridor[] = []
  const doors: Door[] = []
  const edges: [number, number][] = []
  connectTree(root, roomIndex, grid, params, rng, corridors, doors, edges)
  addLoops(rooms, roomIndex, grid, params, rng, corridors, doors, edges)

  return { rooms, corridors, doors, edges }
}

const toWorld = (r: { x: number; y: number; w: number; h: number }) => ({
  x: r.x * CELL_SIZE,
  y: r.y * CELL_SIZE,
  w: r.w * CELL_SIZE,
  h: r.h * CELL_SIZE,
})

const toWorldPoint = (p: { x: number; y: number }) => ({ x: p.x * CELL_SIZE, y: p.y * CELL_SIZE })

export function generateDungeon(params: DungeonParams): DungeonScene {
  idCounter = 0
  const rng = makeRng(params.seed)
  const levelCount = Math.max(1, params.levelCount)

  const allRooms: Room[] = []
  const allCorridors: Corridor[] = []
  const allDoors: Door[] = []
  const stairs: Stair[] = []

  let entranceRoomId: string | null = null
  let entranceSide: 'N' | 'S' | 'E' | 'W' | null = null
  let bossRoomId: string | null = null

  // The room-array reference from the PREVIOUS level, kept so the current
  // level's "up" stair can be paired with a "down" stair placed in it — each
  // level is its own independent BSP layout, so a stair is really two linked
  // points, one per level, not one shared coordinate.
  let prevRooms: Room[] = []
  let prevEntryIdx = -1 // which room in prevRooms was ITS OWN level-entry point

  for (let level = 0; level < levelCount; level++) {
    const { rooms, corridors, doors, edges } = buildLevelLayout(params, rng)

    let entryIdx = -1 // this level's own "arrival" room — where the party enters it

    if (level === 0) {
      const entranceResult = rooms.length > 0 ? findEntrance(rooms, params) : null
      if (entranceResult) {
        entryIdx = entranceResult.index
        entranceSide = entranceResult.side
        entranceRoomId = rooms[entryIdx].id
        // The entrance is a real door with its own independently-rolled
        // flags — it can be locked, trapped, or stuck exactly like any
        // interior door, not hardcoded to a convenient "always open" cave
        // mouth. Positioned directly in the same cell-center-indexed space
        // `pos` uses everywhere else (an integer means a cell's center, a
        // half-integer means the boundary between two cells), so it goes
        // through the same final `+0.5` conversion to world units below.
        const eRoom = rooms[entryIdx]
        const side = entranceResult.side
        const pos =
          side === 'N'
            ? { x: eRoom.x + eRoom.w / 2 - 0.5, y: eRoom.y - 0.5 }
            : side === 'S'
              ? { x: eRoom.x + eRoom.w / 2 - 0.5, y: eRoom.y + eRoom.h - 0.5 }
              : side === 'W'
                ? { x: eRoom.x - 0.5, y: eRoom.y + eRoom.h / 2 - 0.5 }
                : { x: eRoom.x + eRoom.w - 0.5, y: eRoom.y + eRoom.h / 2 - 0.5 }
        const orientation = side === 'N' || side === 'S' ? 'horizontal' : 'vertical'
        doors.push({ id: nextId('door'), pos, orientation, level, ...rollDoorFlags(rng) })
      }
    } else if (prevRooms.length > 0 && rooms.length > 0) {
      // Down-stair: any room on the level above other than ITS OWN entry
      // point, so the two stairs in one room don't sit on top of each other.
      const downCandidates = prevRooms.map((_, i) => i).filter((i) => i !== prevEntryIdx)
      const downIdx = downCandidates.length > 0 ? downCandidates[rng.int(0, downCandidates.length - 1)] : rng.int(0, prevRooms.length - 1)
      const upIdx = rng.int(0, rooms.length - 1)
      const downRoom = prevRooms[downIdx]
      const upRoom = rooms[upIdx]
      stairs.push({
        id: nextId('stair'),
        levelFrom: level - 1,
        levelTo: level,
        roomFromId: downRoom.id,
        roomToId: upRoom.id,
        posFrom: toWorldPoint(roomCenter(downRoom)),
        posTo: toWorldPoint(roomCenter(upRoom)),
      })
      entryIdx = upIdx
    }

    const isLastLevel = level === levelCount - 1
    const bossIdx = isLastLevel && entryIdx >= 0 ? findBossIndex(edges, rooms, entryIdx) : -1
    if (bossIdx >= 0) bossRoomId = rooms[bossIdx].id

    allRooms.push(
      ...rooms.map((r, i) => ({
        ...toWorld(r),
        id: r.id,
        level,
        encounter:
          i === bossIdx
            ? generateBossEncounter(params.partyLevel, params.partySize)
            : generateRoomEncounter(r, params.partyLevel, params.partySize, params.monsterChance, params.lootChance, params.encounterSeed),
      })),
    )
    allCorridors.push(...corridors.map((c) => ({ ...toWorld(c), id: c.id, level })))
    allDoors.push(...doors.map((d) => ({ ...d, pos: { x: (d.pos.x + 0.5) * CELL_SIZE, y: (d.pos.y + 0.5) * CELL_SIZE }, level })))

    prevRooms = rooms
    prevEntryIdx = entryIdx
  }

  return {
    params,
    rooms: allRooms,
    corridors: allCorridors,
    doors: allDoors,
    stairs,
    bounds: { width: params.gridWidth * CELL_SIZE, height: params.gridHeight * CELL_SIZE },
    entranceRoomId,
    entranceSide,
    bossRoomId,
  }
}

/** Re-rolls every room's encounter/loot note in place, without touching the
 *  layout — for when the map is right but the content should shuffle. Takes
 *  party level/size explicitly (rather than from `scene.params`, which is a
 *  snapshot from the last full generate and may be stale). The boss room
 *  keeps its guaranteed strong encounter rather than rolling like a normal
 *  room. */
export function rerollEncounters(
  scene: DungeonScene,
  partyLevel: number,
  partySize: number,
  monsterChance: number,
  lootChance: number,
  encounterSeed: number,
): DungeonScene {
  return {
    ...scene,
    params: { ...scene.params, partyLevel, partySize, monsterChance, lootChance, encounterSeed },
    rooms: scene.rooms.map((r) => ({
      ...r,
      encounter:
        r.id === scene.bossRoomId
          ? generateBossEncounter(partyLevel, partySize)
          : generateRoomEncounter(r, partyLevel, partySize, monsterChance, lootChance, encounterSeed),
    })),
  }
}

export function defaultDungeonParams(): DungeonParams {
  return {
    seed: Math.floor(Math.random() * 1_000_000),
    encounterSeed: Math.floor(Math.random() * 1_000_000),
    dungeonName: 'Unnamed Dungeon',
    partyLevel: 5,
    partySize: 4,
    monsterChance: 0.7,
    lootChance: 0.5,
    gridWidth: 60,
    gridHeight: 40,
    minRoomSize: 4,
    maxRoomSize: 9,
    maxDepth: 5,
    corridorWidth: 1,
    loopChance: 0.05,
    loopMaxDetour: 3,
    levelCount: 1,
  }
}
