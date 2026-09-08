export const crXpTable = [
  { cr: "0", xp: 10 },
  { cr: "1/8", xp: 25 },
  { cr: "1/4", xp: 50 },
  { cr: "1/2", xp: 100 },
  { cr: "1", xp: 200 },
  { cr: "2", xp: 450 },
  { cr: "3", xp: 700 },
  { cr: "4", xp: 1100 },
  { cr: "5", xp: 1800 },
  { cr: "6", xp: 2300 },
  { cr: "7", xp: 2900 },
  { cr: "8", xp: 3900 },
  { cr: "9", xp: 5000 },
  { cr: "10", xp: 5900 },
  { cr: "11", xp: 7200 },
  { cr: "12", xp: 8400 },
  { cr: "13", xp: 10000 },
  { cr: "14", xp: 11500 },
  { cr: "15", xp: 13000 },
  { cr: "16", xp: 15000 },
  { cr: "17", xp: 18000 },
  { cr: "18", xp: 20000 },
  { cr: "19", xp: 22000 },
  { cr: "20", xp: 25000 },
  { cr: "21", xp: 33000 },
  { cr: "22", xp: 41000 },
  { cr: "23", xp: 50000 },
  { cr: "24", xp: 62000 },
  { cr: "25", xp: 75000 },
  { cr: "26", xp: 90000 },
  { cr: "27", xp: 105000 },
  { cr: "28", xp: 120000 },
  { cr: "29", xp: 135000 },
  { cr: "30", xp: 155000 },
];
export const crXpNote =
  "Add up the XP of every monster in the encounter — that total is what you check against the party's XP budget (Encounter XP Budget, right), and it's what you award the party once the fight's over.";

export const proficiencyByCR = [
  { range: "CR 0–4", pb: "+2" },
  { range: "CR 5–8", pb: "+3" },
  { range: "CR 9–12", pb: "+4" },
  { range: "CR 13–16", pb: "+5" },
  { range: "CR 17–20", pb: "+6" },
  { range: "CR 21–24", pb: "+7" },
  { range: "CR 25–28", pb: "+8" },
  { range: "CR 29–30", pb: "+9" },
];
export const proficiencyByCRNote =
  "Only needed if you're building or reskinning a monster from scratch — a published stat block already has its Proficiency Bonus baked into the listed attack and save numbers.";

// XP Budget per character, by party level ("Combat Encounters", SRD 5.2 p.202).
// Verified directly against the official SRD 5.2 PDF — exact match.
export const xpBudgetByLevel = [
  { level: 1, low: 50, moderate: 75, high: 100 },
  { level: 2, low: 100, moderate: 150, high: 200 },
  { level: 3, low: 150, moderate: 225, high: 400 },
  { level: 4, low: 250, moderate: 375, high: 500 },
  { level: 5, low: 500, moderate: 750, high: 1100 },
  { level: 6, low: 600, moderate: 1000, high: 1400 },
  { level: 7, low: 750, moderate: 1300, high: 1700 },
  { level: 8, low: 1000, moderate: 1700, high: 2100 },
  { level: 9, low: 1300, moderate: 2000, high: 2600 },
  { level: 10, low: 1600, moderate: 2300, high: 3100 },
  { level: 11, low: 1900, moderate: 2900, high: 4100 },
  { level: 12, low: 2200, moderate: 3700, high: 4700 },
  { level: 13, low: 2600, moderate: 4200, high: 5400 },
  { level: 14, low: 2900, moderate: 4900, high: 6200 },
  { level: 15, low: 3300, moderate: 5400, high: 7800 },
  { level: 16, low: 3800, moderate: 6100, high: 9800 },
  { level: 17, low: 4500, moderate: 7200, high: 11700 },
  { level: 18, low: 5000, moderate: 8700, high: 14200 },
  { level: 19, low: 5500, moderate: 10700, high: 17200 },
  { level: 20, low: 6400, moderate: 13200, high: 22000 },
];

export const encounterNote =
  "Cross-reference the party's level with the difficulty, then multiply by party size for your XP budget. Add up monster XP until you're close to (not over) budget.";

// "Severity and Levels" (SRD 5.2 Traps, p.198-200): a trap — or any improvised damage
// source — is rated Nuisance or Deadly for a given level range. Verified by
// cross-referencing this exact progression against multiple example trap stat blocks
// in the SRD (e.g. Collapsing Roof's Deadly scaling, Poisoned Needle's Nuisance scaling).
export const improvisedDamage = [
  { levelTier: "1st–4th", nuisance: "5 (1d10)", deadly: "11 (2d10)" },
  { levelTier: "5th–10th", nuisance: "11 (2d10)", deadly: "22 (4d10)" },
  { levelTier: "11th–16th", nuisance: "22 (4d10)", deadly: "55 (10d10)" },
  { levelTier: "17th–20th", nuisance: "55 (10d10)", deadly: "99 (18d10)" },
];

export const improvisedDamageTierMeaning = [
  { tier: "Nuisance", meaning: "Unlikely to seriously harm a character of that level on its own." },
  { tier: "Deadly", meaning: "Can grievously harm a character of that level — potentially drop them to 0 HP." },
];

// Flat dice-to-example reference for picking a one-off damage die by feel, independent
// of level. Source: DMG "Improvising Damage" — not present in the free SRD 5.2, so this
// couldn't be independently verified the way the table above was; included on trust.
export const improvisingDamageExamples = [
  { dice: "1d10", examples: "Burned by coals, hit by a falling bookcase, pricked by a poison needle." },
  { dice: "2d10", examples: "Struck by lightning, stumbling into a fire pit." },
  { dice: "4d10", examples: "Hit by falling rubble in a collapsing tunnel, tumbling into a vat of acid." },
  { dice: "10d10", examples: "Crushed by compacting walls, hit by whirling steel blades, wading through lava." },
  { dice: "18d10", examples: "Submerged in lava, hit by a crashing flying fortress." },
  { dice: "24d10", examples: "Tumbling into a vortex of fire on the Elemental Plane of Fire, crushed in the jaws of a godlike creature or moon-sized monster." },
];

// Verified directly against the official SRD 5.2 PDF ("Rules Glossary", p.177) — exact match.
export const objectAC = [
  { ac: 11, substance: "Cloth, paper, rope" },
  { ac: 13, substance: "Crystal, glass, ice" },
  { ac: 15, substance: "Wood" },
  { ac: 17, substance: "Stone" },
  { ac: 19, substance: "Iron, steel" },
  { ac: 21, substance: "Mithral" },
  { ac: 23, substance: "Adamantine" },
];

export const objectHP = [
  { size: "Tiny (bottle, lock)", fragile: "2 (1d4)", resilient: "5 (2d4)" },
  { size: "Small (chest, lute)", fragile: "3 (1d6)", resilient: "10 (3d6)" },
  { size: "Medium (barrel, chandelier)", fragile: "4 (1d8)", resilient: "18 (4d8)" },
  { size: "Large (cart, dining table)", fragile: "5 (1d10)", resilient: "27 (5d10)" },
];
export const objectNote = "Objects have Immunity to Poison and Psychic damage. For Huge/Gargantuan objects, split into Large-or-smaller sections tracked separately.";

export const legendaryActionNote =
  "Legendary actions: usually 3/round, regain at the start of the monster's turn, spent at the end of another creature's turn (not the monster's own). Only one legendary creature acts between turns unless noted.";

export const lairActionNote =
  "Lair actions: trigger on initiative count 20 (losing ties), once per round, only while the monster is alive and in its lair.";
