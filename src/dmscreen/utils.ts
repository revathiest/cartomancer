export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollDice(count: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += rollDie(sides);
  return total;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Challenge Rating strings ("0", "1/8", "1/2", "20", ...) as a comparable number.
export function crToNumber(cr: string): number {
  if (cr.includes("/")) {
    const [n, d] = cr.split("/").map(Number);
    return n / d;
  }
  return Number(cr);
}

export function pickWeighted<K extends string>(weights: Partial<Record<K, number>>): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}
