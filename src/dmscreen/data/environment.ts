// Verified directly against the official SRD 5.2 PDF ("Playing the Game", p.12).
export const travelPace = [
  {
    pace: "Fast",
    perMinute: "400 ft",
    perHour: "4 miles",
    perDay: "30 miles",
    effect: "Disadv. on Wisdom (Perception or Survival) and Dexterity (Stealth) checks",
  },
  { pace: "Normal", perMinute: "300 ft", perHour: "3 miles", perDay: "24 miles", effect: "Disadv. on Dexterity (Stealth) checks" },
  { pace: "Slow", perMinute: "200 ft", perHour: "2 miles", perDay: "18 miles", effect: "Adv. on Wisdom (Perception or Survival) checks" },
];

// "Travel Terrain" (SRD 5.2 "Gameplay Toolbox", p.192) — verified directly against
// the official SRD 5.2 PDF, all 11 terrains and all 5 columns confirmed exact.
export const travelTerrain = [
  { terrain: "Arctic", maxPace: "Fast*", dist: "6d6 × 10 ft", forage: 20, nav: 10, search: 10 },
  { terrain: "Coastal", maxPace: "Normal", dist: "2d10 × 10 ft", forage: 10, nav: 5, search: 15 },
  { terrain: "Desert", maxPace: "Normal", dist: "6d6 × 10 ft", forage: 20, nav: 10, search: 10 },
  { terrain: "Forest", maxPace: "Normal", dist: "2d8 × 10 ft", forage: 10, nav: 15, search: 15 },
  { terrain: "Grassland", maxPace: "Fast", dist: "6d6 × 10 ft", forage: 15, nav: 5, search: 15 },
  { terrain: "Hill", maxPace: "Normal", dist: "2d10 × 10 ft", forage: 15, nav: 10, search: 15 },
  { terrain: "Mountain", maxPace: "Slow", dist: "4d10 × 10 ft", forage: 20, nav: 15, search: 20 },
  { terrain: "Swamp", maxPace: "Slow", dist: "2d8 × 10 ft", forage: 10, nav: 15, search: 20 },
  { terrain: "Underdark", maxPace: "Normal", dist: "2d6 × 10 ft", forage: 20, nav: 10, search: 20 },
  { terrain: "Urban", maxPace: "Normal", dist: "2d6 × 10 ft", forage: 20, nav: 15, search: 15 },
  { terrain: "Waterborne", maxPace: "Special§", dist: "6d6 × 10 ft", forage: 15, nav: 10, search: 15 },
];
export const travelTerrainNote =
  "* Needs gear like skis to keep a Fast pace in Arctic terrain. § Waterborne pace depends on the vessel.";

export const foodDrinkLodging = {
  items: [
    { item: "Ale (mug)", cost: "4 CP" },
    { item: "Bread (loaf)", cost: "2 CP" },
    { item: "Cheese (wedge)", cost: "1 SP" },
    { item: "Wine, common (bottle)", cost: "2 SP" },
    { item: "Wine, fine (bottle)", cost: "10 GP" },
  ],
  meal: [
    { tier: "Squalid", cost: "1 CP" },
    { tier: "Poor", cost: "2 CP" },
    { tier: "Modest", cost: "1 SP" },
    { tier: "Comfortable", cost: "2 SP" },
    { tier: "Wealthy", cost: "3 SP" },
    { tier: "Aristocratic", cost: "6 SP" },
  ],
  innStay: [
    { tier: "Squalid", cost: "7 CP" },
    { tier: "Poor", cost: "1 SP" },
    { tier: "Modest", cost: "5 SP" },
    { tier: "Comfortable", cost: "8 SP" },
    { tier: "Wealthy", cost: "2 GP" },
    { tier: "Aristocratic", cost: "4 GP" },
  ],
};
export const foodDrinkLodgingNote =
  "These are one-off purchase prices, not daily upkeep. To track ongoing living costs while the party is settled somewhere, use a Lifestyle (Wretched through Aristocratic) instead.";

// Verified directly against the official SRD 5.2 PDF equipment entries (Candle, Lamp,
// Bullseye/Hooded Lantern, Torch) — radius, dim range, and duration all confirmed exact.
export const lightSources = [
  { source: "Candle", bright: "5 ft", dim: "+5 ft", duration: "1 hour" },
  { source: "Lamp", bright: "15 ft", dim: "+30 ft", duration: "6 hours" },
  { source: "Lantern, Bullseye", bright: "60-ft cone", dim: "+60 ft", duration: "6 hours" },
  { source: "Lantern, Hooded", bright: "30 ft (0 hooded)", dim: "+30 ft (5 ft hooded)", duration: "6 hours" },
  { source: "Torch", bright: "20 ft", dim: "+20 ft", duration: "1 hour" },
];
export const lightSourcesNote =
  "Everyone sees normally within the Bright Light radius. The Dim Light band beyond it is Lightly Obscured (see Light & Vision on Core Rules); past both, it's Darkness.";

