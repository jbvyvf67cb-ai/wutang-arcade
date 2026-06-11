/**
 * v2.0 gameplay layout — real French Quarter coordinates.
 *
 * The map is built from OSM data (assets/map/quarter.json, see tools/map/).
 * Frame: +Z runs up-river→down-river along Bourbon (Canal at z≈-490,
 * Esplanade at z≈+450); +X runs toward the Mississippi. Street centerlines:
 * Bourbon x≈-147 · Royal x≈-76 · Chartres x≈-4 · Decatur x≈+76 · shore x≈+145.
 * Ground is y=0; balcony decks at y=4.5; the river surface at y=-0.9.
 */

export const TICKET_PRICE = 500;

export const BALCONY_Y = 4.5;

/** River swim: surface height + region test (configured by quarter.ts). */
export const WATER = {
  surfaceY: -0.9,
  /** true if (x,z) is over the Mississippi — set from shoreline data */
  isIn: (_x: number, _z: number): boolean => false,
};

export interface PieceDef {
  id: number;
  name: string;
  pos: [number, number, number];
  /** crop rect of assets/collage/collage.png in UV space [u0,v0,u1,v1] */
  crop: [number, number, number, number];
  /** navigation hint shown when the compass points here */
  hint: string;
}

export const PIECES: PieceDef[] = [
  { id: 1, name: "REALITY", pos: [88, 1.0, 47], crop: [0.05, 0.02, 0.97, 0.16],
    hint: "a café table under the green-striped awning — Café du Monde" },
  { id: 2, name: "IS MERELY", pos: [14, 2.0, -9], crop: [0.08, 0.17, 0.85, 0.28],
    hint: "the buskers' stage in front of the cathedral, Jackson Square" },
  { id: 3, name: "ANOTHER KIND OF", pos: [-142, 1.0, -52], crop: [0.05, 0.3, 0.72, 0.44],
    hint: "a stoop on Bourbon at St. Peter — watch for the frat pack" },
  { id: 4, name: "WONDER.", pos: [-138.5, 7.2, 103], crop: [0.3, 0.56, 0.95, 0.7],
    hint: "atop the diner sign, Bourbon & Dumaine — crates, balcony, jump" },
  { id: 5, name: "Crow & Hat Man", pos: [30, 5.4, -50.4], crop: [0.0, 0.33, 0.33, 0.78],
    hint: "the Pontalba gallery overlooking Jackson Square — climb the ironwork" },
  { id: 6, name: "Flowers & Songbird", pos: [-83, 4.9, -89], crop: [0.08, 0.5, 0.42, 0.85],
    hint: "a hanging basket over Royal Street — cross the balconies" },
  { id: 7, name: "Pin-up Lady", pos: [-41, 0.8, -27], crop: [0.55, 0.28, 1.0, 0.62],
    hint: "the Huntress keeps it — Pirate's Alley, beside the cathedral" },
  { id: 8, name: "Goldfish Bowl", pos: [-63, 1.2, -69], crop: [0.42, 0.6, 1.0, 0.95],
    hint: "inside the Royal St antiques shop — find a way through the roof" },
];

export interface EnemySpawn {
  kind: "frat" | "pirate" | "huntress";
  pos: [number, number, number];
  patrol?: [number, number, number][];
  group?: string;
}

