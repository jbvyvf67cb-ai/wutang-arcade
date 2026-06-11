/**
 * Bourbon Street build map — coordinates from PLAN.md §7.
 * Street runs along +Z. Roadway 12m wide (x in [-6,6]),
 * sidewalks 4m each side (x in [-10,-6] and [6,10]).
 * Building line beyond |x| = 10. Balcony level at y = 4.5.
 */

export const STREET = {
  length: 240,
  roadHalfWidth: 6,
  sidewalkWidth: 4,
  balconyY: 4.5,
  buildingDepth: 10,
};

export interface BoxDef {
  name: string;
  pos: [number, number, number];
  size: [number, number, number];
  kind:
    | "building"
    | "balcony"
    | "crate"
    | "platform"
    | "vehicle"
    | "barrier"
    | "sign"
    | "prop";
  /** rotation around Y in radians */
  rotY?: number;
  dynamic?: boolean;
}

export interface PieceDef {
  id: number;
  name: string;
  pos: [number, number, number];
  /** crop rect of assets/collage/collage.png in UV space [u0,v0,u1,v1] */
  crop: [number, number, number, number];
}

// Collage crops (collage.png is 1086x1448; UVs top-left origin)
export const PIECES: PieceDef[] = [
  { id: 1, name: "REALITY", pos: [7.5, 1.1, 30], crop: [0.05, 0.02, 0.97, 0.16] },
  { id: 2, name: "IS MERELY", pos: [0, 4.0, 78], crop: [0.08, 0.17, 0.85, 0.28] },
  { id: 3, name: "ANOTHER KIND OF", pos: [-7.5, 1.0, 110], crop: [0.05, 0.3, 0.72, 0.44] },
  { id: 4, name: "WONDER.", pos: [8.5, 7.2, 164], crop: [0.3, 0.56, 0.95, 0.7] },
  { id: 5, name: "Crow & Hat Man", pos: [8.0, 5.3, 55], crop: [0.0, 0.33, 0.33, 0.78] },
  { id: 6, name: "Flowers & Songbird", pos: [-8.0, 4.9, 138], crop: [0.08, 0.5, 0.42, 0.85] },
  { id: 7, name: "Pin-up Lady", pos: [-34, 0.8, 148], crop: [0.55, 0.28, 1.0, 0.62] },
  { id: 8, name: "Goldfish Bowl", pos: [-8.5, 1.2, 218], crop: [0.42, 0.6, 1.0, 0.95] },
];

export interface EnemySpawn {
  kind: "frat" | "pirate" | "huntress";
  pos: [number, number, number];
  patrol?: [number, number, number][];
  group?: string;
}

export const ENEMIES: EnemySpawn[] = [
  // Block 1 — gentle intro pack
  { kind: "frat", pos: [3, 1, 40], group: "b1" },
  { kind: "frat", pos: [-2, 1, 44], group: "b1" },
  // Intersection A — pirate intro
  {
    kind: "pirate",
    pos: [0, 1, 76],
    patrol: [
      [-8, 1, 76],
      [8, 1, 80],
    ],
  },
  // Block 2 — the gauntlet
  { kind: "frat", pos: [-6, 1, 108], group: "daiquiri" },
  { kind: "frat", pos: [-8, 1, 112], group: "daiquiri" },
  { kind: "frat", pos: [-4, 1, 114], group: "daiquiri" },
  { kind: "frat", pos: [5, 1, 126], group: "b2b" },
  { kind: "frat", pos: [7, 1, 130], group: "b2b" },
  {
    kind: "pirate",
    pos: [0, 1, 100],
    patrol: [
      [-6, 1, 96],
      [6, 1, 104],
    ],
  },
  {
    kind: "pirate",
    pos: [0, 1, 140],
    patrol: [
      [-7, 1, 136],
      [5, 1, 148],
    ],
  },
  // The Alley — boss
  { kind: "huntress", pos: [-34, 1, 150] },
  // Intersection B — mixed group
  {
    kind: "pirate",
    pos: [2, 1, 164],
    patrol: [
      [-6, 1, 160],
      [6, 1, 168],
    ],
  },
  { kind: "frat", pos: [-3, 1, 162], group: "ib" },
  { kind: "frat", pos: [4, 1, 166], group: "ib" },
];

