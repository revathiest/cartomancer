// "Monster Statistics by Challenge Rating" — target AC/HP/Attack Bonus/Damage-per-Round/
// Save DC for building a monster from scratch at a given CR. Reconstructed from general
// knowledge of the classic (2014) DMG version of this table — NOT sourced from the free
// SRD 5.2 (which doesn't include monster-design-from-scratch guidance at all), and NOT
// independently verified against the 2024 DMG. Use as a starting point, not gospel.
export interface MonsterDesignRow {
  cr: string;
  pb: number;
  ac: number;
  hpMin: number;
  hpMax: number;
  atk: number;
  dprMin: number;
  dprMax: number;
  dc: number;
}

export const monsterDesignByCR: MonsterDesignRow[] = [
  { cr: "0", pb: 2, ac: 13, hpMin: 1, hpMax: 6, atk: 3, dprMin: 0, dprMax: 1, dc: 13 },
  { cr: "1/8", pb: 2, ac: 13, hpMin: 7, hpMax: 35, atk: 3, dprMin: 2, dprMax: 3, dc: 13 },
  { cr: "1/4", pb: 2, ac: 13, hpMin: 36, hpMax: 49, atk: 3, dprMin: 4, dprMax: 5, dc: 13 },
  { cr: "1/2", pb: 2, ac: 13, hpMin: 50, hpMax: 70, atk: 3, dprMin: 6, dprMax: 8, dc: 13 },
  { cr: "1", pb: 2, ac: 13, hpMin: 71, hpMax: 85, atk: 3, dprMin: 9, dprMax: 14, dc: 13 },
  { cr: "2", pb: 2, ac: 13, hpMin: 86, hpMax: 100, atk: 3, dprMin: 15, dprMax: 20, dc: 13 },
  { cr: "3", pb: 2, ac: 13, hpMin: 101, hpMax: 115, atk: 4, dprMin: 21, dprMax: 26, dc: 13 },
  { cr: "4", pb: 2, ac: 14, hpMin: 116, hpMax: 130, atk: 5, dprMin: 27, dprMax: 32, dc: 14 },
  { cr: "5", pb: 3, ac: 15, hpMin: 131, hpMax: 145, atk: 6, dprMin: 33, dprMax: 38, dc: 15 },
  { cr: "6", pb: 3, ac: 15, hpMin: 146, hpMax: 160, atk: 6, dprMin: 39, dprMax: 44, dc: 15 },
  { cr: "7", pb: 3, ac: 15, hpMin: 161, hpMax: 175, atk: 6, dprMin: 45, dprMax: 50, dc: 15 },
  { cr: "8", pb: 3, ac: 16, hpMin: 176, hpMax: 190, atk: 7, dprMin: 51, dprMax: 56, dc: 16 },
  { cr: "9", pb: 4, ac: 16, hpMin: 191, hpMax: 205, atk: 7, dprMin: 57, dprMax: 62, dc: 16 },
  { cr: "10", pb: 4, ac: 17, hpMin: 206, hpMax: 220, atk: 7, dprMin: 63, dprMax: 68, dc: 17 },
  { cr: "11", pb: 4, ac: 17, hpMin: 221, hpMax: 235, atk: 8, dprMin: 69, dprMax: 74, dc: 17 },
  { cr: "12", pb: 4, ac: 17, hpMin: 236, hpMax: 250, atk: 8, dprMin: 75, dprMax: 80, dc: 18 },
  { cr: "13", pb: 5, ac: 18, hpMin: 251, hpMax: 265, atk: 8, dprMin: 81, dprMax: 86, dc: 18 },
  { cr: "14", pb: 5, ac: 18, hpMin: 266, hpMax: 280, atk: 8, dprMin: 87, dprMax: 92, dc: 18 },
  { cr: "15", pb: 5, ac: 18, hpMin: 281, hpMax: 295, atk: 8, dprMin: 93, dprMax: 98, dc: 18 },
  { cr: "16", pb: 5, ac: 18, hpMin: 296, hpMax: 310, atk: 9, dprMin: 99, dprMax: 104, dc: 18 },
  { cr: "17", pb: 6, ac: 19, hpMin: 311, hpMax: 325, atk: 10, dprMin: 105, dprMax: 110, dc: 19 },
  { cr: "18", pb: 6, ac: 19, hpMin: 326, hpMax: 340, atk: 10, dprMin: 111, dprMax: 116, dc: 19 },
  { cr: "19", pb: 6, ac: 19, hpMin: 341, hpMax: 355, atk: 10, dprMin: 117, dprMax: 122, dc: 19 },
  { cr: "20", pb: 6, ac: 19, hpMin: 356, hpMax: 400, atk: 10, dprMin: 123, dprMax: 140, dc: 19 },
  { cr: "21", pb: 7, ac: 19, hpMin: 401, hpMax: 445, atk: 11, dprMin: 141, dprMax: 158, dc: 20 },
  { cr: "22", pb: 7, ac: 19, hpMin: 446, hpMax: 490, atk: 11, dprMin: 159, dprMax: 176, dc: 20 },
  { cr: "23", pb: 7, ac: 19, hpMin: 491, hpMax: 535, atk: 11, dprMin: 177, dprMax: 194, dc: 20 },
  { cr: "24", pb: 7, ac: 19, hpMin: 536, hpMax: 580, atk: 12, dprMin: 195, dprMax: 212, dc: 21 },
  { cr: "25", pb: 8, ac: 19, hpMin: 581, hpMax: 625, atk: 12, dprMin: 213, dprMax: 230, dc: 21 },
  { cr: "26", pb: 8, ac: 19, hpMin: 626, hpMax: 670, atk: 12, dprMin: 231, dprMax: 248, dc: 21 },
  { cr: "27", pb: 8, ac: 19, hpMin: 671, hpMax: 715, atk: 13, dprMin: 249, dprMax: 266, dc: 22 },
  { cr: "28", pb: 8, ac: 19, hpMin: 716, hpMax: 760, atk: 13, dprMin: 267, dprMax: 284, dc: 22 },
  { cr: "29", pb: 9, ac: 19, hpMin: 761, hpMax: 805, atk: 13, dprMin: 285, dprMax: 302, dc: 22 },
  { cr: "30", pb: 9, ac: 19, hpMin: 806, hpMax: 850, atk: 14, dprMin: 303, dprMax: 320, dc: 23 },
];

