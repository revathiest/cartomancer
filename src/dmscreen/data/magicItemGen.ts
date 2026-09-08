// Data + tables backing the Custom Magic Item generator. Category/attunement/archetype
// odds themselves live in magicItemStats.ts (derived from the 237-item pool); this file
// holds the genuinely-verified SRD tables the generator anchors to, the rarity-expansion
// logic that fills gaps in that measured data, and the flavor-only word lists needed to
// turn a (category, archetype, rarity) roll into prose.
import { archetypeWeightsByRarity, categoryWeightsByRarity } from "./magicItemStats";

// Verified — SRD 5.2 p.241, "Spell Scroll" item entry: the table mapping a spell's level
// to the scroll's rarity, save DC, and attack bonus; gp is 2x the "Spell Scroll Costs"
// table (p.103) per the real rule that a Spell Scroll's value is double its scribing cost.
// levelNum (0 = Cantrip) feeds spellChargesForLevel() below.
export interface SpellScrollRow {
  level: string;
  levelNum: number;
  rarity: string;
  dc: number;
  atk: number;
  gp: number;
}
export const spellScrollByLevel: SpellScrollRow[] = [
  { level: "Cantrip", levelNum: 0, rarity: "Common", dc: 13, atk: 5, gp: 30 },
  { level: "1st", levelNum: 1, rarity: "Common", dc: 13, atk: 5, gp: 50 },
  { level: "2nd", levelNum: 2, rarity: "Uncommon", dc: 13, atk: 5, gp: 200 },
  { level: "3rd", levelNum: 3, rarity: "Uncommon", dc: 15, atk: 7, gp: 300 },
  { level: "4th", levelNum: 4, rarity: "Rare", dc: 15, atk: 7, gp: 2000 },
  { level: "5th", levelNum: 5, rarity: "Rare", dc: 17, atk: 9, gp: 3000 },
  { level: "6th", levelNum: 6, rarity: "Very Rare", dc: 17, atk: 9, gp: 20000 },
  { level: "7th", levelNum: 7, rarity: "Very Rare", dc: 18, atk: 10, gp: 25000 },
  { level: "8th", levelNum: 8, rarity: "Very Rare", dc: 18, atk: 10, gp: 30000 },
  { level: "9th", levelNum: 9, rarity: "Legendary", dc: 19, atk: 11, gp: 100000 },
];

// Charges for a non-consumable Spell-like item (Wand/Staff/Rod/Ring/Wondrous/Weapon),
// scaled by the level of spell it casts. Cantrips are at-will (null) because that's how
// cantrips actually work in 5e — no spell slot, no resource to track — not a designed
// choice. For leveled spells, checked against every real charge-bearing spellcasting item
// in the 237-item pool that casts one identifiable, single spell (magicItemStats.ts):
//   level 1: Wand of Magic Missiles 7, Wand of Magic Detection 3, Staff of Charming 10 → avg 6.7
//   level 2: Wand of Web 7, Medallion of Thoughts 5 → avg 6
//   level 3: Wand of Fireballs 7, Wand of Lightning Bolts 7 → avg 7
//   level 4: Wand of Polymorph 7 (Trident of Fish Command's 3 excluded — that item casts a
//            level-4 spell on a rarity a tier below where the spell table would put it, an
//            intentional real-item nerf for a different reason, not a level-charges signal)
//   level 7: Helm of Teleportation 3 (single sample; also a below-tier item, same caveat)
// The real data is noisy (small samples, and non-Scroll items don't strictly follow the
// Spell Scroll table's level-to-rarity mapping at all — several are shown above), but it's
// flat-to-mildly-declining from level 1 to 4 and clearly lower by level 7, which matches
// clamp(10 - level, 3, 10): 9,8,7,6,5,4,3,3,3 for levels 1-9 — close to the level 1-3
// averages (~6-7) and exactly matching the one level-7 sample (3).
export function spellChargesForLevel(levelNum: number): number | null {
  if (levelNum <= 0) return null;
  return Math.max(3, Math.min(10, 10 - levelNum));
}

// Verified — SRD 5.2, "Magic Item Rarities and Values" table. The table's own footnote:
// "Halve the value for a consumable item other than a Spell Scroll" — applied to Potions
// via potionGpValue() below; Spell Scrolls use their own gp column above instead.
export const gpValueByRarity: Record<string, number> = {
  Common: 100,
  Uncommon: 400,
  Rare: 4000,
  "Very Rare": 40000,
  Legendary: 200000,
};
export function potionGpValue(rarity: string): number {
  return gpValueByRarity[rarity] / 2;
}

// Real, verified: how many of the 10 spell levels in the table above map to each rarity —
// feeds the Scroll category weight below with a genuine count, the same way every other
// category weight in magicItemStats.ts is a genuine count, just drawn from this table
// instead of the 237-item pool (Spell Scroll itself was excluded from that pool as a
// "Rarity Varies" entry — see the comment above realMagicItems).
export const scrollLevelCountByRarity: Record<string, number> = {
  Common: 2, Uncommon: 2, Rare: 2, "Very Rare": 3, Legendary: 1,
};

export const allItemCategories = ["Potion", "Scroll", "Wondrous Item", "Ring", "Rod", "Staff", "Wand", "Weapon", "Armor"];
export const allArchetypes = ["Spell-like", "Stat-set", "Resistance/Immunity", "Passive bonus", "Utility/Other"];

// Common's own real sample is just 2 items (both Potions, both Utility/Other) — far too
// thin to trust as a distribution on its own; taken at face value every non-Potion category
// and non-Utility archetype would only ever appear via the flat gap-fill below, rigidly
// uniform regardless of how the rest of the game actually distributes items. But
// Uncommon/Rare/Very Rare/Legendary all share a strikingly similar shape (Wondrous Item
// dominant category at 40–65%, Utility/Other dominant archetype at 60–72%, in roughly the
// same relative proportions at all four), so Common's distribution is instead the average
// of those four real, larger-sample shapes — a better estimate of "what Common would look
// like with more data" than either the n=2 sample or a uniform fill.
//
// The average is scaled back up to an "equivalent item count" (the four rarities' average
// pool size, ~58.75) rather than left as raw percentages — extendedCategoryWeights below
// merges this with Scroll's small real count (2-3), and a percentage (summing to 1) merged
// directly against a count would let Scroll swamp everything else. Scaling first keeps
// Scroll's share proportionate to what it is at every other rarity (~3%). Fully
// reproducible: average categoryWeightsByRarity/archetypeWeightsByRarity (magicItemStats.ts)
// over those same four rarities yourself and you get commonCategoryShape/
// commonArchetypeShape exactly.
const NON_COMMON_RARITIES = ["Uncommon", "Rare", "Very Rare", "Legendary"];
function averageShape(weightsByRarity: Record<string, Record<string, number>>): Record<string, number> {
  const totals: Record<string, number> = {};
  let grandTotal = 0;
  for (const r of NON_COMMON_RARITIES) {
    const w = weightsByRarity[r] ?? {};
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    grandTotal += sum;
    for (const [k, v] of Object.entries(w)) {
      totals[k] = (totals[k] ?? 0) + v / sum;
    }
  }
  const avgPoolSize = grandTotal / NON_COMMON_RARITIES.length;
  const avg: Record<string, number> = {};
  for (const k of Object.keys(totals)) avg[k] = (totals[k] / NON_COMMON_RARITIES.length) * avgPoolSize;
  return avg;
}
export const commonCategoryShape = averageShape(categoryWeightsByRarity);
export const commonArchetypeShape = averageShape(archetypeWeightsByRarity);

