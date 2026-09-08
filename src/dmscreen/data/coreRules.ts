export interface Condition {
  name: string;
  effect: string;
}

export const conditions: Condition[] = [
  { name: "Blinded", effect: "Auto-fail sight checks. Attacks vs. you: adv. Your attacks: disadv." },
  { name: "Charmed", effect: "Can't attack charmer or target them with harmful abilities. Charmer has adv. on social checks vs. you." },
  { name: "Deafened", effect: "Auto-fail hearing checks." },
  { name: "Frightened", effect: "Disadv. on ability checks/attacks while source in sight. Can't willingly move closer to source." },
  { name: "Grappled", effect: "Speed 0. Disadv. on attacks vs. anyone but the grappler. Grappler can drag/carry you (costs it 1 extra ft/ft unless you're Tiny or 2+ sizes smaller)." },
  { name: "Incapacitated", effect: "Can't take actions/Bonus Actions/Reactions, can't speak, concentration breaks. Disadv. on initiative if incapacitated when you roll it." },
  { name: "Invisible", effect: "Concealed (unseen effects don't affect you unless creator can see you). Attacks vs. you: disadv. Your attacks: adv. Adv. on initiative." },
  { name: "Paralyzed", effect: "Incapacitated, can't move/speak. Auto-fail Str/Dex saves. Attacks vs. you: adv. Hits within 5ft are crits." },
  { name: "Petrified", effect: "Transformed to stone (weight ×10), incapacitated, unaware. Attacks vs. you: adv. Auto-fail Str/Dex saves. Resist all damage. Immune to Poisoned condition." },
  { name: "Poisoned", effect: "Disadv. on attack rolls and ability checks." },
  { name: "Prone", effect: "Only crawl or stand (costs half speed). Disadv. on attacks. Melee attacks vs. you: adv.; ranged: disadv." },
  { name: "Restrained", effect: "Speed 0. Disadv. on attacks and Dex saves. Attacks vs. you: adv." },
  { name: "Stunned", effect: "Incapacitated, can't move, can speak falteringly. Auto-fail Str/Dex saves. Attacks vs. you: adv." },
  { name: "Unconscious", effect: "Incapacitated, can't move/speak, unaware. Drop what you're holding, fall prone. Auto-fail Str/Dex saves. Attacks vs. you: adv. Hits within 5ft are crits." },
];
export const conditionsNote =
  "A creature can have several conditions at once, and their effects stack. A condition lasts until whatever caused it says it ends — removing one source doesn't end the condition if another source is still imposing it.";

// 2024 PHB rules: exhaustion dropped the old 2014 stepped-effects table in favor of
// two flat, cumulative penalties. Reconstructed from memory — verify vs. your PHB.
export const exhaustionLevels = [
  { level: 1, d20: "-2", speed: "-5 ft", death: false },
  { level: 2, d20: "-4", speed: "-10 ft", death: false },
  { level: 3, d20: "-6", speed: "-15 ft", death: false },
  { level: 4, d20: "-8", speed: "-20 ft", death: false },
  { level: 5, d20: "-10", speed: "-25 ft", death: false },
  { level: 6, d20: "—", speed: "—", death: true },
];
export const exhaustionNote =
  "Each level's D20 Test penalty and speed reduction is cumulative with lower levels. Reaching level 6 kills you. A long rest removes 1 level (with food & drink). This replaces the old 2014 stepped table (halved speed/HP, etc.) entirely.";

export interface CombatAction {
  name: string;
  desc: string;
}

