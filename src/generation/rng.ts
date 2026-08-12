import { createNoise2D } from 'simplex-noise'

/** FNV-1a hash of a string to a 32-bit integer — used to derive a stable
 *  per-entity RNG seed (e.g. per-district) from an id. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 — small, fast, deterministic PRNG seeded from a 32-bit integer. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rng = {
  /** Uniform in [0, 1). */
  next: () => number
  /** Uniform in [min, max). */
  range: (min: number, max: number) => number
  /** Integer in [min, max]. */
  int: (min: number, max: number) => number
  /** Pick a random element. */
  pick: <T>(arr: readonly T[]) => T
  /** Weighted pick: entries are [value, weight]. */
  weighted: <T>(entries: readonly [T, number][]) => T
  /** Seeded 2D simplex noise in [-1, 1]. */
  noise2D: (x: number, y: number) => number
}

/** Build a deterministic RNG bundle (PRNG + simplex noise) from one integer seed. */
export function makeRng(seed: number): Rng {
  const rand = mulberry32(seed)
  // Derive the noise generator from a second stream so noise and rand don't alias.
  const noiseRand = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  const noise2D = createNoise2D(noiseRand)

  const next = () => rand()
  const range = (min: number, max: number) => min + rand() * (max - min)
  const int = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1))
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]
  const weighted = <T>(entries: readonly [T, number][]): T => {
    const total = entries.reduce((s, e) => s + e[1], 0)
    let r = rand() * total
    for (const [value, weight] of entries) {
      r -= weight
      if (r <= 0) return value
    }
    return entries[entries.length - 1][0]
  }

  return { next, range, int, pick, weighted, noise2D }
}
