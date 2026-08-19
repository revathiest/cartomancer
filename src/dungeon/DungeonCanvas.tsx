import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDungeonStore } from './dungeonStore.ts'
import { THEME } from '../rendering/style/theme.ts'
import { MapDefs, MAP_FONT } from '../rendering/style/filters.tsx'
import { describeEncounter } from './encounters.ts'
import { LEGEND_WIDTH, LEGEND_HEIGHT, LEGEND_PAD, LEGEND_ROW_H, LEGEND_MARGIN } from './legendLayout.ts'
import { unionPolygonsRobust, toPath } from '../shared/geometry.ts'
import type { Point } from '../shared/types.ts'
import type { Corridor, Door, Room, SecurityKind } from './types.ts'

type View = { x: number; y: number; w: number; h: number }

/** Corridor rectangles are generated as many touching/overlapping pieces
 *  (one per straight run, plus loop shortcuts) — stroking each individually
 *  leaves a visible seam wherever two meet. Fusing them into one outline via
 *  Clipper's robust union (the same utility the city tool uses to merge
 *  adjacent lots) makes the whole corridor network read as one hallway. */
function corridorToPolygon(c: Corridor): Point[] {
  return [
    { x: c.x, y: c.y },
    { x: c.x + c.w, y: c.y },
    { x: c.x + c.w, y: c.y + c.h },
    { x: c.x, y: c.y + c.h },
  ]
}

// Rooms read as carved stone; corridors read as a distinct beaten path
// (reusing the city's "road" palette) so the two are visually unmistakable.
const ROOM_FILL = THEME.parchmentDark
const ROOM_STROKE = THEME.ink
const CORRIDOR_FILL = THEME.roadPrimary
const CORRIDOR_STROKE = THEME.roadPrimaryStroke

type Interval = [number, number]

/** Subtracts `gaps` from [start, end], returning the remaining sub-intervals. */
function subtractIntervals(start: number, end: number, gaps: Interval[]): Interval[] {
  const sorted = gaps.slice().sort((a, b) => a[0] - b[0])
  const segments: Interval[] = []
  let cursor = start
  for (const [gapStart, gapEnd] of sorted) {
    const clippedStart = Math.max(gapStart, cursor)
    const clippedEnd = Math.min(gapEnd, end)
    if (clippedStart > cursor) segments.push([cursor, clippedStart])
    if (clippedEnd > cursor) cursor = clippedEnd
  }
  if (cursor < end) segments.push([cursor, end])
  return segments
}

// Half-width of the wall gap cut for each door, in world units — a bit over
// half the door capsule's own length (18/2=9) so the capsule/glyph always
// has clearance, without leaving an oversized hole.
const DOOR_GAP_HALF = 10
const DOOR_EDGE_EPS = 1.5

/** A room's fill, plus its own outline drawn as real line segments with an
 *  actual gap cut wherever a door sits on that wall — not a colored patch
 *  papering over a solid stroke, but a genuine absence of wall there, so a
 *  door glyph never has to compete with a line running through it. */