// Only one gap remains among Uncommon/Rare/Very Rare/Legendary once Common is handled
// separately above: Legendary has zero real Wand samples (every other category is present
// at all four of those rarities, and every archetype is present at all four too). Rather
// than a token flat weight of 1 — which would make Legendary's category *list* match the
// other three rarities without its *odds* being comparably estimated — this reuses the same
// cross-tier-average idea: take Wand's real share at every rarity that does have it
// (Uncommon 5.6%, Rare 8.4%, Very Rare 2.0%), average them, and scale that percentage by
// Legendary's own real pool size (30) to get an equivalent count (~1.6) instead of guessing.
function estimateGapWeight(key: string, weightsByRarity: Record<string, Record<string, number>>, rarity: string, candidateRarities: string[]): number {
  const shares: number[] = [];
  for (const r of candidateRarities) {
    const w = weightsByRarity[r];
    if (w && key in w) {
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      shares.push(w[key] / sum);
    }
  }
  if (shares.length === 0) return 1; // key has no real precedent anywhere — token weight
  const avgShare = shares.reduce((a, b) => a + b, 0) / shares.length;
  const targetSum = Object.values(weightsByRarity[rarity] ?? {}).reduce((a, b) => a + b, 0);
  return Math.max(0.5, avgShare * targetSum);
}

// Layers two things onto the measured categoryWeightsByRarity (magicItemStats.ts): (1)
// Scroll, whose count is real but comes from the verified table above rather than the
// 237-item pool; (2) an estimated weight (see estimateGapWeight above) for any category
// with zero real samples at that rarity — currently only Wand at Legendary — so every
// rarity ends up with the same *set* of reachable categories, not just Common. What
// justifies a category showing up somewhere it has no real precedent is the same lever the
// SRD itself already uses to make a cheap item viable — a capped duration or uses/day (see
// dailyUsesByRarity below) — not a fabricated real-item count.
export function extendedCategoryWeights(rarity: string): Record<string, number> {
  const measured = rarity === "Common" ? commonCategoryShape : categoryWeightsByRarity[rarity] ?? {};
  const extended: Record<string, number> = { ...measured, Scroll: scrollLevelCountByRarity[rarity] };
  for (const cat of allItemCategories) {
    if (!(cat in extended)) extended[cat] = estimateGapWeight(cat, categoryWeightsByRarity, rarity, NON_COMMON_RARITIES);
  }
  return extended;
}

// Same idea for archetype — every non-Common rarity's real data already covers all 5
// archetypes, so this never actually fires for them today; Common uses the averaged shape
// above instead of its own all-Utility/Other sample.
export function extendedArchetypeWeights(rarity: string): Record<string, number> {
  const measured = rarity === "Common" ? commonArchetypeShape : archetypeWeightsByRarity[rarity] ?? {};
  const extended: Record<string, number> = { ...measured };
  for (const a of allArchetypes) {
    if (!(a in extended)) extended[a] = estimateGapWeight(a, archetypeWeightsByRarity, rarity, NON_COMMON_RARITIES);
  }
  return extended;
}

// When a (category, rarity) combination has no real precedent — filled in by the flat
// weight above — a permanent "while you wear/hold this" effect wouldn't be appropriately
// weak for that rarity. Capping it to a number of uses per day (Common/Uncommon/Rare) is
// the same self-limiting trade real Potions and Spell Scrolls already make to justify
// existing at low rarity. Very Rare/Legendary combinations stay permanent, matching how
// real items at those rarities are written (null = no cap).
export const dailyUsesByRarity: Record<string, number | null> = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  "Very Rare": null,
  Legendary: null,
};

// Unlike spellChargesForLevel above, there's no real item to calibrate this against —
// nothing in the SRD gives a "uses/day, weaker than a potion" wearable item, since real
// design just doesn't publish Common/Uncommon/Rare wearables this weak. This is a designed
// (not measured) formula: each rarity gets a total daily "uptime" budget, and dividing by
// dailyUsesByRarity gives the duration of a single use. Rare's total (60 min) is pinned to
// match a single Potion's full-hour dose — by the time an item is strong enough to stop
// needing a daily cap (Very Rare+), its capped-tier version already matched a potion's
// power. Common and Uncommon sit under that on both total uptime and per-use duration.
export const dailyUptimeMinutesByRarity: Record<string, number> = {
  Common: 10,
  Uncommon: 30,
  Rare: 60,
};
export function limitedUseDurationMinutes(rarity: string): number {
  const totalMinutes = dailyUptimeMinutesByRarity[rarity];
  const uses = dailyUsesByRarity[rarity] ?? 1;
  return Math.round(totalMinutes / uses);
}
export function limitedDurationPhrase(rarity: string): string {
  return `${limitedUseDurationMinutes(rarity)} minutes`;
}