export const ENEMIES: EnemySpawn[] = [
  // Bourbon Street frat packs (with intent: they guard the party blocks)
  { kind: "frat", pos: [-143, 1, -48], group: "catsmeow" },
  { kind: "frat", pos: [-140, 1, -55], group: "catsmeow" },
  { kind: "frat", pos: [-146, 1, -57], group: "catsmeow" },
  { kind: "frat", pos: [-150, 1, -12], group: "tropical" },
  { kind: "frat", pos: [-145, 1, -6], group: "tropical" },
  { kind: "frat", pos: [-148, 1, -192], group: "stlouis" },
  { kind: "frat", pos: [-144, 1, -198], group: "stlouis" },
  { kind: "frat", pos: [-150, 1, -201], group: "stlouis" },
  { kind: "frat", pos: [-150, 1, -320], group: "bienville" },
  { kind: "frat", pos: [-146, 1, -326], group: "bienville" },
  { kind: "frat", pos: [-144, 1, 98], group: "dumaine" },
  { kind: "frat", pos: [-149, 1, 104], group: "dumaine" },
  // Pirates work the riverfront and the market
  { kind: "pirate", pos: [76, 1, 152], patrol: [[70, 1, 146], [82, 1, 162]] },
  { kind: "pirate", pos: [88, 1, 52], patrol: [[92, 1, 58], [80, 1, 44]] },
  { kind: "pirate", pos: [128, 1, -8], patrol: [[124, 1, -22], [134, 1, 8]] },
  { kind: "pirate", pos: [92, 1, -222], patrol: [[96, 1, -214], [86, 1, -232]] },
  { kind: "pirate", pos: [110, 1, 196], patrol: [[104, 1, 188], [118, 1, 206]] },
  { kind: "pirate", pos: [4, 1, 262], patrol: [[0, 1, 254], [8, 1, 270]] },
  // The Huntress lairs in Pirate's Alley
  { kind: "huntress", pos: [-41, 1, -30] },
];

// Final wave at 8/8: between Joshua and Lipstixx on the 300 block
export const LAST_CALL: EnemySpawn[] = [
  { kind: "frat", pos: [-150, 1, -322], group: "last" },
  { kind: "frat", pos: [-145, 1, -326], group: "last" },
  { kind: "frat", pos: [-150, 1, -330], group: "last" },
  { kind: "frat", pos: [-146, 1, -334], group: "last" },
  { kind: "pirate", pos: [-148, 1, -338], patrol: [[-152, 1, -336], [-144, 1, -340]] },
];

export interface ItemSpawn {
  kind: "beignet" | "fishbowl";
  pos: [number, number, number];
}

export const ITEMS: ItemSpawn[] = [
  { kind: "beignet", pos: [85, 1.0, 48] },    // Café du Monde
  { kind: "beignet", pos: [92, 1.0, 55] },    // Café du Monde
  { kind: "beignet", pos: [-45, 1.0, 250] },  // Croissant d'Or
  { kind: "beignet", pos: [-120, 1.0, -54] }, // outside Preservation Hall
  { kind: "beignet", pos: [-80, 1.0, 318] },  // Verti Marte (24h, of course)
  { kind: "beignet", pos: [-140, 1.0, 109] }, // Clover Grill
  { kind: "fishbowl", pos: [-149, 1.0, -10] },  // Tropical Isle counter
  { kind: "fishbowl", pos: [-117, 1.0, -72] },  // Pat O'Brien's courtyard
  { kind: "fishbowl", pos: [-141, 1.0, -340] }, // Old Absinthe House, pre-finale
];

export interface CoinTrail {
  from: [number, number, number];
  to: [number, number, number];
  count: number;
}

/**
 * Hand-placed trails for special routes. The long street trails are
 * generated at runtime from the real street centerlines (quarter.ts).
 */
export const COIN_TRAILS: CoinTrail[] = [
  // Pirate's Alley (toward the boss)
  { from: [-8, 0.6, -23], to: [-38, 0.6, -24], count: 10 },
  // Jackson Square plaza loop
  { from: [12, 0.6, -40], to: [12, 0.6, 22], count: 10 },
  // the Moonwalk
  { from: [128, 0.6, -40], to: [130, 0.6, 40], count: 10 },
  // floating in the Mississippi (swim reward)
  { from: [152, -0.5, -20], to: [162, -0.5, 16], count: 12 },
  // balcony runs
  { from: [-88, 5.0, -110], to: [-88, 5.0, -70], count: 10 }, // Royal, piece 6 run
  { from: [12, 5.0, -50.4], to: [52, 5.0, -50.4], count: 8 }, // Pontalba gallery
  { from: [-141, 5.0, 84], to: [-141, 5.0, 102], count: 6 },  // Clover approach
  // French Market arcade
  { from: [80, 0.6, 180], to: [92, 0.6, 220], count: 10 },
];

