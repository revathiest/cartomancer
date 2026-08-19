import type { MonsterGroup, Room, RoomEncounter } from './types.ts'
import { hashString, makeRng, type Rng } from '../generation/rng.ts'

const CR_STEPS = [0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

function nearestCrStep(value: number): number {
  return CR_STEPS.reduce((best, step) => (Math.abs(step - value) < Math.abs(best - value) ? step : best))
}

function formatCR(cr: number): string {
  if (cr === 0.125) return '1/8'
  if (cr === 0.25) return '1/4'
  if (cr === 0.5) return '1/2'
  return String(cr)
}

/** 5e's DMG treasure tables are banded by CR — this just points at the band,
 *  it doesn't roll an actual item. */
function lootTierFor(cr: number): string {
  if (cr <= 4) return 'Tier I hoard (CR 0–4)'
  if (cr <= 10) return 'Tier II hoard (CR 5–10)'
  if (cr <= 16) return 'Tier III hoard (CR 11–16)'
  return 'Tier IV hoard (CR 17+)'
}

function rollMonsterGroup(partyLevel: number, partySize: number, rng: Rng): MonsterGroup {
  const lo = Math.max(0.125, partyLevel - 3)
  const hi = partyLevel + 2
  const cr = nearestCrStep(rng.range(lo, hi))
  const scale = partySize / 4

  let count: number
  if (cr <= partyLevel / 2) count = Math.round(rng.int(3, 6) * scale)
  else if (cr <= partyLevel) count = Math.round(rng.int(1, 3) * scale)
  else count = Math.round(rng.int(1, 2) * Math.max(1, scale * 0.6))

  return { cr, count: Math.max(1, count) }
}

// Unguarded hoards are rarer than guarded ones — a loot-only room draws from
// `lootChance` scaled down by this factor, instead of the full slider value.
const UNGUARDED_LOOT_FACTOR = 0.3

/** Deterministically rolls a monster + loot note for one room, seeded from
 *  the room's own id so re-rolling one room's encounter (if ever added)
 *  wouldn't have to touch any other room. `monsterChance` and `lootChance`
 *  are independent [0,1] sliders, but loot is weighted toward monster rooms
 *  rather than a flat chance either way. */
export function generateRoomEncounter(
  room: Room,
  partyLevel: number,
  partySize: number,
  monsterChance: number,
  lootChance: number,
  encounterSeed: number,
): RoomEncounter | null {
  const rng = makeRng((encounterSeed ^ hashString(room.id)) >>> 0)
  const hasMonsters = rng.next() < monsterChance

  const monsters: MonsterGroup[] = []
  if (hasMonsters) {
    monsters.push(rollMonsterGroup(partyLevel, partySize, rng))
    if (rng.next() < 0.3) {
      const second = rollMonsterGroup(partyLevel, partySize, rng) // a second, tougher group
      if (second.cr === monsters[0].cr) monsters[0].count += second.count
      else monsters.push(second)
    }
  }

  const effectiveLootChance = hasMonsters ? lootChance : lootChance * UNGUARDED_LOOT_FACTOR
  let loot: string | null = null
  if (rng.next() < effectiveLootChance) {
    const refCr = monsters.length ? Math.max(...monsters.map((m) => m.cr)) : nearestCrStep(partyLevel)
    loot = lootTierFor(refCr)
  }

  if (monsters.length === 0 && loot === null) return null // deliberately empty room
  return { monsters, loot }
}

/** The boss room's encounter is guaranteed, not rolled — "the monster and/or
 *  treasure that lured the group into the dungeon to begin with." A solo
 *  threat well above party level, escorted by a few lesser guards if the
 *  party's big enough to warrant it, plus a guaranteed hoard at that tier. */
export function generateBossEncounter(partyLevel: number, partySize: number): RoomEncounter {
  const bossCr = nearestCrStep(partyLevel + 3)
  const monsters: MonsterGroup[] = [{ cr: bossCr, count: 1 }]
  if (partySize >= 3) {
    const escortCr = nearestCrStep(Math.max(1, partyLevel - 1))
    monsters.push({ cr: escortCr, count: Math.max(1, Math.round(partySize / 2)) })
  }
  return { monsters, loot: lootTierFor(bossCr) }
}

function describeGroup(g: MonsterGroup): string {
  const crStr = `CR${formatCR(g.cr)}`
  return g.count === 1 ? `a ${crStr} monster` : `${g.count} ${crStr} monsters`
}

/** e.g. "3 CR2 monsters and a CR4 monster", or "5 CR1 monsters". */
export function describeEncounter(monsters: MonsterGroup[]): string {
  return monsters.map(describeGroup).join(' and ')
}
