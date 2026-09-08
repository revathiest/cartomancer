import type { Point } from '../shared/types.ts'

export type DungeonParams = {
  seed: number
  /** Seeds only the per-room encounter/loot rolls — separate from `seed` so
   *  "Reroll Encounters" can vary content without reshuffling the layout. */
  encounterSeed: number
  dungeonName: string
  /** The party this dungeon is built for — drives encounter CR and headcount. */
  partyLevel: number
  partySize: number
  /** Chance [0,1] that a given room has monsters in it at all. */
  monsterChance: number
  /** Chance [0,1] that a room with monsters also has a loot note — rooms
   *  without monsters use a fraction of this, since unguarded hoards are
   *  rarer than guarded ones. */
  lootChance: number
  /** Overall grid footprint, in grid cells. */
  gridWidth: number
  gridHeight: number
  /** Room size bounds, in grid cells. */
  minRoomSize: number
  maxRoomSize: number
  /** BSP recursion depth — higher gives more, smaller rooms. */
  maxDepth: number
  /** Corridor thickness, in grid cells. */
  corridorWidth: number
  /** Chance [0,1] of adding an extra corridor between nearby rooms to form loops. */
  loopChance: number
  /** A candidate loop connection is discarded if its actual routed path is
   *  more than this many times the straight-line distance between the two
   *  rooms — otherwise an occasional loop would wind all the way around the
   *  map to avoid other corridors, which defeats the point of a "shortcut." */
  loopMaxDetour: number
  /** Number of stacked levels — each is its own independent BSP layout over
   *  the same footprint, joined to the next by a stairway. Level 0 holds the
   *  entrance; the last level holds the boss room. */
  levelCount: number
}

export type MonsterGroup = {
  /** Challenge rating, using 5e's fractional low end (0.125, 0.25, 0.5). */
  cr: number
  count: number
}

export type RoomEncounter = {
  monsters: MonsterGroup[]
  /** A loot-table pointer (e.g. "Tier I Hoard (CR 0–4)") — not an actual item roll. */
  loot: string | null
}

export type Room = {
  id: string
  x: number
  y: number
  w: number
  h: number
  /** Which stacked level this room belongs to — 0 is the entrance level. */
  level: number
  /** null once rolled = deliberately empty; undefined = not yet rolled. */
  encounter?: RoomEncounter | null
}

/** An axis-aligned corridor segment, drawn as a rectangle like a room. Every
 *  corridor is owned by exactly one Connection — there's no such thing as a
 *  freestanding/unconnected corridor piece. */
export type Corridor = {
  id: string
  x: number
  y: number
  w: number
  h: number
  level: number
  connectionId: string
}

/** A bare point where 2+ hallways meet with no room there — created when a
 *  room with connections is deleted, so the hallways that led to it stay
 *  joined to each other instead of dead-ending in empty space. Never has a
 *  door (a door only makes sense at an actual room threshold) and no
 *  geometry of its own — the corridors meeting there simply fuse visually,
 *  the same way any two touching corridors already do. */
export type Junction = {
  id: string
  level: number
  pos: Point
}

export type ConnectionEndpoint = { kind: 'room'; id: string } | { kind: 'junction'; id: string }

/** One hallway between two endpoints (each a room or a junction), as a unit
 *  — its corridor pieces, and the doors at each end (null on a junction
 *  end, since junctions have no doors). Deleting a connection removes all
 *  of these together; moving a connected room repaths it as a whole. */
export type Connection = {
  id: string
  level: number
  a: ConnectionEndpoint
  b: ConnectionEndpoint
  corridorIds: string[]
  doorAId: string | null
  doorBId: string | null
}

/** A door's lock/trap can be absent, mundane (a real key/mechanism), or
 *  magical (arcane lock, glyph of warding) — shown with a different icon
 *  color on the map, not just in a text note. */
export type SecurityKind = 'none' | 'mundane' | 'magical'

/**
 * Every flag is independent and any combination is valid (a door can be
 * secret AND locked AND stuck at once) — EXCEPT `open`, which means there's
 * demonstrably no obstruction, so it forces stuck/locked/trapped off. `open`
 * still combines with `secret` (a secret door that's been found and left
 * open).
 */
export type Door = {
  id: string
  pos: Point
  /** Orientation of the wall the door sits in. */
  orientation: 'horizontal' | 'vertical'
  open: boolean
  secret: boolean
  stuck: boolean
  locked: SecurityKind
  trapped: SecurityKind
  level: number
}

/** A stairway joining two adjacent levels — each level is its own
 *  independent layout, so a stair has two positions (one per level, each
 *  sitting inside its own room) rather than one shared point. */
export type Stair = {
  id: string
  levelFrom: number
  levelTo: number
  roomFromId: string
  roomToId: string
  posFrom: Point
  posTo: Point
}

export type DungeonScene = {
  params: DungeonParams
  rooms: Room[]
  corridors: Corridor[]
  doors: Door[]
  stairs: Stair[]
  connections: Connection[]
  junctions: Junction[]
  bounds: { width: number; height: number }
  /** The room closest to the dungeon's outer edge — where the party comes
   *  in, on level 0. Null only if the dungeon somehow generated zero rooms. */
  entranceRoomId: string | null
  /** Which of the entrance room's four walls faces the dungeon's outer edge
   *  — that's the wall the actual entrance opening is drawn on. */
  entranceSide: 'N' | 'S' | 'E' | 'W' | null
  /** The room with the greatest corridor-hop distance from its level's entry
   *  point, on the deepest level — the "BBG" room, with a guaranteed strong
   *  encounter and guaranteed loot. */
  bossRoomId: string | null
}