// Verified against the official SRD 5.2's own "Action Summary" table (word-for-word).
export const combatActions: CombatAction[] = [
  { name: "Attack", desc: "Attack with a weapon or an Unarmed Strike." },
  { name: "Dash", desc: "For the rest of the turn, gain extra movement equal to your Speed." },
  { name: "Disengage", desc: "Your movement doesn't provoke Opportunity Attacks for the rest of the turn." },
  { name: "Dodge", desc: "Until your next turn, attacks vs. you have disadv. and you make Dex saves with adv. Lost if incapacitated or Speed 0." },
  { name: "Help", desc: "Help another creature's ability check or attack roll, or administer first aid." },
  { name: "Hide", desc: "Make a Dexterity (Stealth) check." },
  { name: "Influence", desc: "Make a Charisma (Deception, Intimidation, Performance, or Persuasion) or Wisdom (Animal Handling) check to alter a creature's attitude." },
  { name: "Magic", desc: "Cast a spell, use a magic item, or use a magical feature." },
  { name: "Ready", desc: "Prepare an action to trigger on a condition you specify (uses your reaction)." },
  { name: "Search", desc: "Make a Wisdom (Insight, Medicine, Perception, or Survival) check." },
  { name: "Study", desc: "Make an Intelligence (Arcana, History, Investigation, Nature, or Religion) check." },
  { name: "Utilize", desc: "Use a nonmagical object." },
];
export const combatActionsNote =
  "You get one action per turn on top of any Bonus Action and Reaction you have available. Only Extra Attack (and similar features) let a single action produce more than one Attack.";

export const coverTable = [
  { name: "Half Cover", bonus: "+2 AC, +2 Dex saves", example: "low wall, furniture, another creature" },
  { name: "Three-Quarters Cover", bonus: "+5 AC, +5 Dex saves", example: "arrow slit, tree trunk, portcullis" },
  { name: "Total Cover", bonus: "Can't be targeted directly", example: "fully behind a wall" },
];
export const coverNote =
  "Applies automatically whenever an obstacle sits between attacker and target — judge the degree from how much of the target's body is blocked. Only the single best degree of cover applies; it doesn't stack.";

export const dcTable = [
  { label: "Very Easy", dc: 5 },
  { label: "Easy", dc: 10 },
  { label: "Medium", dc: 15 },
  { label: "Hard", dc: 20 },
  { label: "Very Hard", dc: 25 },
  { label: "Nearly Impossible", dc: 30 },
];
export const dcNote =
  "Set the DC from the task's difficulty alone, before anyone rolls — not from how good the character is at it. The same task keeps the same DC whether a novice or an expert attempts it.";

export const restRules = [
  {
    name: "Short Rest",
    duration: "1 hour minimum",
    effect: "Spend Hit Dice to heal (roll die + Con mod each). Some class features recharge.",
  },
  {
    name: "Long Rest",
    duration: "8 hours (min 6h sleeping + 2h light activity)",
    effect:
      "Regain all HP and up to half your total Hit Dice (min 1). Remove 1 exhaustion level. Once per 24 hours; needs at least 1 HP at the start.",
  },
];

export const deathSaves = {
  title: "Death Saves",
  lines: [
    "At 0 HP: roll d20 on your turn (no action). 10+ = success, <10 = failure.",
    "3 successes: stabilize (unconscious at 0 HP). 3 failures: die.",
    "Natural 20: regain 1 HP, wake up. Natural 1: counts as two failures.",
    "Taking damage at 0 HP: 1 failure (2 if the hit is a crit). Damage ≥ your HP max in one hit = instant death.",
  ],
};

export const inspirationNote =
  "Heroic Inspiration (2024): when a player has it, they can spend it to reroll one d20 Test (before or after the roll). GMs award it for good roleplay or a hard-fought success.";