export const SECRETS = {
  pereAntoine: { pos: [-40, 0.6, -4] as [number, number, number], coins: 25 },
  pontalbaGallery: { pos: [62, 5.0, -50.4] as [number, number, number], coins: 30 },
  riverSwim: { pos: [160, -0.5, -34] as [number, number, number], coins: 25 },
  cabrini: { pos: [-250, 0.6, 362] as [number, number, number], coins: 30 },
};

/** Enterable interiors — geometry carved by quarter.ts from real footprints. */
export interface InteriorDef {
  key: string;          // landmark key in quarter.json
  label: string;
  opens: number;        // game hour the door unlocks (-1: always; 99: scripted)
  theme: "cafe" | "bar" | "voodoo" | "jazz" | "antiques" | "club" | "cottage";
}

export const INTERIORS: InteriorDef[] = [
  { key: "cafe_du_monde", label: "Café du Monde", opens: -1, theme: "cafe" },
  { key: "lafittes_blacksmith", label: "Lafitte's Blacksmith Shop", opens: -1, theme: "cottage" },
  { key: "voodoo_shop", label: "Marie Laveau's House of Voodoo", opens: 10, theme: "voodoo" },
  { key: "old_absinthe_house", label: "Old Absinthe House", opens: 11, theme: "bar" },
  { key: "preservation_hall", label: "Preservation Hall", opens: 17, theme: "jazz" },
  { key: "ms_rau", label: "M.S. Rau Antiques", opens: 99, theme: "antiques" },
  { key: "lipstixx", label: "Lipstixx", opens: 19, theme: "club" },
];

/** Crate stacks / props that open climbing routes to pieces & balconies. */
export const CLIMB_SPOTS: Array<{ pos: [number, number, number]; kind: "crates" | "dumpster" | "van" }> = [
  { pos: [-141, 0, 92], kind: "crates" },   // piece 4: Clover Grill balcony route
  { pos: [24, 0, -52], kind: "van" },        // piece 5: Pontalba gallery route
  { pos: [-86, 0, -110], kind: "crates" },   // piece 6: Royal balcony run start
  { pos: [-68, 0, -78], kind: "dumpster" },  // piece 8: M.S. Rau roof route
  { pos: [-150, 0, 154], kind: "crates" },   // spawn block: teach climbing
  { pos: [-148, 0, -310], kind: "dumpster" },// Lipstixx block balconies
];

export const ZONES = {
  /** the gutter in front of Lafitte's Blacksmith Shop, Bourbon & St. Philip */
  spawn: [-150.5, 1.4, 160] as [number, number, number],
  bossArena: { center: [-41, 0, -27] as [number, number, number], size: [16, 12] as [number, number] },
  lipstixxDoor: [-162, 1, -340] as [number, number, number],
  assemblySpot: [-157, 0.05, -335] as [number, number, number],
  jacksonStage: [14, 0, -9] as [number, number, number],
  cafeDuMonde: [86, 0, 36] as [number, number, number],
};

/** KO / kill-plane respawn anchors (nearest is used). */
export const RESPAWNS: [number, number, number][] = [
  [-150.5, 1.4, 160],   // Lafitte's (spawn)
  [-147, 1.4, 28],      // Bourbon & St. Ann
  [-147, 1.4, -123],    // Bourbon & Toulouse
  [-147, 1.4, -265],    // Bourbon & Conti
  [-147, 1.4, -336],    // Lipstixx block
  [14, 1.4, -9],        // Jackson Square
  [76, 1.4, 150],       // French Market
  [120, 1.4, 0],        // the Moonwalk
];