// Not present in the free SRD 5.2 — likely DMG-exclusive. Couldn't independently
// verify these three the way everything else was; included on trust in the source.
export const audibleDistance = [
  { noise: "Trying to be quiet", distance: "2d6 × 5 ft" },
  { noise: "Normal noise level", distance: "2d6 × 10 ft" },
  { noise: "Very loud", distance: "2d6 × 50 ft" },
];
export const audibleDistanceNote =
  "Roll to see how far a sound carries. Anyone listening within that range can attempt a Wisdom (Perception) check to notice it.";

export const visibilityOutdoors = [
  { conditions: "Clear day, no obstructions", distance: "2 miles (40 mi. from a height)" },
  { conditions: "Rain (Lightly Obscured)", distance: "1 mile" },
  { conditions: "Fog (Lightly Obscured)", distance: "100 to 300 ft" },
];
export const visibilityOutdoorsNote =
  "Sets the maximum range at which a creature or hazard can be spotted outdoors — use it to judge surprise and encounter distance in the open.";

export const weatherTemperatureRoll = [
  { roll: "1–14", result: "Normal for the season" },
  { roll: "15–17", result: "1d4 × 10°F colder" },
  { roll: "18–20", result: "1d4 × 10°F hotter" },
];

export const weatherWindRoll = [
  { roll: "1–12", result: "None" },
  { roll: "13–17", result: "Light" },
  { roll: "18–20", result: "Strong" },
];

export const weatherPrecipitationRoll = [
  { roll: "1–12", result: "None" },
  { roll: "13–17", result: "Light rain or light snowfall" },
  { roll: "18–20", result: "Heavy rain or heavy snowfall" },
];
export const weatherRollNote =
  "Roll 1d20 once on Temperature and once on Wind/Precipitation — typically each morning, or whenever conditions might plausibly shift.";

export const terrainDCs = [
  { task: "Climb a rough surface", dc: 15 },
  { task: "Climb a surface with good holds", dc: 10 },
  { task: "Swim in calm water", dc: 10 },
  { task: "Swim in rough/stormy water", dc: 15 },
  { task: "Jump a gap (running start)", dc: "Str score in feet cleared" },
  { task: "Balance on a narrow ledge", dc: 10 },
  { task: "Hold breath beyond 1 + Con mod minutes", dc: "10, +1 per extra round, or suffocate" },
  { task: "Track a creature (fresh trail)", dc: 10 },
  { task: "Track a creature (faint/old trail)", dc: 20 },
  { task: "Forage for food in the wild", dc: 15 },
];
export const terrainDCsNote =
  "Roll the listed ability check against the DC. Failure usually just means no progress, but a few (swimming, holding breath) carry a real consequence for failing.";

export const weatherTemperature = [
  "Bitter cold — exposed skin risks frostbite",
  "Cold — breath fogs, water may freeze",
  "Cool — comfortable with a cloak",
  "Mild — pleasant traveling weather",
  "Warm — light layers only",
  "Hot — water and shade become important",
  "Scorching — risk of exhaustion without relief",
];

export const weatherWind = [
  "Still air",
  "Light breeze",
  "Steady wind — cloaks and banners flap",
  "Strong wind — ranged attacks at disadvantage, hard to hear",
  "Gale — difficult to move against, small objects blow away",
];

export const weatherPrecipitation = [
  "Clear skies",
  "Overcast",
  "Light rain / drizzle",
  "Heavy rain — visibility drops, lightly obscured",
  "Thunderstorm — occasional lightning, loud",
  "Fog — heavily obscured beyond short range",
  "Snow — ground difficult terrain if it settles",
  "Hail — minor discomfort, loud on any hard surface",
];

export const dressingSmell = ["wet stone", "old smoke", "rot", "incense", "rust", "candle wax", "mildew", "something faintly sweet"];
export const dressingLight = ["dim and flickering", "cold and blue-white", "shafted through cracks above", "almost total darkness", "a single guttering torch", "an eerie phosphorescent glow"];
export const dressingFloor = ["cracked flagstone", "packed earth", "loose gravel", "warped wooden boards", "slick wet stone", "a carpet thick with dust"];
export const dressingFloorSound = ["crunches", "creaks", "echoes sharply", "muffles every footstep", "shifts unsteadily"];
export const dressingSound = ["water drips steadily", "something skitters just out of sight", "a low draft moans through a gap", "a distant sound repeats, too regular to be natural", "all is dead silent — unnaturally so"];
export const dressingTemp = ["colder", "warmer", "damper", "drier"];