export const damageTypes = [
  { name: "Acid", note: "Corrosive — oozes, some breath weapons" },
  { name: "Bludgeoning", note: "Blunt force — hammers, falls, constriction" },
  { name: "Cold", note: "Ice and frost — white dragons, ice devils" },
  { name: "Fire", note: "Flames — red dragons, fire spells" },
  { name: "Force", note: "Pure magical energy — magic missile, spiritual weapon" },
  { name: "Lightning", note: "Electricity — blue dragons, storms" },
  { name: "Necrotic", note: "Decay and death energy — undead, withering spells" },
  { name: "Piercing", note: "Puncturing — arrows, spears, bites" },
  { name: "Poison", note: "Toxins — venom, poison gas" },
  { name: "Psychic", note: "Mental assault — mind flayers, psionics" },
  { name: "Radiant", note: "Holy/searing light — angels, radiant spells" },
  { name: "Slashing", note: "Cutting — swords, axes, claws" },
  { name: "Thunder", note: "Concussive sound — thunderwave, shatter" },
];
export const damageTypesNote =
  "Resistance halves damage taken; Vulnerability doubles it; Immunity negates it entirely. Multiple instances of resistance/vulnerability to the same type don't stack.";

export const lightVision = [
  { name: "Bright Light", effect: "Normal vision." },
  { name: "Dim Light (lightly obscured)", effect: "Disadvantage on Wisdom (Perception) checks that rely on sight." },
  { name: "Darkness (heavily obscured)", effect: "You have the Blinded condition while trying to see anything there." },
  { name: "Darkvision", effect: "See in dim light within range as if bright, and darkness as if dim (shades of gray only)." },
  { name: "Blindsight", effect: "Perceive surroundings without relying on sight, out to a fixed range." },
  { name: "Truesight", effect: "See in normal/magical darkness, see invisible creatures, see through illusions, see a shapechanger's true form." },
];
export const lightVisionNote =
  "Cross-reference a creature's vision against the area's light level: no special vision plus Darkness means Blinded there, even if that same creature sees perfectly fine in Dim Light.";

export const sizes = [
  { size: "Tiny", space: "2½ × 2½ ft" },
  { size: "Small", space: "5 × 5 ft" },
  { size: "Medium", space: "5 × 5 ft" },
  { size: "Large", space: "10 × 10 ft" },
  { size: "Huge", space: "15 × 15 ft" },
  { size: "Gargantuan", space: "20 × 20 ft or larger" },
];
export const sizesNote =
  "A creature's space is how much room it controls in combat — it determines how many creatures can flank or surround it, whether it can squeeze past others, and how many smaller creatures fit in the same area.";

export const skillsByAbility = [
  { ability: "Strength", skills: "Athletics" },
  { ability: "Dexterity", skills: "Acrobatics, Sleight of Hand, Stealth" },
  { ability: "Constitution", skills: "—" },
  { ability: "Intelligence", skills: "Arcana, History, Investigation, Nature, Religion" },
  { ability: "Wisdom", skills: "Animal Handling, Insight, Medicine, Perception, Survival" },
  { ability: "Charisma", skills: "Deception, Intimidation, Performance, Persuasion" },
];
export const skillsByAbilityNote =
  "The pairing shown is just the default. If the fiction calls for a different ability — Strength (Intimidation) to loom over someone, say — use that instead and let the skill's proficiency still apply.";

export const movementExploration = [
  { name: "Difficult terrain", desc: "Each foot of movement through it costs 1 extra foot." },
  { name: "Climb / swim / crawl", desc: "Costs 1 extra foot per foot moved, unless you have a matching speed for it." },
  { name: "Long jump", desc: "Cover feet up to your Str score with a 10-ft running start (half that, rounded down, without one)." },
  { name: "High jump", desc: "Leap 3 + Str modifier feet up with a running start (half without); add reach at the top." },
  { name: "Squeezing", desc: "Into a space one size smaller: costs 2x movement, disadv. on attacks and Dex saves while squeezed." },
  { name: "Opportunity attack", desc: "A hostile creature you can see leaves your reach without Disengaging: use your reaction for one melee attack." },
  {
    name: "Concentration",
    desc: "Starting another Concentration effect ends the first. Taking damage: Con save DC 10 or half damage (round down), whichever is higher, max DC 30. Ends if Incapacitated or dead.",
  },
];