function RoomShape({ room, doors }: { room: Room; doors: Door[] }) {
  const top = room.y
  const bottom = room.y + room.h
  const left = room.x
  const right = room.x + room.w

  const topGaps: Interval[] = []
  const bottomGaps: Interval[] = []
  const leftGaps: Interval[] = []
  const rightGaps: Interval[] = []

  for (const d of doors) {
    const { x, y } = d.pos
    const onHorizontalSpan = x >= left - DOOR_EDGE_EPS && x <= right + DOOR_EDGE_EPS
    const onVerticalSpan = y >= top - DOOR_EDGE_EPS && y <= bottom + DOOR_EDGE_EPS
    if (Math.abs(y - top) < DOOR_EDGE_EPS && onHorizontalSpan) topGaps.push([x - DOOR_GAP_HALF, x + DOOR_GAP_HALF])
    else if (Math.abs(y - bottom) < DOOR_EDGE_EPS && onHorizontalSpan) bottomGaps.push([x - DOOR_GAP_HALF, x + DOOR_GAP_HALF])
    else if (Math.abs(x - left) < DOOR_EDGE_EPS && onVerticalSpan) leftGaps.push([y - DOOR_GAP_HALF, y + DOOR_GAP_HALF])
    else if (Math.abs(x - right) < DOOR_EDGE_EPS && onVerticalSpan) rightGaps.push([y - DOOR_GAP_HALF, y + DOOR_GAP_HALF])
  }

  const topSegs = subtractIntervals(left, right, topGaps)
  const bottomSegs = subtractIntervals(left, right, bottomGaps)
  const leftSegs = subtractIntervals(top, bottom, leftGaps)
  const rightSegs = subtractIntervals(top, bottom, rightGaps)

  return (
    <g>
      <rect x={room.x} y={room.y} width={room.w} height={room.h} fill={ROOM_FILL} />
      <g stroke={ROOM_STROKE} strokeWidth={2.5} strokeLinecap="round">
        {topSegs.map(([a, b], i) => <line key={`t${i}`} x1={a} y1={top} x2={b} y2={top} />)}
        {bottomSegs.map(([a, b], i) => <line key={`b${i}`} x1={a} y1={bottom} x2={b} y2={bottom} />)}
        {leftSegs.map(([a, b], i) => <line key={`l${i}`} x1={left} y1={a} x2={left} y2={b} />)}
        {rightSegs.map(([a, b], i) => <line key={`r${i}`} x1={right} y1={a} x2={right} y2={b} />)}
      </g>
    </g>
  )
}

// Mundane vs magical locks/traps get bold, saturated, unmistakably distinct
// colors — not the muted wall/ink tones the rest of the map uses, since these
// specifically need to pop out at a glance. Stuck gets its own third color so
// all three icon kinds are distinguishable by color AND shape.
const MUNDANE_COLOR = '#a5691f' // bronze/amber — a physical lock or trap
const MAGICAL_COLOR = '#7c3aed' // vivid violet — arcane
const STUCK_COLOR = '#8b3a2f' // rust red
const STAIR_COLOR = '#3f5f6b' // slate blue — reads as "stone stairwell", distinct from every door color
const securityColor = (kind: SecurityKind) => (kind === 'magical' ? MAGICAL_COLOR : MUNDANE_COLOR)

/** A recognizable keyhole silhouette — round top, tapered body — filled
 *  solid, meant to sit on top of a colored capsule segment (parchment on
 *  the segment's own color, not a badge of its own). */
function KeyholeGlyph({ cx, cy, color, scale = 1 }: { cx: number; cy: number; color: string; scale?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy - 1 * scale} r={1.6 * scale} fill={color} />
      <polygon
        points={`${cx - 1.2 * scale},${cy - 0.4 * scale} ${cx + 1.2 * scale},${cy - 0.4 * scale} ${cx + 0.65 * scale},${cy + 2.4 * scale} ${cx - 0.65 * scale},${cy + 2.4 * scale}`}
        fill={color}
      />
    </g>
  )
}

/** A warning triangle with a bold "!" inside it. */
function TrapGlyph({ cx, cy, color, scale = 1 }: { cx: number; cy: number; color: string; scale?: number }) {
  const r = 3.2 * scale
  return (
    <g>
      <polygon
        points={`${cx},${cy - r} ${cx - r},${cy + r * 0.8} ${cx + r},${cy + r * 0.8}`}
        fill="none"
        stroke={color}
        strokeWidth={1.5 * scale}
        strokeLinejoin="round"
      />
      <rect x={cx - 0.45 * scale} y={cy - 0.9 * scale} width={0.9 * scale} height={1.7 * scale} rx={0.3 * scale} fill={color} />
      <circle cx={cx} cy={cy + 1.7 * scale} r={0.6 * scale} fill={color} />
    </g>
  )
}