export const monsterSizes = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
export const monsterTypes = [
  "Aberration", "Beast", "Celestial", "Construct", "Dragon", "Elemental",
  "Fey", "Fiend", "Giant", "Monstrosity", "Ooze", "Plant", "Undead",
];
export const monsterNameAdjectives = [
  "Ashen", "Blighted", "Charred", "Dread", "Ember", "Frost", "Gloom", "Hollow",
  "Iron", "Jagged", "Krag", "Lurking", "Molten", "Night", "Obsidian", "Pale",
  "Quaking", "Rotting", "Shadow", "Thorned", "Umbral", "Venomous", "Withered", "Wretched",
];
export const monsterNameNouns = [
  "Stalker", "Wraith", "Fang", "Horror", "Lurker", "Reaver", "Husk", "Warden",
  "Terror", "Brute", "Screecher", "Devourer", "Gorger", "Skulker", "Harrower",
  "Ravager", "Prowler", "Blight", "Fiend", "Marauder", "Gnasher", "Coiler",
];

// Flavor-only spell name pools by rough power tier — not tied to any verified spellcasting
// design formula. If you enable Spellcasting, treat the spell save DC (from the table above)
// as the only mechanically real number; the spell list itself is just a starting suggestion.
export const spellsByTier = {
  low: ["Minor Illusion", "Guidance", "Light", "Charm Person", "Sleep", "Thunderwave", "Ray of Sickness"],
  mid: ["Invisibility", "Suggestion", "Web", "Fireball", "Counterspell", "Hold Person", "Lightning Bolt"],
  high: ["Fear", "Dominate Person", "Wall of Force", "Cone of Cold", "Dominate Monster", "Meteor Swarm", "Finger of Death"],
};

// Flavor-only legendary action options beyond the standard "Attack" and "Move" — same
// caveat as spellsByTier: these are suggestions to reskin, not a verified formula.
export const legendaryExtraActions = [
  "Frightful Presence (Costs 2 Actions). Each creature of the DM's choice within 30 feet must succeed on a Wisdom saving throw (DC as above) or have the Frightened condition until the end of the monster's next turn.",
  "Rally (Costs 2 Actions). The monster regains 10 Hit Points.",
  "Savage Rend (Costs 2 Actions). The monster makes one additional attack.",
  "Baleful Gaze (Costs 2 Actions). One creature the monster can see within 30 feet must succeed on a Wisdom saving throw (DC as above) or have the Poisoned condition until the end of its next turn.",
  "Summon Minion (Costs 2 Actions). A lesser creature answering to the monster arrives in an unoccupied space within 30 feet.",
];

// Flavor-only lair action setups — the effect text is a suggestion; the damage die is pulled
// from the verified Nuisance/Deadly table (Monsters & XP page) so at least that part is real.
export const lairActionFlavors = [
  "Jagged stone erupts from the floor in a 10-foot-radius Sphere within the lair. Each creature there must succeed on a Dexterity saving throw or take",
  "A wave of dark energy sweeps through the lair. Each creature of the DM's choice there must succeed on a Constitution saving throw or take",
  "The air crackles with wild magic. Each spellcaster in the lair must succeed on a Wisdom saving throw or take",
  "The ground shudders and cracks open. Each creature standing there must succeed on a Strength saving throw or take",
  "A chilling wind howls through the lair. Each creature there must succeed on a Constitution saving throw or take",
];
