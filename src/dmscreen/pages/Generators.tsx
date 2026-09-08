import { useState } from "react";
import { damageTypes, dcTable } from "../data/coreRules";
import {
  armor,
  artifactAdjectives,
  artifactNouns,
  artifactPrefixes,
  artifactSuffixes,
  bookGenres,
  complications,
  curioItems,
  curioQuirks,
  curios,
  equipment,
  gemArtCountOddsByTier,
  gemArtFlavor,
  isNotableEquipment,
  isNotableWeapon,
  jewelryItems,
  magicItemCountOddsByTier,
  magicItemOddsByTier,
  oddityItems,
  npcFirstNames,
  npcRaces,
  npcSurnames,
  plotHookCargo,
  plotHookPlaces,
  plotHookRoles,
  plotHooks,
  regionAdjectives,
  regionNouns,
  settlementAdjectives,
  settlementNouns,
  settlementPrefixes,
  settlementSuffixes,
  shopNameAdjectives,
  shopNameBanks,
  shopTypes,
  shopWealthTiers,
  trapDCByTier,
  trapEffects,
  trapObjects,
  treasureByTier,
  weapons,
} from "../data/generators";
import {
  legendaryExtraActions,
  lairActionFlavors,
  monsterDesignByCR,
  monsterNameAdjectives,
  monsterNameNouns,
  monsterSizes,
  monsterTypes,
  spellsByTier,
} from "../data/monsterDesign";
import { improvisedDamage } from "../data/monsterRef";
import { attunementRateByRarity, categoryWeightsByRarity } from "../data/magicItemStats";
import {
  allItemCategories,
  armorForms,
  dailyUsesByRarity,
  extendedArchetypeWeights,
  extendedCategoryWeights,
  flavorSpellsByLevel,
  gpValueByRarity,
  limitedDurationPhrase,
  passiveBonusByRarity,
  potionGpValue,
  spellChargesForLevel,
  spellClause,
  spellScrollByLevel,
  statSetTargetScoreByRarity,
  statThemeByAbility,
  utilityEffectTemplates,
  weaponForms,
  wondrousForms,
} from "../data/magicItemGen";
import { crToNumber, pick, pickWeighted, rollDice, rollDie } from "../utils";

const abilityScores = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"];
const magicItemRarities = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary"];

// The physical "form" a category takes in a name — e.g. a Weapon becomes a specific
// weapon type, a Wondrous Item becomes an amulet/cloak/etc.
function itemForm(category: string): string {
  if (category === "Weapon") return pick(weaponForms);
  if (category === "Armor") return pick(armorForms);
  if (category === "Wondrous Item") return pick(wondrousForms);
  if (category === "Scroll") return "Spell Scroll";
  return category; // Ring/Rod/Staff/Wand/Potion already read fine as-is
}

// Builds "{form} of {theme}" so the name always reflects what the item actually does.
function nameFromTheme(category: string, theme: string): string {
  return `${itemForm(category)} of ${theme}`;
}

function passiveBonusTarget(category: string): string {
  if (category === "Weapon") return "attack rolls and damage rolls made with this magic weapon";
  if (category === "Armor") return "Armor Class while you wear this armor";
  if (category === "Ring") return "Armor Class and saving throws while wearing this ring";
  if (category === "Rod" || category === "Staff" || category === "Wand") return "spell attack rolls made with it";
  return "Armor Class and saving throws while you wear this item";
}

// How you'd actually be in contact with a given category — a Weapon is wielded, Armor/
// Ring/Wondrous Items are worn, and Rod/Staff/Wand are held. Feeds every "while ___, you
// ..." clause so a suit of armor never reads "while holding it" and a wand never reads
// "while wearing it."
function possessionPhrase(category: string): string {
  if (category === "Weapon") return "wielding this weapon";
  if (category === "Armor") return "wearing this armor";
  if (category === "Ring") return "wearing this ring";
  if (category === "Wondrous Item") return "wearing this item";
  return "holding this item"; // Rod, Staff, Wand
}

// A Potion's Passive-bonus effect can't say "while you wear/wield it" (see
// passiveBonusTarget above) since it's a one-time drink, so it gets its own small set of
// [target, theme] pairs instead of collapsing to a single fixed "Protection" result.
const potionBonusTargets: [string, string][] = [
  ["Armor Class and saving throws", "Protection"],
  ["attack rolls and damage rolls", "Precision"],
  ["ability checks", "Finesse"],
];