/** A bold, rounded X. */
function StuckGlyph({ cx, cy, color, scale = 1 }: { cx: number; cy: number; color: string; scale?: number }) {
  const a = 2.2 * scale
  return (
    <g stroke={color} strokeWidth={1.8 * scale} strokeLinecap="round">
      <line x1={cx - a} y1={cy - a} x2={cx + a} y2={cy + a} />
      <line x1={cx - a} y1={cy + a} x2={cx + a} y2={cy - a} />
    </g>
  )
}

type CapsuleSegment = { kind: 'locked' | 'trapped' | 'stuck' | 'plain'; color: string }

const CAPSULE_LEN = 18 // along the wall span — kept under the default 20-unit corridor width
const CAPSULE_THICK = 8

/** The door itself: a capsule spanning the wall opening, split into one
 *  colored segment per active flag (fused edge to edge), each carrying its
 *  own glyph in parchment. A plain door is a single ink segment. Icons
 *  shrink slightly as more flags stack into the same fixed-length capsule,
 *  which stays inside the doorway rather than growing past it. */
function DoorCapsule({
  id,
  cx,
  cy,
  vertical,
  segments,
  secret,
}: {
  id: string
  cx: number
  cy: number
  vertical: boolean
  segments: CapsuleSegment[]
  secret: boolean
}) {
  const segLen = CAPSULE_LEN / segments.length
  const iconScale = segments.length === 1 ? 1.3 : segments.length === 2 ? 1.0 : 0.8

  const capW = vertical ? CAPSULE_THICK : CAPSULE_LEN
  const capH = vertical ? CAPSULE_LEN : CAPSULE_THICK
  const x0 = cx - capW / 2
  const y0 = cy - capH / 2
  const rx = Math.min(capW, capH) / 2
  const clipId = `door-cap-${id}`

  return (
    <g opacity={secret ? 0.6 : 1}>
      <clipPath id={clipId}>
        <rect x={x0} y={y0} width={capW} height={capH} rx={rx} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {segments.map((seg, i) => {
          const segX = vertical ? x0 : x0 + i * segLen
          const segY = vertical ? y0 + i * segLen : y0
          const segW = vertical ? capW : segLen
          const segH = vertical ? segLen : capH
          return <rect key={i} x={segX} y={segY} width={segW} height={segH} fill={seg.color} />
        })}
      </g>
      <rect x={x0} y={y0} width={capW} height={capH} rx={rx} fill="none" stroke={THEME.ink} strokeWidth={1.5} strokeDasharray={secret ? '2,2' : undefined} />
      {segments.map((seg, i) => {
        const gcx = vertical ? cx : x0 + segLen * (i + 0.5)
        const gcy = vertical ? y0 + segLen * (i + 0.5) : cy
        if (seg.kind === 'locked') return <KeyholeGlyph key={i} cx={gcx} cy={gcy} color={THEME.parchment} scale={iconScale} />
        if (seg.kind === 'trapped') return <TrapGlyph key={i} cx={gcx} cy={gcy} color={THEME.parchment} scale={iconScale} />
        if (seg.kind === 'stuck') return <StuckGlyph key={i} cx={gcx} cy={gcy} color={THEME.parchment} scale={iconScale} />
        return null
      })}
    </g>
  )
}

/** The classic dungeon-map "swung open" door: a bold leaf hinged at one side
 *  of the wall opening, angled into the room, a hinge-pin dot, and a faint
 *  quarter-swing arc for context. Sized and weighted to match the segmented
 *  capsule doors — not a thin afterthought next to them. Open and secret are
 *  mutually exclusive (an open door is demonstrably not hidden), so this has
 *  no secret variant to render. */