// Final wave spawned at 8/8 pieces (Block 3)
export const LAST_CALL: EnemySpawn[] = [
  { kind: "frat", pos: [-4, 1, 200], group: "last" },
  { kind: "frat", pos: [0, 1, 198], group: "last" },
  { kind: "frat", pos: [4, 1, 200], group: "last" },
  { kind: "frat", pos: [0, 1, 206], group: "last" },
  {
    kind: "pirate",
    pos: [0, 1, 212],
    patrol: [
      [-5, 1, 210],
      [5, 1, 214],
    ],
  },
];

export interface ItemSpawn {
  kind: "beignet" | "fishbowl";
  pos: [number, number, number];
}

export const ITEMS: ItemSpawn[] = [
  { kind: "beignet", pos: [7.5, 1.0, 26] }, // café counter
  { kind: "fishbowl", pos: [-7.5, 1.0, 120] }, // daiquiri bar counter
  { kind: "beignet", pos: [7, 5.3, 124] }, // secret 2 room
  { kind: "fishbowl", pos: [7.5, 5.3, 126] }, // secret 2 room
  { kind: "beignet", pos: [-30, 0.6, 142] }, // alley, pre-boss
  { kind: "beignet", pos: [7.5, 1.0, 190] }, // block 3 pick-me-up
];

/** Coin trail descriptors: line segments with count. */
export interface CoinTrail {
  from: [number, number, number];
  to: [number, number, number];
  count: number;
}

export const COIN_TRAILS: CoinTrail[] = [
  // Block 1 (~60)
  { from: [7.5, 0.6, 12], to: [7.5, 0.6, 50], count: 14 },
  { from: [-7.5, 0.6, 16], to: [-7.5, 0.6, 56], count: 14 },
  { from: [0, 0.6, 20], to: [0, 0.6, 60], count: 12 },
  { from: [7.5, 5.0, 50], to: [7.5, 5.0, 60], count: 8 }, // balcony route to piece 5
  { from: [3, 0.6, 62], to: [-3, 0.6, 68], count: 12 },
  // Intersection A + truck
  { from: [-4, 2.2, 78], to: [2, 3.6, 78], count: 6 },
  // Block 2 (~90)
  { from: [7.5, 0.6, 90], to: [7.5, 0.6, 150], count: 18 },
  { from: [-7.5, 0.6, 90], to: [-7.5, 0.6, 150], count: 18 },
  { from: [0, 0.6, 92], to: [0, 0.6, 152], count: 16 },
  { from: [-8, 4.9, 128], to: [-8, 4.9, 146], count: 10 }, // balcony plank run
  { from: [4, 0.6, 96], to: [-4, 0.6, 116], count: 14 },
  { from: [-4, 0.6, 120], to: [4, 0.6, 148], count: 14 },
  // Alley (~30, some floating in water)
  { from: [-14, 0.6, 142], to: [-26, 0.6, 146], count: 10 },
  { from: [-26, 0.45, 146], to: [-32, 0.45, 148], count: 10 }, // floating in flood
  { from: [-34, 0.6, 152], to: [-38, 0.6, 154], count: 10 },
  // Intersection B
  { from: [-4, 0.6, 160], to: [4, 0.6, 170], count: 10 },
  { from: [6, 3.2, 164], to: [8, 6.0, 164], count: 6 }, // pedicab->awning->sign
  // Block 3 (~70)
  { from: [7.5, 0.6, 176], to: [7.5, 0.6, 230], count: 18 },
  { from: [-7.5, 0.6, 176], to: [-7.5, 0.6, 230], count: 18 },
  { from: [0, 0.6, 180], to: [0, 0.6, 232], count: 16 },
  { from: [-8.5, 0.6, 210], to: [-8.5, 0.6, 222], count: 8 },
];

export const SECRETS = {
  dumpsterAlcove: { pos: [9.5, 0.6, 36] as [number, number, number], coins: 25 },
  shutterRoom: { pos: [8.5, 5.0, 125] as [number, number, number], coins: 40 },
  rooftop: { pos: [-9, 9.5, 196] as [number, number, number], coins: 25 },
};

export const ZONES = {
  spawn: [7.5, 1.2, 8] as [number, number, number],
  water: { min: [-32, -1.2, 140] as [number, number, number], max: [-20, 0.55, 152] as [number, number, number] },
  alleyEntrance: [-12, 1, 142] as [number, number, number],
  bossArena: { center: [-34, 0, 150] as [number, number, number], size: [14, 10] as [number, number] },
  lipstixx: [9, 1, 225] as [number, number, number],
  assemblySpot: [6.5, 0.05, 222] as [number, number, number],
  travelAgency: [9, 1, 234] as [number, number, number],
};

export const TICKET_PRICE = 500;