function generateMagicItem(rarity: string, forcedCategory?: string) {
  const category =
    forcedCategory && forcedCategory !== "Random" ? forcedCategory : pickWeighted(extendedCategoryWeights(rarity));
  const isPotion = category === "Potion";
  const isScroll = category === "Scroll";
  // Real Potions and Spell Scrolls in the SRD are never attuned — they're used up in a
  // single reading/drink, so there's nothing to stay attuned to.
  const attunement = !isPotion && !isScroll && Math.random() < attunementRateByRarity[rarity];
  // A Scroll is definitionally a one-off spell effect, so it's always Spell-like; every
  // other category rolls from the (gap-filled) archetype odds as usual.
  const archetype = isScroll ? "Spell-like" : pickWeighted(extendedArchetypeWeights(rarity));

  // True only when this specific category has no real sample at this rarity (it's here
  // only via extendedCategoryWeights' flat "+1 designed" fill-in) — those combinations get
  // the daily-use cap from dailyUsesByRarity instead of a permanent while-worn/held effect.
  const isGapFilledCategory = !isPotion && !isScroll && !(category in categoryWeightsByRarity[rarity]);
  const dailyUses = dailyUsesByRarity[rarity];
  const limited = isGapFilledCategory && dailyUses !== null;
  const usesPhrase = dailyUses === 1 ? "Once per day" : `${dailyUses} times per day`;
  const duration = limited ? limitedDurationPhrase(rarity) : "";
  const phrase = possessionPhrase(category);

  let effect: string;
  let theme: string;
  let scrollGp: number | null = null;
  if (archetype === "Spell-like") {
    const candidates = spellScrollByLevel.filter((r) => r.rarity === rarity);
    const row = pick(candidates.length ? candidates : spellScrollByLevel);
    const spell = pick(flavorSpellsByLevel[row.level]);
    const clause = spellClause(spell, row.dc, row.atk);
    if (isPotion) {
      effect = `When you drink this potion, you gain the effect of the ${spell.name} spell${clause}.`;
    } else if (isScroll) {
      effect = `This scroll bears a single casting of the ${spell.name} spell${clause}. Reading it takes the spell's normal casting time and requires no components; once cast, the scroll crumbles to dust.`;
      scrollGp = row.gp;
    } else {
      const charges = spellChargesForLevel(row.levelNum);
      effect =
        charges === null
          ? `While ${phrase}, you can take a Magic action to cast ${spell.name}${clause} from it — a cantrip, so it works at will and needs no charges.`
          : `This item has ${charges} charges and regains 1d${Math.ceil(charges / 2)} expended charges daily at dawn. While ${phrase}, you can take a Magic action to expend 1 charge to cast ${spell.name}${clause} from it.`;
    }
    theme = spell.name;
  } else if (archetype === "Stat-set") {
    const ability = pick(abilityScores);
    const targetScore = statSetTargetScoreByRarity[rarity];
    if (isPotion) {
      effect = `When you drink this potion, your ${ability} score becomes ${targetScore} for 1 hour. The potion has no effect on you if your ${ability} is already ${targetScore} or higher.`;
    } else if (limited) {
      effect = `${usesPhrase}, you can use this item so that your ${ability} score becomes ${targetScore} for ${duration}. It has no effect if your ${ability} is already ${targetScore} or higher.`;
    } else {
      effect = `Your ${ability} is ${targetScore} while ${phrase}. It has no effect on you if your ${ability} is ${targetScore} or higher without it.`;
    }
    theme = statThemeByAbility[ability];
  } else if (archetype === "Resistance/Immunity") {
    const dtype = pick(damageTypes).name;
    const isImmunity = rarity === "Legendary" && Math.random() < 0.5;
    const kind = isImmunity ? "Immunity" : "Resistance";
    if (isPotion) {
      effect = `When you drink this potion, you have ${kind} to ${dtype} damage for 1 hour.`;
    } else if (limited) {
      effect = `${usesPhrase}, you can take a Magic action to gain ${kind} to ${dtype} damage for ${duration}.`;
    } else {
      effect = `You have ${kind} to ${dtype} damage while ${phrase}.`;
    }
    theme = `${dtype} ${kind}`;
  } else if (archetype === "Passive bonus") {
    const bonus = passiveBonusByRarity[rarity] || 1;
    if (isPotion) {
      const [target, potionTheme] = pick(potionBonusTargets);
      effect = `When you drink this potion, you gain a +${bonus} bonus to ${target} for 1 hour.`;
      theme = potionTheme;
    } else if (limited) {
      const [target, limitedTheme] = pick(potionBonusTargets);
      effect = `${usesPhrase}, you can use this item to gain a +${bonus} bonus to ${target} for ${duration}.`;
      theme = limitedTheme;
    } else {
      effect = `You gain a +${bonus} bonus to ${passiveBonusTarget(category)}.`;
      theme = category === "Weapon" ? "Precision" : "Protection";
    }
  } else {
    const template = pick(utilityEffectTemplates);
    if (isPotion) {
      effect = template.potionEffect;
    } else if (limited) {
      effect = `${usesPhrase}, ${template.limited(duration)}`;
    } else {
      effect = template.effect(phrase);
    }
    if (template.magnitudeByRarity) {
      effect = effect.replace(/\{MAG\}/g, template.magnitudeByRarity[rarity]);
    }
    theme = template.theme;
  }

  const gp = isPotion ? potionGpValue(rarity) : scrollGp ?? gpValueByRarity[rarity];

  return {
    name: nameFromTheme(category, theme),
    category,
    rarity,
    attunement,
    archetype,
    effect,
    gp,
  };
}

const alignments = [
  "Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral",
  "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil", "Unaligned",
];
const attackNames = ["Bite", "Claw", "Slam", "Rend", "Gore", "Sting", "Tail Lash", "Slash", "Crush", "Talon"];
const speeds = [
  "30 ft.", "25 ft.", "40 ft.", "30 ft., Fly 60 ft.", "30 ft., Swim 30 ft.",
  "20 ft., Fly 40 ft.", "30 ft., Climb 30 ft.", "30 ft., Burrow 20 ft.",
];
const spellAbilities = ["Intelligence", "Wisdom", "Charisma"];

function damageFormula(avgTarget: number, bonus: number) {
  const die = avgTarget > 150 ? 12 : avgTarget > 60 ? 10 : avgTarget > 20 ? 8 : 6;
  const dieAvg = (die + 1) / 2;
  const count = Math.max(1, Math.round((avgTarget - bonus) / dieAvg));
  const avg = Math.round(count * dieAvg + bonus);
  return { formula: bonus > 0 ? `${count}d${die} + ${bonus}` : `${count}d${die}`, avg };
}

function attackCountForCR(crNum: number): number {
  if (crNum < 1) return 1;
  if (crNum <= 4) return pick([1, 1, 2]);
  if (crNum <= 10) return pick([2, 2, 3]);
  return pick([2, 3, 3, 4]);
}

// Maps CR onto the same four level brackets the (verified) Improvised Damage table uses,
// on the rough assumption a monster's CR is comparable to the party level it challenges.
function levelBracketForCR(crNum: number): number {
  if (crNum <= 4) return 0;
  if (crNum <= 10) return 1;
  if (crNum <= 16) return 2;
  return 3;
}

function generateMonster(
  cr: string,
  includeSpells: boolean,
  includeLegendaryActions: boolean,
  includeLairActions: boolean,
  forcedType?: string
) {
  const row = monsterDesignByCR.find((r) => r.cr === cr)!;
  const crNum = crToNumber(cr);
  const ac = row.ac + pick([-1, 0, 0, 0, 1]);
  const hp = Math.round(row.hpMin + Math.random() * (row.hpMax - row.hpMin));
  const dprTarget = row.dprMin + Math.random() * (row.dprMax - row.dprMin);
  const damageBonus = Math.max(0, Math.round(row.atk / 2));
  const damageType = pick(damageTypes).name;

  const attackCount = attackCountForCR(crNum);
  const shuffledNames = [...attackNames].sort(() => Math.random() - 0.5);
  const attacks = Array.from({ length: attackCount }, (_, i) => ({
    name: shuffledNames[i % shuffledNames.length],
    formula: damageFormula(dprTarget / attackCount, damageBonus),
  }));

  let spellcasting = null;
  if (includeSpells) {
    const tier = crNum <= 4 ? "low" : crNum <= 10 ? "mid" : "high";
    const pool = [...spellsByTier[tier]].sort(() => Math.random() - 0.5);
    spellcasting = {
      ability: pick(spellAbilities),
      atWill: pool.slice(0, 2),
      daily: pool.slice(2, 4),
    };
  }

  let legendaryActions = null;
  if (includeLegendaryActions) {
    legendaryActions = { extra: pick(legendaryExtraActions) };
  }

  let lairActions = null;
  if (includeLairActions) {
    const bracket = levelBracketForCR(crNum);
    const dmgRow = improvisedDamage[bracket];
    const effects = [...lairActionFlavors]
      .sort(() => Math.random() - 0.5)
      .slice(0, 2)
      .map((flavor) => `${flavor} ${dmgRow.deadly} ${damageType} damage.`);
    lairActions = { effects };
  }

  return {
    name: `${pick(monsterNameAdjectives)} ${pick(monsterNameNouns)}`,
    size: pick(monsterSizes),
    type: forcedType && forcedType !== "Random" ? forcedType : pick(monsterTypes),
    alignment: pick(alignments),
    ac,
    hp,
    speed: pick(speeds),
    cr: row.cr,
    pb: row.pb,
    dc: row.dc,
    attackBonus: row.atk,
    attacks,
    damageType,
    spellcasting,
    legendaryActions,
    lairActions,
  };
}