function OpenDoorGlyph({ cx, cy, vertical, scale = 1 }: { cx: number; cy: number; vertical: boolean; scale?: number }) {
  const len = 13 * scale
  const angle = (65 * Math.PI) / 180
  const hinge = vertical ? { x: cx, y: cy - len / 2 } : { x: cx - len / 2, y: cy }
  const wallEnd = vertical ? { x: cx, y: cy + len / 2 } : { x: cx + len / 2, y: cy }
  const leafEnd = vertical
    ? { x: hinge.x + len * Math.sin(angle), y: hinge.y + len * Math.cos(angle) }
    : { x: hinge.x + len * Math.cos(angle), y: hinge.y + len * Math.sin(angle) }

  return (
    <g>
      <path
        d={`M ${wallEnd.x} ${wallEnd.y} A ${len} ${len} 0 0 1 ${leafEnd.x} ${leafEnd.y}`}
        fill="none"
        stroke={THEME.inkSoft}
        strokeWidth={1.2 * scale}
        strokeDasharray={`${1.2 * scale},${2 * scale}`}
        opacity={0.6}
      />
      <line x1={hinge.x} y1={hinge.y} x2={leafEnd.x} y2={leafEnd.y} stroke={THEME.ink} strokeWidth={2.6 * scale} strokeLinecap="round" />
      <circle cx={hinge.x} cy={hinge.y} r={1.4 * scale} fill={THEME.ink} />
    </g>
  )
}

/** One door. Open doors get the swung-door glyph; closed doors get the
 *  segmented capsule — one colored segment per active flag (stuck, locked,
 *  trapped), fused into a single object rather than floating badges. A door
 *  can have any combination of these at once. */

function DoorMark({ door }: { door: Door }) {
  const vertical = door.orientation === 'vertical'

  if (door.open) return <OpenDoorGlyph cx={door.pos.x} cy={door.pos.y} vertical={vertical} />

  const segments: CapsuleSegment[] = []
  if (door.locked !== 'none') segments.push({ kind: 'locked', color: securityColor(door.locked) })
  if (door.trapped !== 'none') segments.push({ kind: 'trapped', color: securityColor(door.trapped) })
  if (door.stuck) segments.push({ kind: 'stuck', color: STUCK_COLOR })
  if (segments.length === 0) segments.push({ kind: 'plain', color: THEME.ink })

  return <DoorCapsule id={door.id} cx={door.pos.x} cy={door.pos.y} vertical={vertical} segments={segments} secret={door.secret} />
}

type LegendRow = { label: string; render: (cx: number, cy: number) => React.ReactNode }

const LEGEND_ROWS_DATA: LegendRow[] = [
  { label: 'Open', render: (cx, cy) => <OpenDoorGlyph cx={cx} cy={cy} vertical={false} /> },
  {
    label: 'Secret (closed)',
    render: (cx, cy) => <DoorCapsule id="legend-secret" cx={cx} cy={cy} vertical={false} segments={[{ kind: 'plain', color: THEME.ink }]} secret />,
  },
  {
    label: 'Stuck',
    render: (cx, cy) => <DoorCapsule id="legend-stuck" cx={cx} cy={cy} vertical={false} segments={[{ kind: 'stuck', color: STUCK_COLOR }]} secret={false} />,
  },
  {
    label: 'Locked (mundane)',
    render: (cx, cy) => (
      <DoorCapsule id="legend-locked-mundane" cx={cx} cy={cy} vertical={false} segments={[{ kind: 'locked', color: MUNDANE_COLOR }]} secret={false} />
    ),
  },
  {
    label: 'Locked (magical)',
    render: (cx, cy) => (
      <DoorCapsule id="legend-locked-magical" cx={cx} cy={cy} vertical={false} segments={[{ kind: 'locked', color: MAGICAL_COLOR }]} secret={false} />
    ),
  },
  {
    label: 'Trapped (mundane)',
    render: (cx, cy) => (
      <DoorCapsule id="legend-trapped-mundane" cx={cx} cy={cy} vertical={false} segments={[{ kind: 'trapped', color: MUNDANE_COLOR }]} secret={false} />
    ),
  },
  {
    label: 'Trapped (magical)',
    render: (cx, cy) => (
      <DoorCapsule id="legend-trapped-magical" cx={cx} cy={cy} vertical={false} segments={[{ kind: 'trapped', color: MAGICAL_COLOR }]} secret={false} />
    ),
  },
  {
    label: 'Stairs down',
    render: (cx, cy) => (
      <g>
        <circle cx={cx} cy={cy} r={8} fill={STAIR_COLOR} stroke={THEME.ink} strokeWidth={1.2} />
        <text x={cx} y={cy + 0.5} textAnchor="middle" dominantBaseline="central" fontFamily={MAP_FONT} fontSize={9} fontWeight="bold" fill={THEME.parchment}>
          ▼
        </text>
      </g>
    ),
  },
  {
    label: 'Stairs up',
    render: (cx, cy) => (
      <g>
        <circle cx={cx} cy={cy} r={8} fill={STAIR_COLOR} stroke={THEME.ink} strokeWidth={1.2} />
        <text x={cx} y={cy + 0.5} textAnchor="middle" dominantBaseline="central" fontFamily={MAP_FONT} fontSize={9} fontWeight="bold" fill={THEME.parchment}>
          ▲
        </text>
      </g>
    ),
  },
]