// Flavor-only spell name suggestions per level, to fill in the blank the real Spell
// Scroll table leaves open (it fixes DC/attack bonus/rarity by level, not which spell).
// This is every spell in the free SRD 5.2 that has its own real entry, 339 in total —
// extracted programmatically by scanning the whole document for the "Level N School
// (Classes)" / "School Cantrip (Classes)" header line every spell has, then reading each
// one's Duration and classifying its mechanic. mechanic is "attack" only when the spell's
// primary effect is the caster making a spell attack roll, "save" only when it forces a
// creature to make a saving throw as the primary effect (not a secondary/downstream case,
// e.g. Fire Shield's attacker, Holy Aura's would-be Blinder, Forcecage's escape attempt —
// all classified "none" since the spell's own main effect requires neither), else "none".
// Classification was done by keyword pattern across all 339 and spot-verified against ~110
// individually read spell entries; some misclassification is possible at this scale (same
// "anomalies expected" caveat as everywhere else real-data-derived in this file) but the
// pattern is fully re-derivable from the SRD text. Six spells referenced only in class
// spell-list indexes, with no real entry to source data from, are excluded entirely:
// Frostbite, Toll the Dead, Absorb Elements, Erupting Earth, Investiture of Flame,
// Feeblemind.
export interface FlavorSpell {
  name: string;
  mechanic: "attack" | "save" | "none";
  duration: string; // "Instantaneous" suppresses the duration clause entirely
}
export const flavorSpellsByLevel: Record<string, FlavorSpell[]> = {
  Cantrip: [
    { name: "Acid Splash", mechanic: "save", duration: "Instantaneous" },
    { name: "Chill Touch", mechanic: "attack", duration: "Instantaneous" },
    { name: "Dancing Lights", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Druidcraft", mechanic: "none", duration: "Instantaneous" },
    { name: "Eldritch Blast", mechanic: "attack", duration: "Instantaneous" },
    { name: "Elementalism", mechanic: "none", duration: "Instantaneous" },
    { name: "Fire Bolt", mechanic: "attack", duration: "Instantaneous" },
    { name: "Guidance", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Light", mechanic: "none", duration: "1 hour" },
    { name: "Mage Hand", mechanic: "none", duration: "1 minute" },
    { name: "Mending", mechanic: "none", duration: "Instantaneous" },
    { name: "Message", mechanic: "none", duration: "1 round" },
    { name: "Minor Illusion", mechanic: "none", duration: "1 minute" },
    { name: "Poison Spray", mechanic: "attack", duration: "Instantaneous" },
    { name: "Prestidigitation", mechanic: "none", duration: "Up to 1 hour" },
    { name: "Produce Flame", mechanic: "attack", duration: "10 minutes" },
    { name: "Ray of Frost", mechanic: "attack", duration: "Instantaneous" },
    { name: "Resistance", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Sacred Flame", mechanic: "save", duration: "Instantaneous" },
    { name: "Shillelagh", mechanic: "none", duration: "1 minute" },
    { name: "Shocking Grasp", mechanic: "attack", duration: "Instantaneous" },
    { name: "Sorcerous Burst", mechanic: "attack", duration: "Instantaneous" },
    { name: "Spare the Dying", mechanic: "none", duration: "Instantaneous" },
    { name: "Starry Wisp", mechanic: "attack", duration: "Instantaneous" },
    { name: "Thaumaturgy", mechanic: "none", duration: "Up to 1 minute" },
    { name: "True Strike", mechanic: "none", duration: "Instantaneous" },
    { name: "Vicious Mockery", mechanic: "save", duration: "Instantaneous" },
  ],
  "1st": [
    { name: "Alarm", mechanic: "none", duration: "8 hours" },
    { name: "Animal Friendship", mechanic: "save", duration: "24 hours" },
    { name: "Bane", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Bless", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Burning Hands", mechanic: "save", duration: "Instantaneous" },
    { name: "Charm Person", mechanic: "save", duration: "1 hour" },
    { name: "Chromatic Orb", mechanic: "attack", duration: "Instantaneous" },
    { name: "Color Spray", mechanic: "save", duration: "Instantaneous" },
    { name: "Command", mechanic: "save", duration: "Instantaneous" },
    { name: "Comprehend Languages", mechanic: "none", duration: "1 hour" },
    { name: "Create or Destroy Water", mechanic: "none", duration: "Instantaneous" },
    { name: "Cure Wounds", mechanic: "none", duration: "Instantaneous" },
    { name: "Detect Evil and Good", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Detect Magic", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Detect Poison and Disease", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Disguise Self", mechanic: "none", duration: "1 hour" },
    { name: "Dissonant Whispers", mechanic: "save", duration: "Instantaneous" },
    { name: "Divine Favor", mechanic: "none", duration: "1 minute" },
    { name: "Divine Smite", mechanic: "none", duration: "Instantaneous" },
    { name: "Ensnaring Strike", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Entangle", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Expeditious Retreat", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Faerie Fire", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "False Life", mechanic: "none", duration: "Instantaneous" },
    { name: "Feather Fall", mechanic: "none", duration: "1 minute" },
    { name: "Find Familiar", mechanic: "none", duration: "Instantaneous" },
    { name: "Floating Disk", mechanic: "none", duration: "1 hour" },
    { name: "Fog Cloud", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Goodberry", mechanic: "none", duration: "24 hours" },
    { name: "Grease", mechanic: "save", duration: "1 minute" },
    { name: "Guiding Bolt", mechanic: "attack", duration: "1 round" },
    { name: "Healing Word", mechanic: "none", duration: "Instantaneous" },
    { name: "Hellish Rebuke", mechanic: "save", duration: "Instantaneous" },
    { name: "Heroism", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Hex", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Hideous Laughter", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Hunter's Mark", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Ice Knife", mechanic: "save", duration: "Instantaneous" },
    { name: "Identify", mechanic: "none", duration: "Instantaneous" },
    { name: "Illusory Script", mechanic: "none", duration: "10 days" },
    { name: "Inflict Wounds", mechanic: "save", duration: "Instantaneous" },
    { name: "Jump", mechanic: "none", duration: "1 minute" },
    { name: "Longstrider", mechanic: "none", duration: "1 hour" },
    { name: "Mage Armor", mechanic: "none", duration: "8 hours" },
    { name: "Magic Missile", mechanic: "none", duration: "Instantaneous" },
    { name: "Protection from Evil and Good", mechanic: "none", duration: "1 hour" },
    { name: "Purify Food and Drink", mechanic: "none", duration: "Instantaneous" },
    { name: "Ray of Sickness", mechanic: "attack", duration: "Instantaneous" },
    { name: "Sanctuary", mechanic: "save", duration: "1 minute" },
    { name: "Searing Smite", mechanic: "save", duration: "1 minute" },
    { name: "Shield", mechanic: "none", duration: "1 round" },
    { name: "Shield of Faith", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Silent Image", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Sleep", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Speak with Animals", mechanic: "none", duration: "10 minutes" },
    { name: "Thunderwave", mechanic: "save", duration: "Instantaneous" },
    { name: "Unseen Servant", mechanic: "none", duration: "1 hour" },
  ],
  "2nd": [
    { name: "Acid Arrow", mechanic: "attack", duration: "Instantaneous" },
    { name: "Aid", mechanic: "none", duration: "8 hours" },
    { name: "Alter Self", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Animal Messenger", mechanic: "save", duration: "24 hours" },
    { name: "Arcane Lock", mechanic: "none", duration: "Until dispelled" },
    { name: "Arcanist's Magic Aura", mechanic: "none", duration: "24 hours" },
    { name: "Augury", mechanic: "none", duration: "Instantaneous" },
    { name: "Barkskin", mechanic: "none", duration: "1 hour" },
    { name: "Blindness/Deafness", mechanic: "save", duration: "1 minute" },
    { name: "Blur", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Calm Emotions", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Continual Flame", mechanic: "none", duration: "Until dispelled" },
    { name: "Darkness", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Darkvision", mechanic: "none", duration: "8 hours" },
    { name: "Detect Thoughts", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Dragon's Breath", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Enhance Ability", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Enlarge/Reduce", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Enthrall", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Find Steed", mechanic: "none", duration: "Instantaneous" },
    { name: "Find Traps", mechanic: "none", duration: "Instantaneous" },
    { name: "Flame Blade", mechanic: "attack", duration: "Concentration, up to 10 minutes" },
    { name: "Flaming Sphere", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Gentle Repose", mechanic: "none", duration: "10 days" },
    { name: "Gust of Wind", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Heat Metal", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Hold Person", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Invisibility", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Knock", mechanic: "none", duration: "Instantaneous" },
    { name: "Lesser Restoration", mechanic: "none", duration: "Instantaneous" },
    { name: "Levitate", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Locate Animals or Plants", mechanic: "none", duration: "Instantaneous" },
    { name: "Locate Object", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Magic Mouth", mechanic: "none", duration: "Until dispelled" },
    { name: "Magic Weapon", mechanic: "none", duration: "1 hour" },
    { name: "Mind Spike", mechanic: "save", duration: "Concentration, up to 1 hour" },
    { name: "Mirror Image", mechanic: "none", duration: "1 minute" },
    { name: "Misty Step", mechanic: "none", duration: "Instantaneous" },
    { name: "Moonbeam", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Pass without Trace", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Phantasmal Force", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Prayer of Healing", mechanic: "none", duration: "Instantaneous" },
    { name: "Protection from Poison", mechanic: "none", duration: "1 hour" },
    { name: "Ray of Enfeeblement", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Rope Trick", mechanic: "none", duration: "1 hour" },
    { name: "Scorching Ray", mechanic: "attack", duration: "Instantaneous" },
    { name: "See Invisibility", mechanic: "none", duration: "1 hour" },
    { name: "Shatter", mechanic: "save", duration: "Instantaneous" },
    { name: "Shining Smite", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Silence", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Spider Climb", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Spike Growth", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Spiritual Weapon", mechanic: "attack", duration: "Concentration, up to 1 minute" },
    { name: "Suggestion", mechanic: "save", duration: "Concentration, up to 8 hours" },
    { name: "Warding Bond", mechanic: "none", duration: "1 hour" },
    { name: "Web", mechanic: "save", duration: "Concentration, up to 1 hour" },
    { name: "Zone of Truth", mechanic: "save", duration: "10 minutes" },
  ],
  "3rd": [
    { name: "Animate Dead", mechanic: "none", duration: "Instantaneous" },
    { name: "Beacon of Hope", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Bestow Curse", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Blink", mechanic: "none", duration: "1 minute" },
    { name: "Call Lightning", mechanic: "save", duration: "Concentration, up to 10 minutes" },
    { name: "Clairvoyance", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Conjure Animals", mechanic: "save", duration: "Concentration, up to 10 minutes" },
    { name: "Counterspell", mechanic: "save", duration: "Instantaneous" },
    { name: "Create Food and Water", mechanic: "none", duration: "Instantaneous" },
    { name: "Daylight", mechanic: "none", duration: "1 hour" },
    { name: "Dispel Magic", mechanic: "none", duration: "Instantaneous" },
    { name: "Fear", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Fireball", mechanic: "save", duration: "Instantaneous" },
    { name: "Fly", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Gaseous Form", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Glyph of Warding", mechanic: "save", duration: "Until dispelled or triggered" },
    { name: "Haste", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Hypnotic Pattern", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Lightning Bolt", mechanic: "save", duration: "Instantaneous" },
    { name: "Magic Circle", mechanic: "none", duration: "1 hour" },
    { name: "Major Image", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Mass Healing Word", mechanic: "none", duration: "Instantaneous" },
    { name: "Meld into Stone", mechanic: "none", duration: "8 hours" },
    { name: "Nondetection", mechanic: "none", duration: "8 hours" },
    { name: "Phantom Steed", mechanic: "none", duration: "1 hour" },
    { name: "Plant Growth", mechanic: "none", duration: "Instantaneous" },
    { name: "Protection from Energy", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Remove Curse", mechanic: "none", duration: "Instantaneous" },
    { name: "Revivify", mechanic: "none", duration: "Instantaneous" },
    { name: "Sending", mechanic: "none", duration: "Instantaneous" },
    { name: "Sleet Storm", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Slow", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Speak with Dead", mechanic: "none", duration: "10 minutes" },
    { name: "Speak with Plants", mechanic: "none", duration: "10 minutes" },
    { name: "Spirit Guardians", mechanic: "save", duration: "Concentration, up to 10 minutes" },
    { name: "Stinking Cloud", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Tiny Hut", mechanic: "none", duration: "8 hours" },
    { name: "Tongues", mechanic: "none", duration: "1 hour" },
    { name: "Vampiric Touch", mechanic: "attack", duration: "Concentration, up to 1 minute" },
    { name: "Water Breathing", mechanic: "none", duration: "24 hours" },
    { name: "Water Walk", mechanic: "none", duration: "1 hour" },
    { name: "Wind Wall", mechanic: "save", duration: "Concentration, up to 1 minute" },
  ],
  "4th": [
    { name: "Arcane Eye", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Aura of Life", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Banishment", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Black Tentacles", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Blight", mechanic: "save", duration: "Instantaneous" },
    { name: "Charm Monster", mechanic: "save", duration: "1 hour" },
    { name: "Compulsion", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Confusion", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Conjure Minor Elementals", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Conjure Woodland Beings", mechanic: "save", duration: "Concentration, up to 10 minutes" },
    { name: "Control Water", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Death Ward", mechanic: "none", duration: "8 hours" },
    { name: "Dimension Door", mechanic: "none", duration: "Instantaneous" },
    { name: "Divination", mechanic: "none", duration: "Instantaneous" },
    { name: "Dominate Beast", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Fabricate", mechanic: "none", duration: "Instantaneous" },
    { name: "Faithful Hound", mechanic: "save", duration: "8 hours" },
    { name: "Fire Shield", mechanic: "none", duration: "10 minutes" },
    { name: "Freedom of Movement", mechanic: "none", duration: "1 hour" },
    { name: "Giant Insect", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Greater Invisibility", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Guardian of Faith", mechanic: "save", duration: "8 hours" },
    { name: "Hallucinatory Terrain", mechanic: "none", duration: "24 hours" },
    { name: "Ice Storm", mechanic: "save", duration: "Instantaneous" },
    { name: "Locate Creature", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Phantasmal Killer", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Polymorph", mechanic: "save", duration: "Concentration, up to 1 hour" },
    { name: "Private Sanctum", mechanic: "none", duration: "24 hours" },
    { name: "Resilient Sphere", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Secret Chest", mechanic: "none", duration: "Until dispelled" },
    { name: "Stone Shape", mechanic: "none", duration: "Instantaneous" },
    { name: "Stoneskin", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Vitriolic Sphere", mechanic: "save", duration: "Instantaneous" },
    { name: "Wall of Fire", mechanic: "save", duration: "Concentration, up to 1 minute" },
  ],
  "5th": [
    { name: "Animate Objects", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Antilife Shell", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Arcane Hand", mechanic: "attack", duration: "Concentration, up to 1 minute" },
    { name: "Awaken", mechanic: "none", duration: "Instantaneous" },
    { name: "Cloudkill", mechanic: "save", duration: "Concentration, up to 10 minutes" },
    { name: "Commune", mechanic: "none", duration: "1 minute" },
    { name: "Commune with Nature", mechanic: "none", duration: "Instantaneous" },
    { name: "Cone of Cold", mechanic: "save", duration: "Instantaneous" },
    { name: "Conjure Elemental", mechanic: "save", duration: "Concentration, up to 10 minutes" },
    { name: "Contact Other Plane", mechanic: "none", duration: "1 minute" },
    { name: "Contagion", mechanic: "save", duration: "7 days" },
    { name: "Creation", mechanic: "none", duration: "Special" },
    { name: "Dispel Evil and Good", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Dominate Person", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Dream", mechanic: "save", duration: "8 hours" },
    { name: "Flame Strike", mechanic: "save", duration: "Instantaneous" },
    { name: "Geas", mechanic: "save", duration: "30 days" },
    { name: "Greater Restoration", mechanic: "none", duration: "Instantaneous" },
    { name: "Hallow", mechanic: "none", duration: "Until dispelled" },
    { name: "Hold Monster", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Insect Plague", mechanic: "save", duration: "Concentration, up to 10 minutes" },
    { name: "Legend Lore", mechanic: "none", duration: "Instantaneous" },
    { name: "Mass Cure Wounds", mechanic: "none", duration: "Instantaneous" },
    { name: "Mislead", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Modify Memory", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Passwall", mechanic: "none", duration: "1 hour" },
    { name: "Planar Binding", mechanic: "save", duration: "24 hours" },
    { name: "Raise Dead", mechanic: "none", duration: "Instantaneous" },
    { name: "Reincarnate", mechanic: "none", duration: "Instantaneous" },
    { name: "Scrying", mechanic: "save", duration: "Concentration, up to 10 minutes" },
    { name: "Seeming", mechanic: "save", duration: "8 hours" },
    { name: "Summon Dragon", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Telekinesis", mechanic: "save", duration: "Concentration, up to 10 minutes" },
    { name: "Telepathic Bond", mechanic: "none", duration: "1 hour" },
    { name: "Teleportation Circle", mechanic: "none", duration: "1 round" },
    { name: "Tree Stride", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Wall of Force", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Wall of Stone", mechanic: "save", duration: "Concentration, up to 10 minutes" },
  ],
  "6th": [
    { name: "Blade Barrier", mechanic: "save", duration: "Concentration, up to 10 minutes" },
    { name: "Chain Lightning", mechanic: "save", duration: "Instantaneous" },
    { name: "Circle of Death", mechanic: "save", duration: "Instantaneous" },
    { name: "Conjure Fey", mechanic: "attack", duration: "Concentration, up to 10 minutes" },
    { name: "Contingency", mechanic: "none", duration: "10 days" },
    { name: "Create Undead", mechanic: "none", duration: "Instantaneous" },
    { name: "Disintegrate", mechanic: "save", duration: "Instantaneous" },
    { name: "Eyebite", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Find the Path", mechanic: "none", duration: "Concentration, up to 1 day" },
    { name: "Flesh to Stone", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Forbiddance", mechanic: "none", duration: "1 day" },
    { name: "Freezing Sphere", mechanic: "save", duration: "Instantaneous" },
    { name: "Globe of Invulnerability", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Guards and Wards", mechanic: "none", duration: "24 hours" },
    { name: "Harm", mechanic: "save", duration: "Instantaneous" },
    { name: "Heal", mechanic: "none", duration: "Instantaneous" },
    { name: "Heroes' Feast", mechanic: "none", duration: "Instantaneous" },
    { name: "Instant Summons", mechanic: "none", duration: "Until dispelled" },
    { name: "Irresistible Dance", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Magic Jar", mechanic: "save", duration: "Until dispelled" },
    { name: "Mass Suggestion", mechanic: "save", duration: "24 hours" },
    { name: "Move Earth", mechanic: "none", duration: "Concentration, up to 2 hours" },
    { name: "Planar Ally", mechanic: "none", duration: "Instantaneous" },
    { name: "Programmed Illusion", mechanic: "none", duration: "Until dispelled" },
    { name: "Sunbeam", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Transport via Plants", mechanic: "none", duration: "1 minute" },
    { name: "True Seeing", mechanic: "none", duration: "1 hour" },
    { name: "Wall of Ice", mechanic: "save", duration: "Concentration, up to 10 minutes" },
    { name: "Wall of Thorns", mechanic: "save", duration: "Concentration, up to 10 minutes" },
    { name: "Wind Walk", mechanic: "none", duration: "8 hours" },
    { name: "Word of Recall", mechanic: "none", duration: "Instantaneous" },
  ],
  "7th": [
    { name: "Arcane Sword", mechanic: "attack", duration: "Concentration, up to 1 minute" },
    { name: "Conjure Celestial", mechanic: "save", duration: "Concentration, up to 10 minutes" },
    { name: "Delayed Blast Fireball", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Divine Word", mechanic: "save", duration: "Instantaneous" },
    { name: "Etherealness", mechanic: "none", duration: "Up to 8 hours" },
    { name: "Finger of Death", mechanic: "save", duration: "Instantaneous" },
    { name: "Fire Storm", mechanic: "save", duration: "Instantaneous" },
    { name: "Forcecage", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Magnificent Mansion", mechanic: "none", duration: "24 hours" },
    { name: "Mirage Arcane", mechanic: "none", duration: "10 days" },
    { name: "Plane Shift", mechanic: "none", duration: "Instantaneous" },
    { name: "Prismatic Spray", mechanic: "save", duration: "Instantaneous" },
    { name: "Project Image", mechanic: "none", duration: "Concentration, up to 1 day" },
    { name: "Regenerate", mechanic: "none", duration: "1 hour" },
    { name: "Resurrection", mechanic: "none", duration: "Instantaneous" },
    { name: "Reverse Gravity", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Sequester", mechanic: "none", duration: "Until dispelled" },
    { name: "Simulacrum", mechanic: "none", duration: "Until dispelled" },
    { name: "Symbol", mechanic: "save", duration: "Until dispelled or triggered" },
    { name: "Teleport", mechanic: "none", duration: "Instantaneous" },
  ],
  "8th": [
    { name: "Animal Shapes", mechanic: "none", duration: "24 hours" },
    { name: "Antimagic Field", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Antipathy/Sympathy", mechanic: "save", duration: "10 days" },
    { name: "Befuddlement", mechanic: "save", duration: "Instantaneous" },
    { name: "Clone", mechanic: "none", duration: "Instantaneous" },
    { name: "Control Weather", mechanic: "none", duration: "Concentration, up to 8 hours" },
    { name: "Demiplane", mechanic: "none", duration: "1 hour" },
    { name: "Dominate Monster", mechanic: "save", duration: "Concentration, up to 1 hour" },
    { name: "Earthquake", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Glibness", mechanic: "none", duration: "1 hour" },
    { name: "Holy Aura", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Incendiary Cloud", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Maze", mechanic: "none", duration: "Concentration, up to 10 minutes" },
    { name: "Mind Blank", mechanic: "none", duration: "24 hours" },
    { name: "Power Word Stun", mechanic: "save", duration: "Instantaneous" },
    { name: "Sunburst", mechanic: "save", duration: "Instantaneous" },
    { name: "Tsunami", mechanic: "save", duration: "Concentration, up to 6 rounds" },
  ],
  "9th": [
    { name: "Astral Projection", mechanic: "none", duration: "Until dispelled" },
    { name: "Foresight", mechanic: "none", duration: "8 hours" },
    { name: "Gate", mechanic: "none", duration: "Concentration, up to 1 minute" },
    { name: "Imprisonment", mechanic: "save", duration: "Until dispelled" },
    { name: "Mass Heal", mechanic: "none", duration: "Instantaneous" },
    { name: "Meteor Swarm", mechanic: "save", duration: "Instantaneous" },
    { name: "Power Word Heal", mechanic: "none", duration: "Instantaneous" },
    { name: "Power Word Kill", mechanic: "none", duration: "Instantaneous" },
    { name: "Prismatic Wall", mechanic: "save", duration: "10 minutes" },
    { name: "Shapechange", mechanic: "none", duration: "Concentration, up to 1 hour" },
    { name: "Storm of Vengeance", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Time Stop", mechanic: "none", duration: "Instantaneous" },
    { name: "True Polymorph", mechanic: "save", duration: "Concentration, up to 1 hour" },
    { name: "True Resurrection", mechanic: "none", duration: "Instantaneous" },
    { name: "Weird", mechanic: "save", duration: "Concentration, up to 1 minute" },
    { name: "Wish", mechanic: "none", duration: "Instantaneous" },
  ],
};

// Builds the full parenthetical for a chosen spell: a save DC or attack bonus if the spell
// uses one, plus its real duration if it isn't Instantaneous (e.g. "(save DC 15;
// Concentration, up to 1 minute)", or "(Concentration, up to 10 minutes)" for a spell like
// Detect Magic with no save/attack, or "" for a spell with neither, like Cure Wounds).
export function spellClause(spell: FlavorSpell, dc: number, atk: number): string {
  const parts: string[] = [];
  if (spell.mechanic === "save") parts.push(`save DC ${dc}`);
  else if (spell.mechanic === "attack") parts.push(`attack bonus +${atk}`);
  if (spell.duration !== "Instantaneous") parts.push(spell.duration);
  return parts.length ? ` (${parts.join("; ")})` : "";
}

// Derived from real items in magicItemStats.ts: Potion of Giant Strength sets Strength to
// 21 (Uncommon/hill), 23 or 25 (Rare/frost-stone or fire — 23 used as the Rare baseline),
// 27 (Very Rare/cloud), 29 (Legendary/storm) — the one real item family in the SRD that
// actually scales an ability score by rarity, so Stat-set now follows that curve instead
// of the flat 19 every single-tier item (Gauntlets of Ogre Power, Headband of Intellect,
// Amulet of Health — all Uncommon/Rare) happened to share. Common has no real precedent at
// all for this archetype (stat-set items don't appear there outside gap-filling), so it's
// extrapolated one step below Uncommon.
export const statSetTargetScoreByRarity: Record<string, number> = {
  Common: 17,
  Uncommon: 21,
  Rare: 23,
  "Very Rare": 27,
  Legendary: 29,
};

// Derived from real items: the classic enhancement bonus scales with rarity — Uncommon
// items are +1, Rare +2, Very Rare/Legendary +3 (pattern read off the many "+N bonus to
// attack rolls and damage rolls..." lines in realMagicItems, magicItemStats.ts). Common
// has no real precedent for this archetype at all; +1 is used there only in the
// once-per-day framing dailyUsesByRarity applies to gap-filled categories — a permanent
// +1 would be too strong for the rarity, but a +1 usable once per day for an hour isn't.
export const passiveBonusByRarity: Record<string, number> = {
  Common: 1,
  Uncommon: 1,
  Rare: 2,
  "Very Rare": 3,
  Legendary: 3,
};

// Utility/Other is the catch-all archetype (real items here range from detection to
// movement to storage). Each template is paired with its own naming theme so the
// generated name always says what the item does (e.g. a fog-cloud item is named "of
// Mist", not something unrelated) — written in the style of real Wondrous Items, NOT
// sourced from the SRD.
//
// effect(phrase) is the permanent version, used when the (category, rarity) combo has
// real precedent. phrase is supplied by the caller based on the item's actual category —
// "wearing this ring"/"wielding this weapon"/"holding this item"/etc — so a Weapon or a
// Rod never reads "while wearing," and a suit of Armor never reads "while holding."
// potionEffect is the single-drink version, phrased like every real Potion in the SRD pool
// ("When you drink this potion, ... for [duration]") — no wear/hold verb, since drinking
// implies possession.
// limited(duration) is the "N times per day" version for a gap-filled (category, rarity)
// combo — also no wear/hold verb, for the same reason: you have to be carrying the item to
// activate it, so restating that on every use is redundant with the potion phrasing.
//
// magnitudeByRarity is only present on templates that have a real numeric knob (a weight
// capacity, a range, an area) — without it, an effect read exactly the same at Common as
// at Legendary (e.g. "Dagger of Holding" always storing exactly 5 pounds, no matter the
// rarity paying 200,000gp for it). Where present, every occurrence of the literal token
// "{MAG}" in effect/potionEffect/limited gets substituted with the rarity's value before
// display. These curves are a designed scale, not measured from real items — nothing in
// the SRD publishes a "utility item power by rarity" table — chosen so the numbers grow
// noticeably rarity-to-rarity without becoming absurd at Legendary.
export interface UtilityTemplate {
  effect: (phrase: string) => string;
  potionEffect: string;
  limited: (duration: string) => string;
  theme: string;
  magnitudeByRarity?: Record<string, string>;
}
export const utilityEffectTemplates: UtilityTemplate[] = [
  {
    effect: (p) => `While ${p}, you have Darkvision with a range of {MAG}. If you already have Darkvision, its range increases by {MAG} instead.`,
    potionEffect: "When you drink this potion, you have Darkvision with a range of {MAG} for 1 hour. If you already have Darkvision, its range increases by {MAG} for that duration.",
    limited: (d) => `you have Darkvision with a range of {MAG} for ${d}. If you already have Darkvision, its range increases by {MAG} for that duration.`,
    theme: "Night Sight",
    magnitudeByRarity: { Common: "60 feet", Uncommon: "60 feet", Rare: "90 feet", "Very Rare": "120 feet", Legendary: "150 feet" },
  },
  {
    effect: (p) => `While ${p}, you can't be tracked by any nonmagical means.`,
    potionEffect: "When you drink this potion, you can't be tracked by any nonmagical means for 1 hour.",
    limited: (d) => `you can't be tracked by any nonmagical means for ${d}.`,
    theme: "the Fox",
  },
  {
    effect: (p) => `While ${p}, you gain a Swimming Speed equal to your Walking Speed and can breathe underwater.`,
    potionEffect: "When you drink this potion, you gain a Swimming Speed equal to your Walking Speed and can breathe underwater for 1 hour.",
    limited: (d) => `you gain a Swimming Speed equal to your Walking Speed and can breathe underwater for ${d}.`,
    theme: "the Deep",
  },
  {
    effect: (p) => `Once per Long Rest, while ${p}, you can take a Bonus Action to become Invisible for 1 minute or until you attack or cast a spell.`,
    potionEffect: "When you drink this potion, you have the Invisible condition for 1 hour or until you attack or cast a spell.",
    limited: (d) => `you have the Invisible condition for ${d} or until you attack or cast a spell.`,
    theme: "Vanishing",
  },
  {
    effect: (p) => `While ${p}, you can take a Magic action to read any language you see written.`,
    potionEffect: "When you drink this potion, you can read any language you see written for 1 hour.",
    limited: (d) => `you can read any language you see written for ${d}.`,
    theme: "Tongues",
  },
  {
    effect: (p) => `This item has 3 charges. While ${p}, you can expend 1 charge to gain advantage on your next Wisdom (Perception) check.`,
    potionEffect: "When you drink this potion, you have advantage on Wisdom (Perception) checks for 1 hour.",
    limited: (d) => `you have advantage on your next Wisdom (Perception) check within ${d}.`,
    theme: "the Hawk",
  },
  {
    effect: (p) => `While ${p}, your jumping distance is tripled.`,
    potionEffect: "When you drink this potion, your jumping distance is tripled for 1 hour.",
    limited: (d) => `your jumping distance is tripled for ${d}.`,
    theme: "Leaping",
  },
  {
    effect: (p) => `Once per Long Rest, while ${p}, you can take a Reaction immediately after failing a saving throw to reroll it.`,
    potionEffect: "When you drink this potion, the next time you fail a saving throw within 1 hour, you can reroll it and must use the new roll.",
    limited: (d) => `the next time you fail a saving throw within ${d}, you can reroll it and must use the new roll.`,
    theme: "Fortitude",
  },
  {
    effect: (p) => `While ${p}, you gain a Climbing Speed equal to your Walking Speed.`,
    potionEffect: "When you drink this potion, you gain a Climbing Speed equal to your Walking Speed for 1 hour.",
    limited: (d) => `you gain a Climbing Speed equal to your Walking Speed for ${d}.`,
    theme: "the Spider",
  },
  {
    effect: (p) => `This item has 5 charges. While ${p}, you can expend 1 charge to create a heavily obscuring fog in a {MAG} Cube centered on a point you can see within 60 feet.`,
    potionEffect: "When you drink this potion, you exhale a heavily obscuring fog that fills a {MAG} Cube centered on you; it spreads around corners and lasts for 1 minute.",
    limited: (d) => `you exhale a heavily obscuring fog that fills a {MAG} Cube centered on you; it spreads around corners and lasts for ${d}.`,
    theme: "Mist",
    magnitudeByRarity: { Common: "10-foot", Uncommon: "20-foot", Rare: "30-foot", "Very Rare": "40-foot", Legendary: "60-foot" },
  },
  {
    effect: (p) => `While ${p}, you have advantage on Dexterity (Stealth) checks.`,
    potionEffect: "When you drink this potion, you have advantage on Dexterity (Stealth) checks for 1 hour.",
    limited: (d) => `you have advantage on your next Dexterity (Stealth) check within ${d}.`,
    theme: "Shadows",
  },
  {
    effect: (p) => `While ${p}, you can take a Magic action to learn the direction to the nearest source of running water within {MAG}.`,
    potionEffect: "When you drink this potion, you learn the direction to the nearest source of running water within {MAG}; this awareness lasts 1 hour.",
    limited: (d) => `you learn the direction to the nearest source of running water within {MAG}; this awareness lasts ${d}.`,
    theme: "Divination",
    magnitudeByRarity: { Common: "1 mile", Uncommon: "3 miles", Rare: "10 miles", "Very Rare": "30 miles", Legendary: "100 miles" },
  },
  {
    effect: (p) => `This item contains an extradimensional space that can hold up to {MAG} of nonliving material, which you can retrieve with a Bonus Action while ${p}.`,
    potionEffect: "When you drink this potion, one unattended object you touch ({MAG} or less) is drawn into an extradimensional space; you can retrieve it with a Bonus Action at any point in the next 24 hours, and it reappears in your hand.",
    limited: (d) => `one unattended object you touch ({MAG} or less) is drawn into an extradimensional space; you can retrieve it with a Bonus Action at any point in the next ${d}, and it reappears in your hand.`,
    theme: "Holding",
    magnitudeByRarity: { Common: "1 pound", Uncommon: "10 pounds", Rare: "50 pounds", "Very Rare": "200 pounds", Legendary: "1,000 pounds" },
  },
  {
    effect: (p) => `While ${p}, food and water you carry never spoils.`,
    potionEffect: "When you drink this potion, food and water you carry doesn't spoil for the next 24 hours.",
    limited: (d) => `food and water you carry doesn't spoil for the next ${d}.`,
    theme: "Sustenance",
  },
  {
    effect: (p) => `Once per day, while ${p}, you can take a Magic action to speak this item's command word; until the end of your next turn, you fall no faster than 60 feet per round and take no damage from landing.`,
    potionEffect: "When you drink this potion, you fall no faster than 60 feet per round and take no damage from landing for the next 1 minute.",
    limited: (d) => `you fall no faster than 60 feet per round and take no damage from landing for ${d}.`,
    theme: "Feather Falling",
  },
  {
    effect: (p) => `While ${p}, you can communicate telepathically with any creature you can see within {MAG}.`,
    potionEffect: "When you drink this potion, you can communicate telepathically with any creature you can see within {MAG}, for 1 hour.",
    limited: (d) => `you can communicate telepathically with any creature you can see within {MAG} for ${d}.`,
    theme: "Silent Speech",
    magnitudeByRarity: { Common: "30 feet", Uncommon: "60 feet", Rare: "120 feet", "Very Rare": "1 mile", Legendary: "10 miles" },
  },
  {
    effect: (p) => `While ${p}, you can move across any liquid surface as if it were solid ground.`,
    potionEffect: "When you drink this potion, you can move across any liquid surface as if it were solid ground, for 1 hour.",
    limited: (d) => `you can move across any liquid surface as if it were solid ground for ${d}.`,
    theme: "the Heron",
  },
  {
    effect: (p) => `While ${p}, you can see any Invisible creature or object within {MAG} of you as though it were visible.`,
    potionEffect: "When you drink this potion, you can see any Invisible creature or object within {MAG} of you as though it were visible, for 1 hour.",
    limited: (d) => `you can see any Invisible creature or object within {MAG} of you as though it were visible, for ${d}.`,
    theme: "the Seer",
    magnitudeByRarity: { Common: "30 feet", Uncommon: "60 feet", Rare: "90 feet", "Very Rare": "120 feet", Legendary: "150 feet" },
  },
  {
    effect: (p) => `While ${p}, you can't have the Frightened condition.`,
    potionEffect: "When you drink this potion, you can't have the Frightened condition for 1 hour.",
    limited: (d) => `you can't have the Frightened condition for ${d}.`,
    theme: "Courage",
  },
  {
    effect: (p) => `While ${p}, you can't have the Charmed condition.`,
    potionEffect: "When you drink this potion, you can't have the Charmed condition for 1 hour.",
    limited: (d) => `you can't have the Charmed condition for ${d}.`,
    theme: "Clear Mind",
  },
  {
    effect: (p) => `While ${p}, you have advantage on Constitution saving throws you make to maintain Concentration.`,
    potionEffect: "When you drink this potion, you have advantage on Constitution saving throws to maintain Concentration for 1 hour.",
    limited: (d) => `you have advantage on your next Constitution saving throw to maintain Concentration, within ${d}.`,
    theme: "Steadfast Focus",
  },
  {
    effect: (p) => `While ${p}, you can take a Bonus Action to teleport up to {MAG} to an unoccupied space you can see.`,
    potionEffect: "When you drink this potion, you can take a Bonus Action to teleport up to {MAG} to an unoccupied space you can see; this benefit lasts 1 hour.",
    limited: (d) => `you can take a Bonus Action to teleport up to {MAG} to an unoccupied space you can see; this benefit lasts ${d}.`,
    theme: "Blinking",
    magnitudeByRarity: { Common: "10 feet", Uncommon: "30 feet", Rare: "60 feet", "Very Rare": "90 feet", Legendary: "120 feet" },
  },
  {
    effect: (p) => `While ${p}, you can take a Magic action to create a shimmering wall of light {MAG} that blocks line of sight through it for 1 minute.`,
    potionEffect: "When you drink this potion, you can create a shimmering wall of light {MAG} that blocks line of sight through it for 1 minute.",
    limited: (d) => `you can create a shimmering wall of light {MAG} that blocks line of sight through it for ${d}.`,
    theme: "the Screen",
    magnitudeByRarity: {
      Common: "10 feet long and 5 feet high",
      Uncommon: "20 feet long and 10 feet high",
      Rare: "30 feet long and 15 feet high",
      "Very Rare": "40 feet long and 20 feet high",
      Legendary: "60 feet long and 30 feet high",
    },
  },
  {
    effect: (p) => `While ${p}, your body sheds Dim Light in a {MAG} radius, which you can suppress or resume as a Bonus Action.`,
    potionEffect: "When you drink this potion, your body sheds Dim Light in a {MAG} radius for 1 hour, which you can suppress or resume as a Bonus Action.",
    limited: (d) => `your body sheds Dim Light in a {MAG} radius for ${d}, which you can suppress or resume as a Bonus Action.`,
    theme: "the Lantern",
    magnitudeByRarity: { Common: "10-foot", Uncommon: "15-foot", Rare: "20-foot", "Very Rare": "30-foot", Legendary: "60-foot" },
  },
  {
    effect: (p) => `While ${p}, you have advantage on Intelligence (Investigation) checks.`,
    potionEffect: "When you drink this potion, you have advantage on Intelligence (Investigation) checks for 1 hour.",
    limited: (d) => `you have advantage on your next Intelligence (Investigation) check within ${d}.`,
    theme: "the Sleuth",
  },
  {
    effect: (p) => `While ${p}, you have advantage on Charisma (Persuasion) checks.`,
    potionEffect: "When you drink this potion, you have advantage on Charisma (Persuasion) checks for 1 hour.",
    limited: (d) => `you have advantage on your next Charisma (Persuasion) check within ${d}.`,
    theme: "Silver Tongue",
  },
  {
    effect: (p) => `While ${p}, you always know which direction is north.`,
    potionEffect: "When you drink this potion, you always know which direction is north, for the next 24 hours.",
    limited: (d) => `you always know which direction is north, for ${d}.`,
    theme: "the Compass",
  },
  {
    effect: (p) => `While ${p}, you have advantage on saving throws against being Poisoned and Resistance to Poison damage.`,
    potionEffect: "When you drink this potion, you have advantage on saving throws against being Poisoned and Resistance to Poison damage, for 1 hour.",
    limited: (d) => `you have advantage on saving throws against being Poisoned and Resistance to Poison damage, for ${d}.`,
    theme: "Iron Stomach",
  },
  {
    effect: (p) => `While ${p}, you don't require food or water to avoid the effects of starvation or dehydration.`,
    potionEffect: "When you drink this potion, you don't require food or water for the next 24 hours.",
    limited: (d) => `you don't require food or water for ${d}.`,
    theme: "the Ascetic",
  },
  {
    effect: (p) => `While ${p}, you can take a Magic action to transform a {MAG} nonmagical, nonliving object you touch into a different {MAG} nonmagical object for 1 hour.`,
    potionEffect: "When you drink this potion, you can transform a {MAG} nonmagical, nonliving object you touch into a different {MAG} nonmagical object for 1 hour.",
    limited: (d) => `you can transform a {MAG} nonmagical, nonliving object you touch into a different {MAG} nonmagical object for ${d}.`,
    theme: "the Trickster",
    magnitudeByRarity: { Common: "Tiny", Uncommon: "Tiny", Rare: "Small", "Very Rare": "Medium", Legendary: "Large" },
  },
];

// Thematic word tying a stat-set item's name to the ability it boosts — matches the real
// precedent (Gauntlets of Ogre Power for Strength, Headband of Intellect for Intelligence,
// Amulet of Health for Constitution); the rest follow the same "of [virtue]" pattern.
export const statThemeByAbility: Record<string, string> = {
  Strength: "Power",
  Dexterity: "Grace",
  Constitution: "Vigor",
  Intelligence: "Intellect",
  Wisdom: "Insight",
  Charisma: "Charm",
};

// Flavor-only item-form word lists (the physical shape a category takes) — not sourced
// from the SRD.
export const weaponForms = [
  "Longsword", "Shortsword", "Dagger", "Battleaxe", "Warhammer", "Rapier",
  "Greatsword", "Spear", "Mace", "Shortbow", "Longbow", "Handaxe",
];
export const armorForms = ["Leather Armor", "Studded Leather Armor", "Chain Shirt", "Chain Mail", "Plate Armor", "Shield"];
export const wondrousForms = ["Amulet", "Cloak", "Circlet", "Bracers", "Boots", "Belt", "Gloves", "Mask", "Robe", "Brooch"];