interface Npc {
  name: string;
  race: string;
}

const defaultRaceWeights: Record<string, number> = Object.fromEntries(npcRaces.map((r) => [r, 50]));

function genNpc(raceWeights: Record<string, number>): Npc {
  return {
    name: `${pick(npcFirstNames)} ${pick(npcSurnames)}`,
    race: pickWeighted(raceWeights),
  };
}

function genHook(): string {
  const template = pick(plotHooks);
  return template
    .replace("{role}", pick(plotHookRoles))
    .replace("{cargo}", pick(plotHookCargo))
    .replace("{place}", pick(plotHookPlaces));
}

// Mostly draws from the combinatorial item+quirk pool (~1,400 combos); occasionally
// (30%) returns one of the 40 hand-written curios instead, so neither pool crowds out
// the other's flavor.
function genCurio(): string {
  if (Math.random() < 0.3) return pick(curios);
  const item = pick(curioItems);
  const capitalized = item.charAt(0).toUpperCase() + item.slice(1);
  return `${capitalized} ${pick(curioQuirks)}.`;
}

// Bookshop flavor: picks a genre, then a subject from THAT genre's own list, then fills
// both a title and a blurb template with the same subject so they stay coherent (a
// generic history title paired with a drama blurb would read as a mismatch, not a book).
function genBook() {
  const g = pick(bookGenres);
  const subject = pick(g.subjects);
  return {
    genre: g.genre,
    title: pick(g.titleTemplates).replace("{subject}", subject),
    blurb: pick(g.blurbTemplates).replace("{subject}", subject),
  };
}

// Shop name generator — a per-shop-type noun bank (so "Anvil" only ever turns up at a
// Blacksmith) combined via one of three patterns; falls back to a generic bank if a shop
// type somehow has no entry (shouldn't happen, but avoids a hard crash from a typo).
// Business Generator prices are stored as decimal gp (0.04 for 4 copper, etc.) so the same
// number line works for a 0.01gp candle and a 500gp warhorse — but a DM handing out change
// wants actual coins, not a decimal. Converts to the fewest whole gp/sp/cp, dropping any
// zero denomination, rounding to the nearest copper to clear float noise (0.1 + 0.2 etc.).
function formatCoins(gp: number): string {
  const totalCp = Math.round(gp * 100);
  const goldPart = Math.floor(totalCp / 100);
  const silverPart = Math.floor((totalCp % 100) / 10);
  const copperPart = totalCp % 10;
  const parts: string[] = [];
  if (goldPart > 0) parts.push(`${goldPart.toLocaleString()} gp`);
  if (silverPart > 0) parts.push(`${silverPart} sp`);
  if (copperPart > 0) parts.push(`${copperPart} cp`);
  return parts.length ? parts.join(", ") : "0 cp";
}

function genShopName(shopType: string): string {
  const bank = shopNameBanks.find((b) => b.type === shopType) ?? shopNameBanks[0];
  const pattern = pick(["adj-noun", "possessive-noun", "noun-and-noun"]);
  if (pattern === "adj-noun") {
    return `The ${pick(bank.adjectives ?? shopNameAdjectives)} ${pick(bank.nouns)}`;
  }
  if (pattern === "possessive-noun") {
    return `${pick(npcSurnames)}'s ${pick(bank.nouns)}`;
  }
  const first = pick(bank.nouns);
  const rest = bank.nouns.filter((n) => n !== first);
  return `${first} & ${pick(rest.length ? rest : bank.nouns)}`;
}

// Proper name for a Very Rare/Legendary artifact — deliberately non-descriptive (unlike
// Custom Magic Item's own "Greatsword of Wrath" naming), since real artifacts are usually
// named for legend rather than function.
function genArtifactName(): string {
  const pattern = pick(["fused", "the-adj-noun", "possessive-noun"]);
  if (pattern === "fused") {
    return `${pick(artifactPrefixes)}${pick(artifactSuffixes)}`;
  }
  if (pattern === "the-adj-noun") {
    return `The ${pick(artifactAdjectives)} ${pick(artifactNouns)}`;
  }
  return `${pick(npcSurnames)}'s ${pick(artifactNouns)}`;
}

// Legendary items are one-of-a-kind, so their names should be too — retries against every
// name already handed out this session (capped so a nearly-exhausted pool can't hang).
function genUniqueArtifactName(used: Set<string>): string {
  let name = genArtifactName();
  let attempts = 0;
  while (used.has(name) && attempts < 50) {
    name = genArtifactName();
    attempts++;
  }
  return name;
}

// Settlements read as one fused compound word or a founder's name — never "The X" the way
// a tavern or artifact does. Regions go the other way: almost always "The {adjective}
// {noun}", since a region is described, not founded.
function genPlaceName(mode: "Settlement" | "Region"): string {
  if (mode === "Settlement") {
    const pattern = pick(["fused", "possessive", "two-word"]);
    if (pattern === "fused") {
      return `${pick(settlementPrefixes)}${pick(settlementSuffixes)}`;
    }
    if (pattern === "possessive") {
      return `${pick(npcSurnames)}'s ${pick(settlementNouns)}`;
    }
    return `${pick(settlementAdjectives)} ${pick(settlementNouns)}`;
  }
  const pattern = pick(["the-adj-noun", "possessive"]);
  if (pattern === "the-adj-noun") {
    return `the ${pick(regionAdjectives)} ${pick(regionNouns)}`;
  }
  return `${pick(npcSurnames)}'s ${pick(regionNouns)}`;
}

function rollTierGold(tierIdx: number): number {
  let base: number;
  let step: number;
  switch (tierIdx) {
    case 0:
      step = 100;
      base = rollDice(6, 6) * step;
      break;
    case 1:
      step = 1000;
      base = rollDice(4, 6) * step;
      break;
    case 2:
      step = 2000;
      base = rollDice(6, 6) * step;
      break;
    default:
      step = 5000;
      base = rollDice(8, 6) * step;
  }
  // The dice-times-multiplier roll alone always lands on a round multiple of step (e.g.
  // exactly 45,000 gp, never 45,732) — jitter it uniformly across the gap to the next
  // possible roll (44,500–45,500 for a roll that would otherwise be exactly 45,000) so the
  // total reads like a real, specific hoard instead of a rounded estimate.
  return Math.round(base + (Math.random() - 0.5) * step);
}