/** Door key, drawn as part of the map itself (like the city's building
 *  legend in Labels.tsx) — same parchment card, same corner anchoring in
 *  world coordinates, so it pans and scales with zoom exactly like the rest
 *  of the map instead of sitting fixed over it as a screen-space overlay.
 *  Sized from `legendLayout.ts` — the SAME constants the generator uses to
 *  reserve this corner, so this card can never end up over a room/corridor. */
function Legend({ bounds }: { bounds: { width: number; height: number } }) {
  const [open, setOpen] = useState(true)
  const height = open ? LEGEND_HEIGHT : LEGEND_PAD * 2 + LEGEND_ROW_H
  const left = bounds.width - LEGEND_MARGIN - LEGEND_WIDTH
  const top = bounds.height - LEGEND_MARGIN - height

  return (
    <g transform={`translate(${left} ${top})`} fontFamily={MAP_FONT} pointerEvents="auto" style={{ cursor: 'pointer' }}>
      <rect
        width={LEGEND_WIDTH}
        height={height}
        rx={8}
        fill={THEME.parchment}
        fillOpacity={0.92}
        stroke={THEME.ink}
        strokeWidth={1.5}
        onClick={() => setOpen((v) => !v)}
      />
      <text
        x={LEGEND_PAD}
        y={LEGEND_PAD + LEGEND_ROW_H / 2}
        dominantBaseline="middle"
        fontSize={13}
        fontWeight="bold"
        fill={THEME.ink}
        onClick={() => setOpen((v) => !v)}
      >
        Legend {open ? '▾' : '▸'}
      </text>
      {open &&
        LEGEND_ROWS_DATA.map((row, i) => {
          const cy = LEGEND_PAD + LEGEND_ROW_H * (i + 1) + LEGEND_ROW_H / 2
          return (
            <g key={row.label}>
              {row.render(LEGEND_PAD + 9, cy)}
              <text x={LEGEND_PAD + 26} y={cy} dominantBaseline="middle" fontSize={13} fill={THEME.ink}>
                {row.label}
              </text>
            </g>
          )
        })}
    </g>
  )
}

const NOTE_MAX_FONT = 8.5
const NOTE_MIN_FONT = 4
const NOTE_LINE_HEIGHT_RATIO = 1.2
const NOTE_PAD = 6

// A single offscreen canvas, reused for every text measurement instead of
// creating one per room per render.
const measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null

function textWidth(text: string, fontSize: number): number {
  if (!measureCtx) return text.length * fontSize * 0.55 // rough fallback, e.g. SSR
  measureCtx.font = `${fontSize}px ${MAP_FONT}`
  return measureCtx.measureText(text).width
}

/** The monster/loot note for one room, as 1-2 short lines — or nothing for a
 *  deliberately empty room or one that hasn't been rolled yet. Shrinks to fit
 *  the room, and is hard-clipped to its bounds as a backstop, so a note can
 *  never spill past its own walls. `reserveCorner` shrinks and shifts the
 *  note's available space away from the bottom-right corner, where a stair
 *  badge may be sitting — both used to anchor at the exact room center,
 *  which meant a note and a stair badge in the same room always overlapped. */
function RoomNote({ room, reserveCorner = false }: { room: Room; reserveCorner?: boolean }) {
  if (!room.encounter) return null
  const lines: string[] = []
  if (room.encounter.monsters.length) lines.push(describeEncounter(room.encounter.monsters))
  if (room.encounter.loot) lines.push(room.encounter.loot)
  if (lines.length === 0) return null

  const cornerBand = reserveCorner ? STAIR_BADGE_H + STAIR_MARGIN * 2 : 0
  const maxW = room.w - NOTE_PAD * 2
  const maxH = room.h - NOTE_PAD * 2 - cornerBand
  if (maxW < 12 || maxH < 8) return null // room too small to hold any text at all

  let fontSize = NOTE_MAX_FONT
  let lineHeight = fontSize * NOTE_LINE_HEIGHT_RATIO
  while (fontSize > NOTE_MIN_FONT) {
    const widest = Math.max(...lines.map((l) => textWidth(l, fontSize)))
    if (widest <= maxW && lines.length * lineHeight <= maxH) break
    fontSize -= 0.5
    lineHeight = fontSize * NOTE_LINE_HEIGHT_RATIO
  }
  // Even at the smallest usable size it still overflows — skip rather than spill.
  const widest = Math.max(...lines.map((l) => textWidth(l, fontSize)))
  if (widest > maxW || lines.length * lineHeight > maxH) return null

  const cx = room.x + room.w / 2
  // Centered on the space ABOVE the reserved corner band, not the whole room.
  const cy = room.y + (room.h - cornerBand) / 2
  const startDy = -((lines.length - 1) * lineHeight) / 2
  const clipId = `room-note-clip-${room.id}`

  return (
    <g clipPath={`url(#${clipId})`}>
      <clipPath id={clipId}>
        <rect x={room.x} y={room.y} width={room.w} height={room.h} />
      </clipPath>
      <text x={cx} y={cy} textAnchor="middle" fontFamily={MAP_FONT} fontSize={fontSize} fill={THEME.ink}>
        {lines.map((line, i) => (
          <tspan key={i} x={cx} dy={i === 0 ? startDy : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}

/** Outlines the entrance/boss rooms in a distinct color and drops a small
 *  corner badge — "we have to know which is the first room", and the boss
 *  room needs to read as unmistakably special even with notes hidden. */
function RoomBadge({ room, kind }: { room: Room; kind: 'entrance' | 'boss' }) {
  const label = kind === 'entrance' ? 'ENTRANCE' : 'BOSS'
  const color = kind === 'entrance' ? THEME.roadPrimaryStroke : THEME.selection
  const badgeW = label.length * 5.5 + 8
  return (
    <g>
      <rect x={room.x} y={room.y} width={room.w} height={room.h} fill="none" stroke={color} strokeWidth={3} rx={2} />
      <rect x={room.x + 5} y={room.y + 5} width={badgeW} height={13} rx={3} fill={color} />
      <text x={room.x + 5 + badgeW / 2} y={room.y + 5 + 6.5} textAnchor="middle" dominantBaseline="central" fontFamily={MAP_FONT} fontSize={9} fontWeight="bold" fill={THEME.parchment}>
        {label}
      </text>
    </g>
  )
}

// Level numbers are always single-digit (levelCount tops out at 6), so the
// label length — and therefore the badge footprint — stays effectively
// constant; other components use these to reserve/avoid the badge's corner.
const STAIR_BADGE_H = 16
const STAIR_BADGE_W = 7 * 6 + 10 // "▼ LVL n" is always 7 chars (levelCount tops out at 6, always single-digit)
const STAIR_MARGIN = 8

/** A stairway landing — shown only on whichever end of the stair is on the
 *  currently-displayed level. A bare arrow glyph tested as too easy to miss
 *  or misread at a glance, so this spells out exactly what it does: an
 *  arrow AND the destination level number, in a distinct color no door uses.
 *  Anchored near a room's bottom-right corner (like the entrance/boss badges
 *  anchor top-left) rather than dead-center, so it never lands on top of
 *  that room's encounter note. A hover title spells it out in full for
 *  anyone still unsure. */
function StairGlyph({ cx, cy, direction, otherLevel }: { cx: number; cy: number; direction: 'up' | 'down'; otherLevel: number }) {
  const label = `${direction === 'up' ? '▲' : '▼'} LVL ${otherLevel + 1}`
  const w = STAIR_BADGE_W
  const h = STAIR_BADGE_H
  return (
    <g>
      <title>{direction === 'down' ? `Stairs down to Level ${otherLevel + 1}` : `Stairs up to Level ${otherLevel + 1}`}</title>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={h / 2} fill={STAIR_COLOR} stroke={THEME.ink} strokeWidth={1.5} />
      <text x={cx} y={cy + 0.5} textAnchor="middle" dominantBaseline="central" fontFamily={MAP_FONT} fontSize={9.5} fontWeight="bold" fill={THEME.parchment}>
        {label}
      </text>
    </g>
  )
}

export function DungeonCanvas() {
  const bounds = useDungeonStore((s) => s.scene.bounds)
  const allRooms = useDungeonStore((s) => s.scene.rooms)
  const allCorridors = useDungeonStore((s) => s.scene.corridors)
  const allDoors = useDungeonStore((s) => s.scene.doors)
  const stairs = useDungeonStore((s) => s.scene.stairs)
  const entranceRoomId = useDungeonStore((s) => s.scene.entranceRoomId)
  const bossRoomId = useDungeonStore((s) => s.scene.bossRoomId)
  const showRoomNotes = useDungeonStore((s) => s.showRoomNotes)
  const currentLevel = useDungeonStore((s) => s.currentLevel)

  const rooms = useMemo(() => allRooms.filter((r) => r.level === currentLevel), [allRooms, currentLevel])
  const corridors = useMemo(() => allCorridors.filter((c) => c.level === currentLevel), [allCorridors, currentLevel])
  const doors = useMemo(() => allDoors.filter((d) => d.level === currentLevel), [allDoors, currentLevel])
  const stairsDown = useMemo(() => stairs.filter((s) => s.levelFrom === currentLevel), [stairs, currentLevel])
  const stairsUp = useMemo(() => stairs.filter((s) => s.levelTo === currentLevel), [stairs, currentLevel])
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms])
  // Rooms holding a stair on this level reserve a bottom-right corner for its
  // badge, so the room's own encounter note (also normally room-centered)
  // shrinks and shifts up to avoid it instead of sitting directly underneath.
  const roomsWithStair = useMemo(() => {
    const ids = new Set<string>()
    for (const s of stairsDown) ids.add(s.roomFromId)
    for (const s of stairsUp) ids.add(s.roomToId)
    return ids
  }, [stairsDown, stairsUp])

  /** A stair's stored position is its room's center — placing the badge
   *  there directly would land it right on top of the room's encounter
   *  note, which is also room-centered. Re-anchor to the room's
   *  bottom-right corner instead, falling back to the stored center point
   *  if the room can't be found (shouldn't happen). */
  const stairCornerPos = (roomId: string, fallback: Point) => {
    const room = roomById.get(roomId)
    if (!room) return fallback
    return {
      x: room.x + room.w - STAIR_MARGIN - STAIR_BADGE_W / 2,
      y: room.y + room.h - STAIR_MARGIN - STAIR_BADGE_H / 2,
    }
  }

  const corridorShapes = useMemo(
    () => (corridors.length === 0 ? [] : unionPolygonsRobust(corridors.map(corridorToPolygon))),
    [corridors],
  )

  const corridorD = useMemo(() => {
    if (corridorShapes.length === 0) return ''
    return corridorShapes.map((ring) => toPath(ring, true)).join(' ')
  }, [corridorShapes])

  const svgRef = useRef<SVGSVGElement | null>(null)
  const [view, setView] = useState<View>(() => {
    const pad = bounds.width * 0.05
    return { x: -pad, y: -pad, w: bounds.width + pad * 2, h: bounds.height + pad * 2 }
  })

  useEffect(() => {
    const pad = bounds.width * 0.05
    setView({ x: -pad, y: -pad, w: bounds.width + pad * 2, h: bounds.height + pad * 2 })
  }, [bounds.width, bounds.height])

  const panState = useRef<{ x: number; y: number; view: View } | null>(null)

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const mx = (e.clientX - rect.left) / rect.width
      const my = (e.clientY - rect.top) / rect.height
      const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12
      const newW = Math.min(bounds.width * 3, Math.max(bounds.width * 0.1, view.w * factor))
      const newH = newW * (view.h / view.w)
      const wx = view.x + mx * view.w
      const wy = view.y + my * view.h
      setView({ x: wx - mx * newW, y: wy - my * newH, w: newW, h: newH })
    },
    [bounds.width, view],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    panState.current = { x: e.clientX, y: e.clientY, view }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const ps = panState.current
    if (!ps) return
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scaleX = ps.view.w / rect.width
    const scaleY = ps.view.h / rect.height
    const dx = (e.clientX - ps.x) * scaleX
    const dy = (e.clientY - ps.y) * scaleY
    setView({ x: ps.view.x - dx, y: ps.view.y - dy, w: ps.view.w, h: ps.view.h })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    panState.current = null
    ;(e.target as Element).releasePointerCapture(e.pointerId)
  }

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', background: THEME.parchment, touchAction: 'none' }}
      onWheel={onWheel}
    >
      <MapDefs />

      <rect
        x={view.x}
        y={view.y}
        width={view.w}
        height={view.h}
        fill={THEME.parchment}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

      <g pointerEvents="none">
        <rect x={0} y={0} width={bounds.width} height={bounds.height} filter="url(#paper-grain)" />
        <rect x={0} y={0} width={bounds.width} height={bounds.height} fill="url(#vignette)" />

        <g filter="url(#rough)">
          {corridorD && (
            // One path combining every ring, not one <path> per ring. When a
            // corridor wraps all the way around a room, Clipper's union
            // correctly returns that as an outer ring PLUS a hole-ring for
            // the room — rendering each ring as its own solid shape paints
            // the "hole" solid too, completely covering the room. fillRule
            // "evenodd" on one combined path treats alternating-winding
            // rings as holes; genuinely separate (non-overlapping) corridor
            // networks still render correctly as independent solid shapes.
            <path d={corridorD} fillRule="evenodd" fill={CORRIDOR_FILL} stroke={CORRIDOR_STROKE} strokeWidth={1.5} />
          )}
          {rooms.map((r) => (
            <RoomShape key={r.id} room={r} doors={doors} />
          ))}
        </g>

        {rooms.map((r) => {
          if (r.id === entranceRoomId) return <RoomBadge key={`badge-${r.id}`} room={r} kind="entrance" />
          if (r.id === bossRoomId) return <RoomBadge key={`badge-${r.id}`} room={r} kind="boss" />
          return null
        })}

        {doors.map((d) => (
          <DoorMark key={d.id} door={d} />
        ))}

        {stairsDown.map((s) => {
          const pos = stairCornerPos(s.roomFromId, s.posFrom)
          return <StairGlyph key={`${s.id}-down`} cx={pos.x} cy={pos.y} direction="down" otherLevel={s.levelTo} />
        })}
        {stairsUp.map((s) => {
          const pos = stairCornerPos(s.roomToId, s.posTo)
          return <StairGlyph key={`${s.id}-up`} cx={pos.x} cy={pos.y} direction="up" otherLevel={s.levelFrom} />
        })}

        {showRoomNotes && rooms.map((r) => <RoomNote key={r.id} room={r} reserveCorner={roomsWithStair.has(r.id)} />)}

        <Legend bounds={bounds} />
      </g>
    </svg>
  )
}