interface GemArt {
  value: number;
  flavor: string;
}
function rollGemsAndArt(tierIdx: number): GemArt[] {
  const count = Number(pickWeighted(gemArtCountOddsByTier[tierIdx]));
  const [min, max] = treasureByTier[tierIdx].gemRange;
  const step = treasureByTier[tierIdx].gemStep;
  const steps = (max - min) / step + 1;
  return Array.from({ length: count }, () => ({
    value: min + (rollDie(steps) - 1) * step,
    flavor: pick(gemArtFlavor),
  }));
}

// Treasure Roll uses the same Custom Magic Item generator as its own card (below) — one
// generation engine, fed by the hoard tier's rarity odds instead of a picker over a fixed
// pool of real items. Number of items now varies by tier instead of always being exactly 1.
function rollMagicItems(tierIdx: number) {
  const count = Number(pickWeighted(magicItemCountOddsByTier[tierIdx]));
  return Array.from({ length: count }, () => generateMagicItem(pickWeighted(magicItemOddsByTier[tierIdx])));
}

// Individual treasure (what one creature is carrying, not its hoard) has no dedicated
// table in the free SRD to source from — the 2014 DMG's per-creature tables aren't SRD
// content, so there's no real number to calibrate against. Modeled as a designed 1% share
// of that SAME tier's own Hoard roll (same dice, same jitter — not a separately invented
// formula), which lands in roughly the right order of magnitude for a single creature's
// coin (tens of gp at Tier 1 up to low thousands at Tier 4). No gems/art/items at this scale.
function rollIndividualGold(tierIdx: number): number {
  return Math.max(1, Math.round(rollTierGold(tierIdx) / 100));
}

interface Trap {
  object: string;
  trigger: string;
  effectText: string;
  damageType: string;
  save: string;
  saveDC: number;
  detectDC: number;
  disarmDC: number;
  damage: string;
}
function generateTrap(tierIdx: number, deadly: boolean, objectName?: string): Trap {
  const dcRow = trapDCByTier[tierIdx];
  const dmgRow = improvisedDamage[tierIdx];
  const objectDef = objectName && objectName !== "Random" ? trapObjects.find((o) => o.object === objectName)! : pick(trapObjects);
  const fittingEffects = trapEffects.filter((e) => objectDef.effectTags.includes(e.text));
  const effect = pick(fittingEffects.length ? fittingEffects : trapEffects);
  return {
    object: objectDef.object,
    trigger: pick(objectDef.triggers),
    effectText: effect.text,
    damageType: effect.damageType,
    save: effect.save,
    saveDC: dcRow.save,
    detectDC: dcRow.detect,
    disarmDC: dcRow.disarm,
    damage: deadly ? dmgRow.deadly : dmgRow.nuisance,
  };
}

function dcLabel(dc: number): string {
  return dcTable.find((row) => row.dc === dc)?.label ?? "";
}

interface ShopStock {
  shopType: string;
  wealthTier: string;
  items: { name: string; gp: number }[];
  mundaneItems: { name: string; gp: number }[];
  magicItem: ReturnType<typeof generateMagicItem> | null;
}

function rollShopInventory(shopIdx: number, wealthIdx: number): ShopStock {
  const shop = shopTypes[shopIdx];
  const wealth = shopWealthTiers[wealthIdx];

  // Pawnshop's "all" sentinel means no fixed specialty — it draws from every notable pool
  // combined instead of its own hand-picked list, and gets a bigger roll count below since
  // it has no common/assumed stock to fall back on.
  const isPawnshop = shop.exotic === "all";
  const exoticPool: { name: string; gp: number }[] =
    shop.exotic === "all"
      ? [...equipment.filter(isNotableEquipment), ...weapons.filter(isNotableWeapon), ...jewelryItems, ...oddityItems, ...armor]
      : shop.exotic;

  let pool = exoticPool.filter((e) => e.gp <= wealth.maxGp);
  // Some shop/wealth combos have zero matches at low wealth (e.g. every alchemical exotic
  // item is priced 50gp+, so Modest + Alchemist would otherwise stock nothing) — widen to
  // the full exotic pool, ignoring the wealth cap, rather than show an empty shop.
  if (pool.length === 0) pool = exoticPool;
  const count = Math.min(pool.length, isPawnshop ? 5 + Math.floor(Math.random() * 4) : 3 + Math.floor(Math.random() * 3));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  // Common stock isn't re-rolled — every shop of this type is assumed to have all of it
  // (that's why it's excluded from the roll above), so listing it is a lookup, not a draw,
  // and it's NOT wealth-filtered: "common" means always-on-hand regardless of how prosperous
  // the settlement is (a Modest stable still has riding horses; wealth only gates the
  // exotic/rolled pool below). Filtering this by wealth.maxGp was a real bug — it silently
  // dropped Horse, Riding (75gp) at anything below the Wealthy tier.
  const mundaneItems = shop.common;

  // Homebrew wealth-gated chance of an actual magic item (see shopWealthTiers) — capped at
  // a rarity appropriate to the shop's wealth, and category-locked to whatever fits this
  // shop (Weapon for Blacksmith, Potion for Alchemist, ...; "Random" for shops with no
  // natural fit, so Curiosity Shop/Pawnshop can turn up anything).
  let magicItem: ReturnType<typeof generateMagicItem> | null = null;
  if (Math.random() < wealth.magicChance) {
    const allowedRarities = magicItemRarities.slice(0, magicItemRarities.indexOf(wealth.maxRarity) + 1);
    const rarity = pick(allowedRarities);
    magicItem = generateMagicItem(rarity, shop.magicCategory === "Random" ? undefined : shop.magicCategory);
  }
  return { shopType: shop.type, wealthTier: wealth.tier, items: shuffled.slice(0, count), mundaneItems, magicItem };
}

export default function Generators() {
  const [raceWeights, setRaceWeights] = useState<Record<string, number>>(defaultRaceWeights);
  const [npc, setNpc] = useState<Npc>(() => genNpc(defaultRaceWeights));
  const raceWeightTotal = Object.values(raceWeights).reduce((a, b) => a + b, 0);
  const [hook, setHook] = useState(genHook());
  const [complication, setComplication] = useState(pick(complications));
  const [tierIdx, setTierIdx] = useState(0);
  const [hoardMode, setHoardMode] = useState<"hoard" | "individual">("hoard");
  const [treasureRoll, setTreasureRoll] = useState<{
    gold: number;
    gemsAndArt: GemArt[];
    items: ReturnType<typeof generateMagicItem>[];
  } | null>(null);
  const [curio, setCurio] = useState(genCurio());
  const [placeMode, setPlaceMode] = useState<"Settlement" | "Region">("Settlement");
  const [placeName, setPlaceName] = useState(() => genPlaceName("Settlement"));
  const [crIdx, setCrIdx] = useState(monsterDesignByCR.findIndex((r) => r.cr === "2"));
  const [includeSpells, setIncludeSpells] = useState(false);
  const [includeLegendaryActions, setIncludeLegendaryActions] = useState(false);
  const [includeLairActions, setIncludeLairActions] = useState(false);
  const [monsterTypeLock, setMonsterTypeLock] = useState("Random");
  const [monster, setMonster] = useState(() =>
    generateMonster(monsterDesignByCR[monsterDesignByCR.findIndex((r) => r.cr === "2")].cr, false, false, false)
  );
  const [customRarity, setCustomRarity] = useState("Rare");
  const [categoryLock, setCategoryLock] = useState("Random");
  const [customItem, setCustomItem] = useState(() => generateMagicItem("Rare"));
  const [usedArtifactNames, setUsedArtifactNames] = useState<Set<string>>(new Set());
  const [artifactName, setArtifactName] = useState(() => genArtifactName());
  const rerollArtifactName = () => {
    const name = genUniqueArtifactName(usedArtifactNames);
    setUsedArtifactNames((prev) => new Set(prev).add(name));
    setArtifactName(name);
  };
  const [trapTierIdx, setTrapTierIdx] = useState(0);
  const [trapDeadly, setTrapDeadly] = useState(false);
  const [trapObjectLock, setTrapObjectLock] = useState("Random");
  const [trap, setTrap] = useState(() => generateTrap(0, false, "Random"));
  const [shopTypeIdx, setShopTypeIdx] = useState(0);
  const [shopWealthIdx, setShopWealthIdx] = useState(1);
  const [shopStock, setShopStock] = useState(() => rollShopInventory(0, 1));
  const [shopName, setShopName] = useState(() => genShopName(shopTypes[0].type));
  const [generatedBook, setGeneratedBook] = useState(() => genBook());

  return (
    <div className="page masonry-row">
      <div className="masonry-col">
        <section className="card">
          <h2 className="card-title">
            NPC Generator
            <button className="btn small primary" onClick={() => setNpc(genNpc(raceWeights))}>
              🎲 Generate
            </button>
          </h2>
          <div className="gen-output" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem" }}>
            <span>
              <strong style={{ color: "var(--accent)" }}>{npc.name}</strong>
              <span className="pill" style={{ marginLeft: "0.5rem" }}>
                {npc.race}
              </span>
            </span>
          </div>
          <div style={{ marginTop: "0.4rem", paddingTop: "0.35rem", borderTop: "1px dashed var(--border-soft)" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span style={{ fontSize: "0.66rem", color: "var(--text-faint)" }}>Race odds</span>
              <button
                className="btn small"
                onClick={() => setRaceWeights(defaultRaceWeights)}
              >
                Reset
              </button>
            </div>
            {npcRaces.map((race) => (
              <div key={race} className="row" style={{ gap: "0.4rem", marginTop: "0.15rem", flexWrap: "nowrap" }}>
                <span style={{ fontSize: "0.68rem", width: "5.2rem", flex: "0 0 auto" }}>{race}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={raceWeights[race]}
                  onChange={(e) => setRaceWeights({ ...raceWeights, [race]: Number(e.target.value) })}
                  style={{ flex: "1 1 auto", minWidth: 0 }}
                />
                <span style={{ fontSize: "0.64rem", color: "var(--text-faint)", width: "2rem", textAlign: "right", flex: "0 0 auto" }}>
                  {raceWeightTotal > 0 ? Math.round((raceWeights[race] / raceWeightTotal) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">
            Curio / Trinket
            <button className="btn small primary" onClick={() => setCurio(genCurio())}>
              🎲 Generate
            </button>
          </h2>
          <div className="gen-output">{curio}</div>
        </section>

        <section className="card">
          <h2 className="card-title">
            Settlement / Region
            <button
              className="btn small primary"
              onClick={() => setPlaceName(genPlaceName(placeMode))}
            >
              🎲 Generate
            </button>
          </h2>
          <div className="gen-output">
            <div className="row" style={{ gap: "0.9rem", alignItems: "center" }}>
              <label className="row" style={{ fontSize: "0.68rem", gap: "0.25rem" }}>
                <input
                  type="radio"
                  checked={placeMode === "Settlement"}
                  onChange={() => {
                    setPlaceMode("Settlement");
                    setPlaceName(genPlaceName("Settlement"));
                  }}
                />
                Settlement
              </label>
              <label className="row" style={{ fontSize: "0.68rem", gap: "0.25rem" }}>
                <input
                  type="radio"
                  checked={placeMode === "Region"}
                  onChange={() => {
                    setPlaceMode("Region");
                    setPlaceName(genPlaceName("Region"));
                  }}
                />
                Region
              </label>
            </div>
            <p style={{ marginTop: "0.3rem", fontSize: "1rem" }}>
              <strong style={{ color: "var(--accent)" }}>{placeName}</strong>
            </p>
          </div>
          <p className="card-note">
            Homebrew. Settlements read as a fused compound word or a founder's name (never
            "The X"); regions are almost always "the {"{adjective}"} {"{noun}"}" instead — a
            region is described, not founded.
          </p>
        </section>
      </div>

      <div className="masonry-col">
        <section className="card">
          <h2 className="card-title">
            Treasure Roll
            <button
              className="btn small primary"
              onClick={() =>
                setTreasureRoll(
                  hoardMode === "hoard"
                    ? {
                        gold: rollTierGold(tierIdx),
                        gemsAndArt: rollGemsAndArt(tierIdx),
                        items: rollMagicItems(tierIdx),
                      }
                    : { gold: rollIndividualGold(tierIdx), gemsAndArt: [], items: [] }
                )
              }
            >
              🎲 Generate {hoardMode === "hoard" ? "Hoard" : "Individual"}
            </button>
          </h2>
          <div className="gen-output">
            <div className="row" style={{ gap: "0.6rem", alignItems: "center" }}>
              <select
                className="field"
                value={tierIdx}
                style={{ fontSize: "0.68rem" }}
                onChange={(e) => {
                  setTierIdx(Number(e.target.value));
                  setTreasureRoll(null);
                }}
              >
                {treasureByTier.map((t, i) => (
                  <option key={t.tier} value={i}>
                    {t.tier}
                  </option>
                ))}
              </select>
              <label className="row" style={{ fontSize: "0.68rem", gap: "0.25rem" }}>
                <input
                  type="radio"
                  checked={hoardMode === "hoard"}
                  onChange={() => setHoardMode("hoard")}
                />
                Hoard
              </label>
              <label className="row" style={{ fontSize: "0.68rem", gap: "0.25rem" }}>
                <input
                  type="radio"
                  checked={hoardMode === "individual"}
                  onChange={() => setHoardMode("individual")}
                />
                Individual
              </label>
            </div>
            <p style={{ color: "var(--text-faint)", fontSize: "0.7rem", marginTop: "0.2rem" }}>
              {hoardMode === "hoard" ? treasureByTier[tierIdx].coin : "Homebrew — a fraction of the hoard formula, coin only"}
            </p>
            {treasureRoll && (
              <div style={{ marginTop: "0.35rem" }}>
                <strong style={{ color: "var(--accent)" }}>{treasureRoll.gold.toLocaleString()} gp</strong>
                {treasureRoll.gemsAndArt.length > 0 && (
                  <ul style={{ marginTop: "0.2rem", marginBottom: 0, paddingLeft: "1.1rem", fontSize: "0.7rem", color: "var(--text-dim)" }}>
                    {treasureRoll.gemsAndArt.map((g, i) => (
                      <li key={i}>
                        {g.flavor} ({g.value.toLocaleString()} gp)
                      </li>
                    ))}
                  </ul>
                )}
                {treasureRoll.items.length === 0 ? (
                  <p style={{ marginTop: "0.2rem", fontSize: "0.68rem", color: "var(--text-faint)" }}>
                    No magic items this time.
                  </p>
                ) : (
                  treasureRoll.items.map((item, i) => (
                    <div key={i} style={{ marginTop: "0.25rem" }}>
                      <p style={{ fontSize: "0.72rem" }}>
                        <span className="pill">{item.rarity}</span> <strong>{item.name}</strong>{" "}
                        <span style={{ color: "var(--text-faint)" }}>
                          ({item.category}
                          {item.attunement ? ", Requires Attunement" : ""} · {item.gp.toLocaleString()} gp)
                        </span>
                      </p>
                      <p style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginTop: "0.05rem", lineHeight: 1.25 }}>
                        {item.effect}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">
            Quick Trap
            <button
              className="btn small primary"
              onClick={() => setTrap(generateTrap(trapTierIdx, trapDeadly, trapObjectLock))}
            >
              🎲 Generate
            </button>
          </h2>
          <div className="gen-output">
            <div className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
              <select
                className="field"
                value={trapTierIdx}
                style={{ fontSize: "0.66rem" }}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setTrapTierIdx(idx);
                  setTrap(generateTrap(idx, trapDeadly, trapObjectLock));
                }}
              >
                {improvisedDamage.map((row, i) => (
                  <option key={row.levelTier} value={i}>
                    Levels {row.levelTier}
                  </option>
                ))}
              </select>
              <select
                className="field"
                value={trapObjectLock}
                style={{ fontSize: "0.66rem" }}
                onChange={(e) => {
                  setTrapObjectLock(e.target.value);
                  setTrap(generateTrap(trapTierIdx, trapDeadly, e.target.value));
                }}
              >
                <option value="Random">Any object</option>
                {trapObjects.map((o) => (
                  <option key={o.object} value={o.object}>
                    {o.object}
                  </option>
                ))}
              </select>
              <label className="row" style={{ fontSize: "0.68rem", gap: "0.25rem" }}>
                <input
                  type="checkbox"
                  checked={trapDeadly}
                  onChange={(e) => {
                    setTrapDeadly(e.target.checked);
                    setTrap(generateTrap(trapTierIdx, e.target.checked, trapObjectLock));
                  }}
                />
                Deadly
              </label>
            </div>
            <p style={{ marginTop: "0.3rem" }}>
              <span className="pill">{trap.object}</span>
            </p>
            <p style={{ marginTop: "0.15rem" }}>
              <strong style={{ color: "var(--accent)" }}>Trigger.</strong> {trap.trigger}.
            </p>
            <p style={{ marginTop: "0.15rem" }}>
              <strong style={{ color: "var(--accent)" }}>Effect.</strong> {trap.effectText.charAt(0).toUpperCase() + trap.effectText.slice(1)} erupts. {trap.save} saving throw DC {trap.saveDC} ({dcLabel(trap.saveDC)}) or take {trap.damage} {trap.damageType} damage.
            </p>
            <p style={{ marginTop: "0.15rem", color: "var(--text-faint)", fontSize: "0.7rem" }}>
              Detect DC {trap.detectDC} ({dcLabel(trap.detectDC)}) · Disarm DC {trap.disarmDC} ({dcLabel(trap.disarmDC)})
            </p>
          </div>
          <p className="card-note">
            Damage dice are from the verified Improvising Damage table; DCs are real Difficulty Class values at a
            designed escalation by level. Trigger/effect text is homebrew, limited to the subset that fits the
            chosen object (a Statue can breathe fire; a Chest can't).
          </p>
        </section>
      </div>

      <div className="masonry-col">
        <section className="card">
          <h2 className="card-title">
            Plot Hook / Complication
            <button
              className="btn small primary"
              onClick={() => {
                setHook(genHook());
                setComplication(pick(complications));
              }}
            >
              🎲 Generate
            </button>
          </h2>
          <div className="gen-output">
            <p>{hook}</p>
            <p style={{ marginTop: "0.4rem", color: "var(--text-dim)" }}>
              <strong style={{ color: "var(--accent-dim)" }}>Twist:</strong> {complication}
            </p>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">
            Custom Magic Item
            <button
              className="btn small primary"
              onClick={() => {
                setCustomItem(generateMagicItem(customRarity, categoryLock));
                rerollArtifactName();
              }}
            >
              🎲 Generate
            </button>
          </h2>
          <div className="gen-output">
            <div className="row" style={{ gap: "0.4rem", alignItems: "center" }}>
              <select
                className="field"
                value={customRarity}
                style={{ fontSize: "0.68rem" }}
                onChange={(e) => {
                  setCustomRarity(e.target.value);
                  setCustomItem(generateMagicItem(e.target.value, categoryLock));
                  rerollArtifactName();
                }}
              >
                {magicItemRarities.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                className="field"
                value={categoryLock}
                style={{ fontSize: "0.66rem" }}
                onChange={(e) => {
                  setCategoryLock(e.target.value);
                  setCustomItem(generateMagicItem(customRarity, e.target.value));
                  rerollArtifactName();
                }}
              >
                <option value="Random">Any category</option>
                {allItemCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: "0.35rem" }}>
              <strong style={{ color: "var(--accent)" }}>{customItem.name}</strong>{" "}
              <span className="pill">{customItem.rarity}</span>
              <p style={{ color: "var(--text-faint)", fontSize: "0.7rem", marginTop: "0.15rem" }}>
                {customItem.category}
                {customItem.attunement ? " (Requires Attunement)" : ""} · {customItem.gp.toLocaleString()} gp
              </p>
              <p style={{ marginTop: "0.25rem", color: "var(--text-dim)" }}>{customItem.effect}</p>
            </div>
            {customItem.rarity === "Legendary" &&
              customItem.category !== "Potion" &&
              customItem.category !== "Scroll" && (
              <div style={{ marginTop: "0.3rem", paddingTop: "0.2rem", borderTop: "1px dashed var(--border-soft)" }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ fontSize: "0.62rem", color: "var(--text-dim)" }}>
                    <strong>Known As</strong> <span style={{ color: "var(--text-faint)" }}>(artifacts earn a name)</span>
                  </p>
                  <button className="btn small primary" onClick={() => rerollArtifactName()}>
                    🎲
                  </button>
                </div>
                <p style={{ fontSize: "0.85rem", marginTop: "0.1rem" }}>
                  <strong style={{ color: "var(--accent)" }}>{artifactName}</strong>
                </p>
              </div>
            )}
          </div>
          <p className="card-note">
            Category/attunement/archetype ({customItem.archetype}) rolled from odds counted across 237 real SRD
            items, gap-filled per rarity; GP value and Scroll DC/attack bonus are verified SRD numbers, effect
            prose is generated (styled after real items). Legendary items also get a homebrew "Known As" name —
            deliberately non-descriptive of the item's type or effect, since artifacts are named for legend, not
            function. Names won't repeat this session. Potions/Scrolls don't get one.
          </p>
        </section>
      </div>

      <div className="masonry-col">
        <section className="card">
          <h2 className="card-title">
            Business Generator
            <button
              className="btn small primary"
              onClick={() => setShopStock(rollShopInventory(shopTypeIdx, shopWealthIdx))}
            >
              🎲 Generate
            </button>
          </h2>
          <div className="gen-output">
            <div className="row" style={{ gap: "0.4rem" }}>
              <select
                className="field"
                value={shopTypeIdx}
                style={{ fontSize: "0.66rem" }}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setShopTypeIdx(idx);
                  setShopStock(rollShopInventory(idx, shopWealthIdx));
                  setShopName(genShopName(shopTypes[idx].type));
                }}
              >
                {shopTypes.map((s, i) => (
                  <option key={s.type} value={i}>
                    {s.type}
                  </option>
                ))}
              </select>
              <select
                className="field"
                value={shopWealthIdx}
                style={{ fontSize: "0.66rem" }}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setShopWealthIdx(idx);
                  setShopStock(rollShopInventory(shopTypeIdx, idx));
                }}
              >
                {shopWealthTiers.map((w, i) => (
                  <option key={w.tier} value={i}>
                    {w.tier} (≤{w.maxGp}gp)
                  </option>
                ))}
              </select>
            </div>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: "0.3rem" }}>
              <strong style={{ color: "var(--accent)", fontSize: "0.78rem" }}>{shopName}</strong>
              <button
                className="btn small primary"
                onClick={() => setShopName(genShopName(shopTypes[shopTypeIdx].type))}
                title="Reroll shop name"
              >
                🎲
              </button>
            </div>
            <p style={{ fontSize: "0.64rem", color: "var(--text-faint)", marginTop: "0.15rem" }}>
              {shopStock.shopType} · {shopStock.wealthTier} · specialty stock:
            </p>
            <ul className="tight-list" style={{ marginTop: "0.1rem" }}>
              {shopStock.items.map((item, i) => (
                <li key={i}>
                  {item.name} <span style={{ color: "var(--text-faint)" }}>({formatCoins(item.gp)})</span>
                </li>
              ))}
            </ul>
            {shopStock.mundaneItems.length > 0 && (
              <div style={{ marginTop: "0.3rem", paddingTop: "0.2rem", borderTop: "1px dashed var(--border-soft)" }}>
                <p style={{ fontSize: "0.62rem", color: "var(--text-dim)", marginBottom: "0.15rem" }}>
                  <strong>Also on hand</strong> <span style={{ color: "var(--text-faint)" }}>(assumed, not rolled)</span>
                </p>
                <ul
                  style={{
                    maxHeight: "12rem",
                    overflowY: "auto",
                    fontSize: "0.66rem",
                    lineHeight: 1.6,
                    color: "var(--text-faint)",
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                  }}
                >
                  {shopStock.mundaneItems.map((item) => (
                    <li key={item.name}>
                      {item.name} <span style={{ color: "var(--text-faint)" }}>({formatCoins(item.gp)})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {shopStock.magicItem && (
              <div style={{ marginTop: "0.3rem", paddingTop: "0.2rem", borderTop: "1px dashed var(--border-soft)" }}>
                <p style={{ fontSize: "0.62rem", color: "var(--accent)", marginBottom: "0.15rem" }}>
                  <strong>✨ Magic Find</strong>
                </p>
                <p style={{ fontSize: "0.72rem" }}>
                  <span className="pill">{shopStock.magicItem.rarity}</span> <strong>{shopStock.magicItem.name}</strong>{" "}
                  <span style={{ color: "var(--text-faint)" }}>
                    ({shopStock.magicItem.category}
                    {shopStock.magicItem.attunement ? ", Requires Attunement" : ""} · {formatCoins(shopStock.magicItem.gp)})
                  </span>
                </p>
                <p style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginTop: "0.05rem", lineHeight: 1.25 }}>
                  {shopStock.magicItem.effect}
                </p>
              </div>
            )}
            {shopTypes[shopTypeIdx].type === "Bookshop" && (
              <div style={{ marginTop: "0.3rem", paddingTop: "0.2rem", borderTop: "1px dashed var(--border-soft)" }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ fontSize: "0.62rem", color: "var(--text-dim)" }}>
                    <strong>Generate a Book</strong>
                  </p>
                  <button className="btn small primary" onClick={() => setGeneratedBook(genBook())}>
                    🎲
                  </button>
                </div>
                <p style={{ fontSize: "0.72rem", marginTop: "0.1rem" }}>
                  <span className="pill">{generatedBook.genre}</span> <strong>{generatedBook.title}</strong>
                </p>
                <p style={{ fontSize: "0.66rem", color: "var(--text-dim)", marginTop: "0.05rem", lineHeight: 1.25 }}>
                  {generatedBook.blurb}
                </p>
              </div>
            )}
          </div>
          <p className="card-note">
            Covers 15 business types, including Tavern/Inn — real SRD 5.2 data (fixed-price equipment, the full
            Weapons/Armor/Food-Drink-Lodging tables), plus homebrew jewelry/oddity/dish lists where the SRD prices
            the category but not specific items (a "Meal" is priced by lifestyle tier, not by what's in the bowl,
            so dish names like Rabbit Stew are invented but anchored to the real tier price). Every business has a
            hand-picked common (assumed, not rolled) and exotic (rolled) list — no shared generic buckets, so an
            Alchemist can't turn up a Saddle. Pawnshop is the one exception: no common tier, rolling instead from
            every pool combined. Each business also has a homebrew, wealth-gated chance of an actual magic item in
            a category that fits it (Weapon for Blacksmith, Potion for Alchemist/Tavern, etc.) — capped at a
            rarity appropriate to its wealth tier. Firearms (Musket, Pistol) are excluded from the default weapon
            roll since the SRD flags them as GM-optional. Bookshop also gets its own title/blurb generator
            (homebrew, six genres) below its stock; every business gets its own name (see the dice next to it).
          </p>
        </section>
      </div>

      <div className="masonry-col">
        <section className="card">
          <h2 className="card-title">
            Monster Generator
            <button
              className="btn small primary"
              onClick={() =>
                setMonster(
                  generateMonster(
                    monsterDesignByCR[crIdx].cr,
                    includeSpells,
                    includeLegendaryActions,
                    includeLairActions,
                    monsterTypeLock
                  )
                )
              }
            >
              🎲 Generate
            </button>
          </h2>
          <div className="gen-output">
            <div className="row" style={{ gap: "0.8rem" }}>
              <select
                className="field"
                value={crIdx}
                style={{ fontSize: "0.68rem" }}
                onChange={(e) => {
                  const newIdx = Number(e.target.value);
                  setCrIdx(newIdx);
                  setMonster(
                    generateMonster(
                      monsterDesignByCR[newIdx].cr,
                      includeSpells,
                      includeLegendaryActions,
                      includeLairActions,
                      monsterTypeLock
                    )
                  );
                }}
              >
                {monsterDesignByCR.map((r, i) => (
                  <option key={r.cr} value={i}>
                    CR {r.cr}
                  </option>
                ))}
              </select>
              <select
                className="field"
                value={monsterTypeLock}
                style={{ fontSize: "0.66rem" }}
                onChange={(e) => setMonsterTypeLock(e.target.value)}
              >
                <option value="Random">Any type</option>
                {monsterTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <label className="row" style={{ fontSize: "0.68rem", gap: "0.25rem" }}>
                <input type="checkbox" checked={includeSpells} onChange={(e) => setIncludeSpells(e.target.checked)} />
                Spellcasting
              </label>
              <label className="row" style={{ fontSize: "0.68rem", gap: "0.25rem" }}>
                <input
                  type="checkbox"
                  checked={includeLegendaryActions}
                  onChange={(e) => setIncludeLegendaryActions(e.target.checked)}
                />
                Legendary
              </label>
              <label className="row" style={{ fontSize: "0.68rem", gap: "0.25rem" }}>
                <input type="checkbox" checked={includeLairActions} onChange={(e) => setIncludeLairActions(e.target.checked)} />
                Lair
              </label>
            </div>
            <div style={{ marginTop: "0.4rem", fontSize: "0.72rem", lineHeight: 1.22 }}>
              <strong style={{ color: "var(--accent)" }}>{monster.name}</strong>
              <p style={{ color: "var(--text-faint)", fontSize: "0.7rem", marginTop: "0.1rem" }}>
                {monster.size} {monster.type}, {monster.alignment}
              </p>
              <div className="row" style={{ gap: "0.7rem", marginTop: "0.22rem" }}>
                <span>
                  <strong style={{ color: "var(--accent-dim)" }}>AC</strong> {monster.ac}
                </span>
                <span>
                  <strong style={{ color: "var(--accent-dim)" }}>HP</strong> {monster.hp}
                </span>
                <span>
                  <strong style={{ color: "var(--accent-dim)" }}>Speed</strong> {monster.speed}
                </span>
              </div>
              <p style={{ marginTop: "0.2rem" }}>
                <span className="pill">CR {monster.cr}</span>{" "}
                <span style={{ color: "var(--text-faint)", fontSize: "0.7rem" }}>
                  PB +{monster.pb} · Save DC {monster.dc}
                </span>
              </p>

              {monster.spellcasting && (
                <p style={{ marginTop: "0.22rem" }}>
                  <strong style={{ color: "var(--accent-dim)" }}>Innate Spellcasting.</strong> Spellcasting ability is{" "}
                  {monster.spellcasting.ability} (save DC {monster.dc}). At will: {monster.spellcasting.atWill.join(", ")}.
                  1/Day each: {monster.spellcasting.daily.join(", ")}.
                </p>
              )}

              <p style={{ marginTop: "0.22rem" }}>
                {monster.attacks.length > 1 && (
                  <>
                    <strong>Multiattack.</strong> The {monster.name.toLowerCase()} makes {monster.attacks.length} attacks:{" "}
                    {monster.attacks.map((a) => a.name).join(", ")}.
                    <br />
                  </>
                )}
                {monster.attacks.map((a, i) => (
                  <span key={i}>
                    <strong>{a.name}.</strong> Melee Attack Roll: +{monster.attackBonus}, reach 5 ft. Hit: {a.formula.formula} (
                    {a.formula.avg}) {monster.damageType} damage.{" "}
                  </span>
                ))}
              </p>

              {monster.legendaryActions && (
                <>
                  <p style={{ marginTop: "0.22rem" }}>
                    <strong style={{ color: "var(--accent-dim)" }}>Legendary Actions</strong>{" "}
                    <span style={{ color: "var(--text-faint)", fontSize: "0.66rem" }}>(3/round — see Monsters &amp; XP)</span>
                  </p>
                  <ul className="tight-list" style={{ marginTop: "0.15rem" }}>
                    <li>Attack. The {monster.name.toLowerCase()} makes one {monster.attacks[0].name} attack.</li>
                    <li>Move. The {monster.name.toLowerCase()} moves up to its Speed without provoking Opportunity Attacks.</li>
                    <li>{monster.legendaryActions.extra}</li>
                  </ul>
                </>
              )}

              {monster.lairActions && (
                <>
                  <p style={{ marginTop: "0.22rem" }}>
                    <strong style={{ color: "var(--accent-dim)" }}>Lair Actions</strong>{" "}
                    <span style={{ color: "var(--text-faint)", fontSize: "0.66rem" }}>(init. 20 — see Monsters &amp; XP)</span>
                  </p>
                  <ul className="tight-list" style={{ marginTop: "0.15rem" }}>
                    {monster.lairActions.effects.map((effect, i) => (
                      <li key={i}>{effect}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
          <p className="card-note">
            Generated from the classic monster-design-by-CR target numbers (AC/HP/attack bonus/damage/save DC) —
            reconstructed from memory, not sourced from the SRD, and not verified against the 2024 DMG specifically.
            Name/type/attack/spells/legendary options are flavor; treat this as a rough draft to reskin, not a finished
            stat block.
          </p>
        </section>
      </div>
    </div>
  );
}
