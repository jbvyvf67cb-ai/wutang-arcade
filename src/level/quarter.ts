/**
 * Real French Quarter renderer. Consumes assets/map/quarter.json
 * (precomputed from OSM by tools/map/build_map.py — footprints already
 * triangulated; no runtime triangulation here).
 *
 * Geometry is merged into 150 m chunks per material kind and distance-culled.
 * Physics: one static MESH aggregate per chunk (simple extrusions + balcony
 * decks), a land mesh that ends at the river, and a riverbed slab.
 */
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics/v2";
import { WATER, INTERIORS, InteriorDef, CLIMB_SPOTS, BALCONY_Y } from "./layout";

// ---------------------------------------------------------------- types ----
export interface QuarterData {
  meta: { bounds: [number, number, number, number]; attribution: string };
  buildings: Array<{
    id: number; pts: number[]; tri: number[]; lv: number;
    name: string | null; c: [number, number]; f?: [number, string, number];
  }>;
  streets: Array<{ name: string; cls: string; w: number; pts: number[] }>;
  intersections: Array<{ p: [number, number]; names: string[] }>;
  pois: Array<{ n: string; p: [number, number]; c: string }>;
  parks: Array<{ name: string | null; pts: number[]; tri: number[] }>;
  river: { pts: number[]; tri: number[] };
  land: { pts: number[]; tri: number[] };
  trams: number[][];
  shoreline: number[];
  landmarks: Array<{ key: string; p: [number, number]; bld: number | null; cat: string; src: string }>;
}

export interface Interior {
  def: InteriorDef;
  door: Mesh | null;
  doorAgg: PhysicsAggregate | null;
  insidePos: Vector3;
  doorPos: Vector3;
  isOpen: boolean;
  open: () => void;
}

export interface Interactable {
  pos: Vector3;
  r: number;
  cooldown: number;
  lastFired: number;
  fire: () => void;
}

export interface QuarterResult {
  root: TransformNode;
  data: QuarterData;
  dynamicProps: Mesh[];
  waterMesh: Mesh;
  interiors: Interior[];
  interactables: Interactable[];
  /** placed landmark world positions, for the rubric gate */
  landmarkMarkers: Array<{ key: string; x: number; z: number }>;
  /** coins generated along real street centerlines */
  streetCoins: Vector3[];
  tramLine: Vector3[];
  /** per-frame chunk culling */
  updateCulling: (p: Vector3) => void;
  /** night switch for lamps/neon (driven by time-of-day) */
  setNight: (n: number) => void;
}

// hero landmark tints (multiply the facade atlas) + height overrides
const HERO_STYLE: Record<string, { tint: [number, number, number]; h?: number }> = {
  stlouis_cathedral: { tint: [1, 1, 1], h: 14 },
  cabildo: { tint: [0.93, 0.93, 0.96], h: 12 },
  presbytere: { tint: [0.93, 0.93, 0.96], h: 12 },
  pontalba_upper: { tint: [0.82, 0.5, 0.42], h: 13.6 },
  pontalba_lower: { tint: [0.82, 0.5, 0.42], h: 13.6 },
  jax_brewery: { tint: [1, 0.92, 0.72], h: 16 },
  hotel_monteleone: { tint: [1, 1, 1], h: 38 },
  preservation_hall: { tint: [0.72, 0.68, 0.6] },
  voodoo_shop: { tint: [0.42, 0.38, 0.4] },
  napoleon_house: { tint: [1, 0.85, 0.5], h: 11 },
  cornstalk_hotel: { tint: [1, 0.95, 0.62] },
  lalaurie_mansion: { tint: [0.78, 0.78, 0.8], h: 11 },
  us_mint: { tint: [0.82, 0.5, 0.4], h: 12 },
  ursuline_convent: { tint: [1, 1, 0.95], h: 10 },
  lafittes_blacksmith: { tint: [0.85, 0.83, 0.78], h: 5 },
  ms_rau: { tint: [0.9, 0.9, 0.92], h: 7.2 },
  clover_grill: { tint: [1, 1, 1], h: 6 },
  cats_meow: { tint: [0.55, 0.85, 0.8] },
  tropical_isle: { tint: [0.65, 0.88, 0.65] },
  erin_rose: { tint: [0.55, 0.8, 0.55] },
  central_grocery: { tint: [1, 1, 0.96] },
  old_absinthe_house: { tint: [0.95, 0.9, 0.75] },
  galatoires: { tint: [1, 1, 1] },
  antoines: { tint: [1, 0.98, 0.92] },
  lipstixx: { tint: [0.35, 0.22, 0.3] },
  travel_agency: { tint: [0.9, 0.92, 1] },
  beauregard_keyes: { tint: [1, 0.97, 0.85] },
  madame_johns: { tint: [0.78, 0.7, 0.58], h: 7 },
};

const QUARTER_TINTS: [number, number, number][] = [
  [1, 1, 1], [1, 0.95, 0.8], [1, 0.82, 0.76], [0.98, 0.86, 0.6],
  [0.85, 0.95, 0.8], [0.8, 0.88, 0.95], [0.95, 0.72, 0.62], [0.93, 0.88, 0.8],
  [1, 0.9, 0.66], [0.86, 0.8, 0.74], [0.97, 0.78, 0.8], [0.88, 0.92, 0.86],
];

const CHUNK = 150;
const CULL_R = 290;
const SIGN_CULL_R = 210;
const BALCONY_STREETS = new Set([
  "Bourbon Street", "Royal Street", "Chartres Street", "Decatur Street",
  "Saint Peter Street", "Saint Ann Street", "Toulouse Street", "Dumaine Street",
]);
const NO_BALCONY = new Set([
  "stlouis_cathedral", "cabildo", "presbytere", "ursuline_convent", "us_mint",
  "cafe_du_monde", "lafittes_blacksmith",
]);

// ------------------------------------------------------------- buffers ----
class Buf {
  pos: number[] = [];
  idx: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  col: number[] = [];

  quad(
    a: Vector3, b: Vector3, c: Vector3, d: Vector3,
    n: Vector3, uvs: [number, number, number, number],
    tint: [number, number, number],
  ) {
    const base = this.pos.length / 3;
    for (const p of [a, b, c, d]) this.pos.push(p.x, p.y, p.z);
    for (let i = 0; i < 4; i++) {
      this.nrm.push(n.x, n.y, n.z);
      this.col.push(tint[0], tint[1], tint[2], 1);
    }
    const [u0, v0, u1, v1] = uvs;
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  tri(a: Vector3, b: Vector3, c: Vector3, n: Vector3, uv: [number, number], tint: [number, number, number]) {
    const base = this.pos.length / 3;
    for (const p of [a, b, c]) {
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(n.x, n.y, n.z);
      this.col.push(tint[0], tint[1], tint[2], 1);
      this.uv.push(uv[0], uv[1]);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  box(center: Vector3, size: [number, number, number], rotY: number, uv: [number, number], tint: [number, number, number]) {
    const [sx, sy, sz] = [size[0] / 2, size[1] / 2, size[2] / 2];
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const R = (x: number, z: number) => new Vector3(center.x + x * cos + z * sin, 0, center.z - x * sin + z * cos);
    const corners = [R(-sx, -sz), R(sx, -sz), R(sx, sz), R(-sx, sz)];
    const lo = center.y - sy, hi = center.y + sy;
    for (let i = 0; i < 4; i++) {
      const p0 = corners[i], p1 = corners[(i + 1) % 4];
      const n = new Vector3(p1.z - p0.z, 0, -(p1.x - p0.x)).normalize();
      this.quad(
        new Vector3(p0.x, lo, p0.z), new Vector3(p1.x, lo, p1.z),
        new Vector3(p1.x, hi, p1.z), new Vector3(p0.x, hi, p0.z),
        n, [uv[0], uv[1], uv[0] + 0.01, uv[1] + 0.01], tint,
      );
    }
    // top + bottom
    this.quad(
      new Vector3(corners[0].x, hi, corners[0].z), new Vector3(corners[1].x, hi, corners[1].z),
      new Vector3(corners[2].x, hi, corners[2].z), new Vector3(corners[3].x, hi, corners[3].z),
      Vector3.Up(), [uv[0], uv[1], uv[0] + 0.01, uv[1] + 0.01], tint,
    );
    this.quad(
      new Vector3(corners[3].x, lo, corners[3].z), new Vector3(corners[2].x, lo, corners[2].z),
      new Vector3(corners[1].x, lo, corners[1].z), new Vector3(corners[0].x, lo, corners[0].z),
      Vector3.Down(), [uv[0], uv[1], uv[0] + 0.01, uv[1] + 0.01], tint,
    );
  }

  toMesh(name: string, scene: Scene, mat: PBRMaterial | StandardMaterial, withColors = true): Mesh | null {
    if (this.idx.length === 0) return null;
    const m = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = this.pos;
    vd.indices = this.idx;
    vd.normals = this.nrm;
    vd.uvs = this.uv;
    if (withColors) vd.colors = this.col;
    vd.applyToMesh(m);
    m.material = mat;
    m.receiveShadows = true;
    return m;
  }
}

// facade atlas helpers (4×3 tiles)
function tileUV(i: number): [number, number, number, number] {
  const col = i % 4;
  const row = Math.floor(i / 4) % 3;
  return [col / 4, 1 - (row + 1) / 3, (col + 1) / 4, 1 - row / 3];
}
function plainUV(i: number): [number, number] {
  const t = tileUV(i);
  return [t[0] + 0.012, t[1] + 0.06];
}

// ---------------------------------------------------------------- main ----
export async function buildQuarter(scene: Scene): Promise<QuarterResult> {
  const data: QuarterData = await (await fetch("./map/quarter.json")).json();
  const root = new TransformNode("quarter", scene);

  // ---- materials ----
  const mkPbr = (name: string, c: Color3, rough = 0.9, tex?: string) => {
    const m = new PBRMaterial(name, scene);
    m.albedoColor = c;
    m.roughness = rough;
    m.metallic = 0;
    if (tex) m.albedoTexture = new Texture(`./textures/${tex}`, scene);
    return m;
  };
  const matFacade = mkPbr("q_facade", new Color3(1, 1, 1), 0.92, "facades.png");
  // plain stucco for side/back walls + roofs: vertex tint only, no atlas bleed
  const matWall = mkPbr("q_wall", new Color3(0.82, 0.78, 0.72), 0.95);
  const matRoad = mkPbr("q_road", new Color3(0.9, 0.9, 0.95), 0.5, "road.png");
  (matRoad.albedoTexture as Texture).uScale = 1;
  (matRoad.albedoTexture as Texture).vScale = 1;
  const matGround = mkPbr("q_ground", new Color3(0.95, 0.93, 0.9), 0.9, "sidewalk.png");
  const matIron = mkPbr("q_iron", new Color3(0.09, 0.09, 0.11), 0.45);
  const matPark = mkPbr("q_park", new Color3(0.17, 0.3, 0.14), 0.95);
  const matWood = mkPbr("q_wood", new Color3(0.45, 0.32, 0.2), 0.8);
  const matProp = mkPbr("q_prop", new Color3(0.35, 0.38, 0.35), 0.7);

  // ---- chunk buffer registry ----
  const chunks = new Map<string, Record<string, Buf>>();
  const chunkOf = (x: number, z: number) =>
    `${Math.floor((x + 2000) / CHUNK)}_${Math.floor((z + 2000) / CHUNK)}`;
  const buf = (x: number, z: number, kind: string): Buf => {
    const key = chunkOf(x, z);
    let rec = chunks.get(key);
    if (!rec) {
      rec = {};
      chunks.set(key, rec);
    }
    return (rec[kind] ??= new Buf());
  };

  // ---- landmark/interior lookups ----
  const lmByBld = new Map<number, string>();
  const lmByKey = new Map<string, (typeof data.landmarks)[0]>();
  for (const lm of data.landmarks) {
    lmByKey.set(lm.key, lm);
    if (lm.bld !== null && !lmByBld.has(lm.bld)) lmByBld.set(lm.bld, lm.key);
  }
  const interiorBlds = new Set<number>();
  const pointInPoly = (x: number, z: number, pts: number[]): boolean => {
    let inside = false;
    const n = pts.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[2 * i], zi = pts[2 * i + 1];
      const xj = pts[2 * j], zj = pts[2 * j + 1];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  for (const idef of INTERIORS) {
    const lm = lmByKey.get(idef.key);
    if (lm?.bld == null) continue;
    interiorBlds.add(lm.bld);
    // OSM often stacks overlapping footprints; drop any building whose
    // centroid sits inside this interior's footprint so the shell is hollow
    const host = data.buildings[lm.bld];
    for (let bi = 0; bi < data.buildings.length; bi++) {
      if (bi === lm.bld) continue;
      const c = data.buildings[bi].c;
      if (Math.hypot(c[0] - host.c[0], c[1] - host.c[1]) < 40 && pointInPoly(c[0], c[1], host.pts)) {
        interiorBlds.add(bi);
      }
    }
  }

  // ---- buildings -> chunked walls/roofs + physics + balconies ----
  const heroH = (key: string | undefined, lv: number): number => {
    if (key && HERO_STYLE[key]?.h) return HERO_STYLE[key].h!;
    return lv * 3.4 + 0.6;
  };

  // the Pontalbas front a side alley by the heuristic — force their famous
  // square-facing long edges to count as fronts (facade detail + galleries)
  const extraFronts = new Map<number, number>();
  for (const pk of ["pontalba_upper", "pontalba_lower"]) {
    const lm = lmByKey.get(pk);
    if (!lm || lm.bld == null) continue;
    const b = data.buildings[lm.bld];
    const n = b.pts.length / 2;
    let bestI = -1, bestScore = -Infinity;
    for (let i = 0; i < n; i++) {
      const x0 = b.pts[2 * i], z0 = b.pts[2 * i + 1];
      const x1 = b.pts[(2 * i + 2) % (2 * n)], z1 = b.pts[(2 * i + 3) % (2 * n)];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const d = Math.hypot((x0 + x1) / 2 - 33, (z0 + z1) / 2 + 9); // square center
      const score = len - d * 0.8;
      if (len > 12 && score > bestScore) {
        bestScore = score;
        bestI = i;
      }
    }
    if (bestI >= 0) extraFronts.set(lm.bld, bestI);
  }

  for (let bi = 0; bi < data.buildings.length; bi++) {
    if (interiorBlds.has(bi)) continue; // interiors get custom shells
    const b = data.buildings[bi];
    const key = lmByBld.get(bi);
    const tint: [number, number, number] = key && HERO_STYLE[key]
      ? HERO_STYLE[key].tint
      : QUARTER_TINTS[b.id % QUARTER_TINTS.length];
    const h = heroH(key, b.lv);
    const tile = b.id % 12;
    const plain = plainUV(tile);
    const n = b.pts.length / 2;
    const vis = buf(b.c[0], b.c[1], "facade");
    const phys = buf(b.c[0], b.c[1], "phys");
    const frontEdge = b.f ? b.f[0] : -1;
    const extraFront = extraFronts.get(bi) ?? -2;

    for (let i = 0; i < n; i++) {
      const x0 = b.pts[2 * i], z0 = b.pts[2 * i + 1];
      const x1 = b.pts[(2 * i + 2) % (2 * n)], z1 = b.pts[(2 * i + 3) % (2 * n)];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.2) continue;
      const out = new Vector3((z1 - z0) / len, 0, -(x1 - x0) / len);
      const A = new Vector3(x0, 0, z0), B = new Vector3(x1, 0, z1);
      const C = new Vector3(x1, h, z1), D = new Vector3(x0, h, z0);
      phys.quad(A, B, C, D, out, [0, 0, 1, 1], tint);
      if ((i === frontEdge || i === extraFront) && len > 3) {
        // storefront facade: subdivide into atlas-tile cells
        const cols = Math.max(1, Math.min(8, Math.round(len / 3.8)));
        const rows = Math.max(1, Math.min(4, Math.round(h / 3.6)));
        const t = tileUV(tile);
        for (let cx = 0; cx < cols; cx++) {
          for (let cy = 0; cy < rows; cy++) {
            const fa = Vector3.Lerp(A, B, cx / cols);
            const fb = Vector3.Lerp(A, B, (cx + 1) / cols);
            const y0 = (h * cy) / rows, y1 = (h * (cy + 1)) / rows;
            vis.quad(
              new Vector3(fa.x, y0, fa.z), new Vector3(fb.x, y0, fb.z),
              new Vector3(fb.x, y1, fb.z), new Vector3(fa.x, y1, fa.z),
              out, [t[0] + 0.01, t[1] + 0.01, t[2] - 0.01, t[3] - 0.01], tint,
            );
          }
        }
      } else {
        buf(b.c[0], b.c[1], "wall").quad(A, B, C, D, out, [0, 0, 1, 1], tint);
      }
    }
    // roof cap
    const roofTint: [number, number, number] = [tint[0] * 0.5, tint[1] * 0.45, tint[2] * 0.45];
    const wallBuf = buf(b.c[0], b.c[1], "wall");
    for (let t = 0; t < b.tri.length; t += 3) {
      const ia = b.tri[t], ib = b.tri[t + 1], ic = b.tri[t + 2];
      const pa = new Vector3(b.pts[2 * ia], h, b.pts[2 * ia + 1]);
      const pb = new Vector3(b.pts[2 * ib], h, b.pts[2 * ib + 1]);
      const pc = new Vector3(b.pts[2 * ic], h, b.pts[2 * ic + 1]);
      wallBuf.tri(pa, pb, pc, Vector3.Up(), plain, roofTint);
      phys.tri(pa, pb, pc, Vector3.Up(), plain, roofTint);
    }

  }

  // ---- balconies: iron galleries over the sidewalks of the gallery streets ----
  const addGallery = (b: QuarterData["buildings"][0], i: number) => {
    const n = b.pts.length / 2;
    const x0 = b.pts[2 * i], z0 = b.pts[2 * i + 1];
    const x1 = b.pts[(2 * i + 2) % (2 * n)], z1 = b.pts[(2 * i + 3) % (2 * n)];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 4) return;
    const out = new Vector3((z1 - z0) / len, 0, -(x1 - x0) / len);
    const rotY = Math.atan2(x1 - x0, z1 - z0);
    const mid = new Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const depth = 2.4;
    const dc = mid.add(out.scale(depth / 2 + 0.05));
    const ironBuf = buf(b.c[0], b.c[1], "iron");
    const physBuf = buf(b.c[0], b.c[1], "phys");
    const iuv: [number, number] = [0.5, 0.5];
    const itint: [number, number, number] = [1, 1, 1];
    const deckLen = len - 0.6;
    // deck slab (walkable)
    ironBuf.box(new Vector3(dc.x, BALCONY_Y, dc.z), [depth, 0.16, deckLen], rotY, iuv, itint);
    physBuf.box(new Vector3(dc.x, BALCONY_Y, dc.z), [depth, 0.16, deckLen], rotY, iuv, itint);
    // outer railing (low — jumpable) + physics so it can be stood on
    const railC = mid.add(out.scale(depth - 0.08));
    ironBuf.box(new Vector3(railC.x, BALCONY_Y + 0.55, railC.z), [0.07, 0.95, deckLen], rotY, iuv, itint);
    physBuf.box(new Vector3(railC.x, BALCONY_Y + 0.55, railC.z), [0.07, 0.95, deckLen], rotY, iuv, itint);
    // support posts at the curb
    const posts = Math.max(2, Math.round(deckLen / 4));
    for (let p = 0; p < posts; p++) {
      const t = posts === 1 ? 0.5 : p / (posts - 1);
      const pp = Vector3.Lerp(
        mid.add(out.scale(depth - 0.1)).subtract(new Vector3(Math.sin(rotY), 0, Math.cos(rotY)).scale(deckLen / 2 - 0.3)),
        mid.add(out.scale(depth - 0.1)).add(new Vector3(Math.sin(rotY), 0, Math.cos(rotY)).scale(deckLen / 2 - 0.3)),
        t,
      );
      ironBuf.box(new Vector3(pp.x, BALCONY_Y / 2, pp.z), [0.09, BALCONY_Y, 0.09], rotY, iuv, itint);
    }
  };
  for (let bi = 0; bi < data.buildings.length; bi++) {
    const b = data.buildings[bi];
    const key = lmByBld.get(bi);
    const h = heroH(key, b.lv);
    if (
      !b.f || !BALCONY_STREETS.has(b.f[1]) || b.f[2] >= 16 || b.lv < 2 ||
      h <= BALCONY_Y + 1.5 || (key && NO_BALCONY.has(key))
    ) continue;
    addGallery(b, b.f[0]);
  }
  // the Pontalbas' forced square-facing galleries
  for (const [bi, edgeI] of extraFronts) {
    addGallery(data.buildings[bi], edgeI);
  }

  // ---- streets: textured ribbons ----
  for (const st of data.streets) {
    const isRoad = !["footway", "steps", "path", "cycleway", "pedestrian"].includes(st.cls);
    const w = st.w;
    const y = isRoad ? 0.045 : 0.06;
    const tint: [number, number, number] = isRoad ? [1, 1, 1] : [0.62, 0.6, 0.62];
    for (let i = 0; i + 3 < st.pts.length; i += 2) {
      const x0 = st.pts[i], z0 = st.pts[i + 1], x1 = st.pts[i + 2], z1 = st.pts[i + 3];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.5) continue;
      const px = ((z1 - z0) / len) * (w / 2);
      const pz = (-(x1 - x0) / len) * (w / 2);
      const bRoad = buf((x0 + x1) / 2, (z0 + z1) / 2, "road");
      bRoad.quad(
        new Vector3(x0 - px, y, z0 - pz), new Vector3(x0 + px, y, z0 + pz),
        new Vector3(x1 + px, y, z1 + pz), new Vector3(x1 - px, y, z1 - pz),
        Vector3.Up(), [0, 0, 1, len / 8], tint,
      );
    }
  }

  // ---- parks ----
  for (const pk of data.parks) {
    for (let t = 0; t < pk.tri.length; t += 3) {
      const g = (j: number) => new Vector3(pk.pts[2 * pk.tri[t + j]], 0.07, pk.pts[2 * pk.tri[t + j] + 1]);
      buf(pk.pts[0], pk.pts[1], "park").tri(g(0), g(1), g(2), Vector3.Up(), [0.5, 0.5], [1, 1, 1]);
    }
  }

  // (chunk meshes are realized at the end, after signs/blades fill buffers)

  // ---- ground: land mesh (ends at the river) + physics ----
  {
    const L = data.land;
    const g = new Buf();
    for (let t = 0; t < L.tri.length; t += 3) {
      const v = (j: number) => new Vector3(L.pts[2 * L.tri[t + j]], 0, L.pts[2 * L.tri[t + j] + 1]);
      g.tri(v(0), v(1), v(2), Vector3.Up(), [0.5, 0.5], [1, 1, 1]);
    }
    // tile the sidewalk texture by world position
    for (let i = 0; i < g.pos.length; i += 3) {
      g.uv[(i / 3) * 2] = g.pos[i] / 6;
      g.uv[(i / 3) * 2 + 1] = g.pos[i + 2] / 6;
    }
    const ground = g.toMesh("q_land", scene, matGround, false)!;
    ground.parent = root;
    new PhysicsAggregate(ground, PhysicsShapeType.MESH, { mass: 0, friction: 0.8, restitution: 0 }, scene);
  }

  // ---- the Mississippi ----
  const R = data.river;
  const wb = new Buf();
  for (let t = 0; t < R.tri.length; t += 3) {
    const v = (j: number) => new Vector3(R.pts[2 * R.tri[t + j]], WATER.surfaceY, R.pts[2 * R.tri[t + j] + 1]);
    wb.tri(v(0), v(1), v(2), Vector3.Up(), [0.5, 0.5], [1, 1, 1]);
  }
  const wmat = new StandardMaterial("q_water", scene);
  wmat.diffuseColor = new Color3(0.16, 0.25, 0.28);
  wmat.alpha = 0.82;
  wmat.specularColor = new Color3(0.7, 0.7, 0.6);
  wmat.specularPower = 110;
  const waterMesh = wb.toMesh("q_river", scene, wmat as never, false)!;
  waterMesh.parent = root;
  // riverbed slab so swimmers never sink forever
  const bed = MeshBuilder.CreateBox("q_riverbed", { width: 600, height: 1, depth: data.meta.bounds[3] - data.meta.bounds[1] + 40 }, scene);
  bed.position = new Vector3(140 + 300, -3.6, (data.meta.bounds[1] + data.meta.bounds[3]) / 2);
  bed.isVisible = false;
  bed.parent = root;
  new PhysicsAggregate(bed, PhysicsShapeType.BOX, { mass: 0, friction: 0.4 }, scene);

  // water test from the shoreline (z -> shore x lookup)
  const shorePairs: Array<[number, number]> = [];
  for (let i = 0; i < data.shoreline.length; i += 2) shorePairs.push([data.shoreline[i + 1], data.shoreline[i]]);
  shorePairs.sort((a, b2) => a[0] - b2[0]);
  WATER.isIn = (x: number, z: number): boolean => {
    let lo = 0, hi = shorePairs.length - 1;
    if (z <= shorePairs[0][0]) return x > shorePairs[0][1];
    if (z >= shorePairs[hi][0]) return x > shorePairs[hi][1];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (shorePairs[m][0] <= z) lo = m;
      else hi = m;
    }
    const t = (z - shorePairs[lo][0]) / Math.max(0.001, shorePairs[hi][0] - shorePairs[lo][0]);
    const shoreX = shorePairs[lo][1] + t * (shorePairs[hi][1] - shorePairs[lo][1]);
    return x > shoreX;
  };

  // ---- containment at map bounds ----
  const [bx0, bz0, bx1, bz1] = data.meta.bounds;
  const wallDefs: Array<[number, number, number, number]> = [
    [(bx0 + bx1) / 2, bz0 - 2, bx1 - bx0 + 40, 4],
    [(bx0 + bx1) / 2, bz1 + 2, bx1 - bx0 + 40, 4],
    [bx0 - 2, (bz0 + bz1) / 2, 4, bz1 - bz0 + 40],
    [bx1 + 2, (bz0 + bz1) / 2, 4, bz1 - bz0 + 40],
  ];
  for (const [wx, wz, ww, wd] of wallDefs) {
    const w = MeshBuilder.CreateBox("q_contain", { width: ww, height: 60, depth: wd }, scene);
    w.position = new Vector3(wx, 25, wz);
    w.isVisible = false;
    w.parent = root;
    new PhysicsAggregate(w, PhysicsShapeType.BOX, { mass: 0 }, scene);
  }

  // ---- signage: shared DynamicTexture atlas with real names ----
  const SIGN_COLS = 4, SIGN_ROWS = 32, SIGN_W = 512, SIGN_H = 64;
  const signTex = new DynamicTexture("q_signs", { width: SIGN_COLS * SIGN_W, height: SIGN_ROWS * SIGN_H }, scene, true);
  const signCtx = signTex.getContext() as CanvasRenderingContext2D;
  signCtx.clearRect(0, 0, SIGN_COLS * SIGN_W, SIGN_ROWS * SIGN_H);
  const signMat = new StandardMaterial("q_signmat", scene);
  signMat.diffuseTexture = signTex;
  signMat.emissiveTexture = signTex;
  signMat.emissiveColor = new Color3(0.55, 0.55, 0.55);
  signMat.specularColor = Color3.Black();
  signMat.backFaceCulling = false;
  signTex.hasAlpha = true;
  signMat.useAlphaFromDiffuseTexture = true;
  let signCell = 0;
  const CAT_COLORS: Record<string, string> = {
    bar: "#ffd76e", pub: "#ffd76e", restaurant: "#f2ead8", cafe: "#bfe8b2",
    club: "#ff7ad9", hotel: "#cfd8ff", shop: "#ffffff", museum: "#e8e8e8",
    venue: "#ffc09e", cathedral: "#ffffff", market: "#cfe6a8", landmark: "#e8e8e8",
  };
  const drawSign = (text: string, color: string, style: "serif" | "script" | "block" = "serif"): number => {
    if (signCell >= SIGN_COLS * SIGN_ROWS) return -1;
    const cx = (signCell % SIGN_COLS) * SIGN_W;
    const cy = Math.floor(signCell / SIGN_COLS) * SIGN_H;
    signCtx.save();
    // panel
    signCtx.fillStyle = "rgba(18,14,12,0.92)";
    roundRect(signCtx, cx + 2, cy + 4, SIGN_W - 4, SIGN_H - 8, 8);
    signCtx.fill();
    signCtx.strokeStyle = color;
    signCtx.lineWidth = 2;
    roundRect(signCtx, cx + 5, cy + 7, SIGN_W - 10, SIGN_H - 14, 6);
    signCtx.stroke();
    const font = style === "script" ? "italic bold 34px Georgia" : style === "block" ? "bold 32px Verdana" : "bold 34px Georgia";
    signCtx.font = font;
    signCtx.textAlign = "center";
    signCtx.textBaseline = "middle";
    signCtx.fillStyle = color;
    let label = text.toUpperCase();
    while (signCtx.measureText(label).width > SIGN_W - 28 && label.length > 4) {
      label = label.slice(0, -2);
    }
    signCtx.fillText(label, cx + SIGN_W / 2, cy + SIGN_H / 2 + 1);
    signCtx.restore();
    return signCell++;
  };
  function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // signs/blades are merged into the chunk buffers (atlas UV per quad)
  const placeSign = (cell: number, pos: Vector3, rotY: number, width: number) => {
    if (cell < 0) return;
    const h = width * (SIGN_H / SIGN_W);
    const u0 = (cell % SIGN_COLS) / SIGN_COLS;
    const v0 = 1 - (Math.floor(cell / SIGN_COLS) + 1) / SIGN_ROWS;
    const right = new Vector3(Math.cos(rotY), 0, -Math.sin(rotY)).scale(width / 2);
    const fwd = new Vector3(Math.sin(rotY), 0, Math.cos(rotY));
    const a = pos.subtract(right).add(new Vector3(0, -h / 2, 0));
    const b2 = pos.add(right).add(new Vector3(0, -h / 2, 0));
    const c2 = pos.add(right).add(new Vector3(0, h / 2, 0));
    const d2 = pos.subtract(right).add(new Vector3(0, h / 2, 0));
    buf(pos.x, pos.z, "sign").quad(
      a, b2, c2, d2, fwd.scale(-1),
      [u0, v0, u0 + 1 / SIGN_COLS, v0 + 1 / SIGN_ROWS], [1, 1, 1],
    );
  };

  // building front anchor for a landmark/POI
  const frontAnchor = (bi: number | null, fallback: [number, number]): { pos: Vector3; rotY: number } => {
    if (bi != null) {
      const b = data.buildings[bi];
      if (b?.f) {
        const n = b.pts.length / 2;
        const i = b.f[0];
        const x0 = b.pts[2 * i], z0 = b.pts[2 * i + 1];
        const x1 = b.pts[(2 * i + 2) % (2 * n)], z1 = b.pts[(2 * i + 3) % (2 * n)];
        const len = Math.hypot(x1 - x0, z1 - z0);
        const out = new Vector3((z1 - z0) / len, 0, -(x1 - x0) / len);
        const mid = new Vector3((x0 + x1) / 2, 3.1, (z0 + z1) / 2).add(out.scale(0.25));
        // plane front (+Z local) must face along `out`
        return { pos: mid, rotY: Math.atan2(out.x, out.z) + Math.PI };
      }
      if (b) return { pos: new Vector3(b.c[0], 3.1, b.c[1]), rotY: 0 };
    }
    return { pos: new Vector3(fallback[0], 3.1, fallback[1]), rotY: 0 };
  };

  const landmarkMarkers: Array<{ key: string; x: number; z: number }> = [];
  const usedSignSpots: Array<[number, number]> = [];
  for (const lm of data.landmarks) {
    if (lm.cat === "park" || lm.key === "checkpoint_charlies") {
      landmarkMarkers.push({ key: lm.key, x: lm.p[0], z: lm.p[1] });
      continue;
    }
    const pretty = lm.key
      .replace(/_/g, " ")
      .replace("stlouis cathedral", "St. Louis Cathedral")
      .replace("ms rau", "M.S. Rau Antiques")
      .replace("us mint", "Old U.S. Mint")
      .replace("pat obriens", "Pat O'Brien's")
      .replace("lm", "");
    const label =
      lm.key === "lipstixx" ? "Lipstixx" :
      lm.key === "travel_agency" ? "FLIGHTS HOME · $500" :
      lm.key === "voodoo_shop" ? "Marie Laveau's House of Voodoo" :
      lm.key === "lafittes_blacksmith" ? "Lafitte's Blacksmith Shop" :
      lm.key === "cafe_du_monde" ? "Café du Monde" :
      lm.key === "old_absinthe_house" ? "Old Absinthe House" :
      lm.key === "hotel_monteleone" ? "Hotel Monteleone" :
      lm.key === "preservation_hall" ? "Preservation Hall" :
      lm.key === "cats_meow" ? "Cat's Meow" :
      lm.key === "court_two_sisters" ? "Court of Two Sisters" :
      lm.key === "lafitte_in_exile" ? "Café Lafitte in Exile" :
      lm.key === "mollys_market" ? "Molly's at the Market" :
      lm.key === "coops_place" ? "Coop's Place" :
      pretty.replace(/\b\w/g, (ch) => ch.toUpperCase());
    const color = lm.key === "lipstixx" ? "#ff7ad9" : lm.key === "travel_agency" ? "#9fe0ff" : CAT_COLORS[lm.cat] ?? "#ffffff";
    const cell = drawSign(label, color, lm.cat === "restaurant" ? "script" : lm.cat === "bar" ? "serif" : "block");
    const anchor = frontAnchor(lm.bld, lm.p);
    placeSign(cell, anchor.pos, anchor.rotY, Math.min(6.5, Math.max(2.6, label.length * 0.26)));
    usedSignSpots.push([anchor.pos.x, anchor.pos.z]);
    landmarkMarkers.push({ key: lm.key, x: anchor.pos.x, z: anchor.pos.z });
  }

  // POI shop signs (real businesses; capped, deduped near landmarks)
  const SIGN_CATS = new Set([
    "bar", "pub", "restaurant", "cafe", "fast_food", "nightclub", "hotel",
    "books", "gift", "clothes", "art", "antiques", "jewelry", "music",
    "bakery", "ice_cream", "gallery", "theatre", "supermarket", "convenience",
  ]);
  let poiSigns = 0;
  for (const poi of data.pois) {
    if (poiSigns >= 64 || !SIGN_CATS.has(poi.c)) continue;
    if (poi.p[0] > 130) continue; // not on the river
    if (usedSignSpots.some(([sx, sz]) => Math.hypot(sx - poi.p[0], sz - poi.p[1]) < 14)) continue;
    // nearest building with a front
    let best: { d: number; bi: number } | null = null;
    for (let bi = 0; bi < data.buildings.length; bi++) {
      const b = data.buildings[bi];
      if (!b.f) continue;
      const d = Math.hypot(b.c[0] - poi.p[0], b.c[1] - poi.p[1]);
      if (d < 18 && (!best || d < best.d)) best = { d, bi };
    }
    if (!best) continue;
    const color = CAT_COLORS[poi.c] ?? (["bar", "pub", "nightclub"].includes(poi.c) ? "#ffd76e" : "#ffffff");
    const cell = drawSign(poi.n, color, poi.c === "restaurant" ? "script" : "serif");
    if (cell < 0) break;
    const anchor = frontAnchor(best.bi, poi.p);
    placeSign(cell, anchor.pos, anchor.rotY, Math.min(5.5, Math.max(2.4, poi.n.length * 0.24)));
    usedSignSpots.push([anchor.pos.x, anchor.pos.z]);
    poiSigns++;
  }
  signTex.update();

  // ---- street name blades at real intersections ----
  const BLADE_W = 256, BLADE_H = 32, BLADE_ROWS = 32, BLADE_COLS = 4;
  const bladeTex = new DynamicTexture("q_blades", { width: BLADE_COLS * BLADE_W, height: BLADE_ROWS * BLADE_H }, scene, true);
  const bladeCtx = bladeTex.getContext() as CanvasRenderingContext2D;
  bladeTex.hasAlpha = true;
  const bladeMat = new StandardMaterial("q_blademat", scene);
  bladeMat.diffuseTexture = bladeTex;
  bladeMat.emissiveTexture = bladeTex;
  bladeMat.emissiveColor = new Color3(0.5, 0.5, 0.5);
  bladeMat.specularColor = Color3.Black();
  bladeMat.backFaceCulling = false;
  bladeMat.useAlphaFromDiffuseTexture = true;
  const bladeCells = new Map<string, number>();
  let bladeCell = 0;
  const bladeFor = (name: string): number => {
    if (bladeCells.has(name)) return bladeCells.get(name)!;
    if (bladeCell >= BLADE_COLS * BLADE_ROWS) return -1;
    const cx = (bladeCell % BLADE_COLS) * BLADE_W;
    const cy = Math.floor(bladeCell / BLADE_COLS) * BLADE_H;
    bladeCtx.fillStyle = "#1d5c38";
    bladeCtx.fillRect(cx + 1, cy + 3, BLADE_W - 2, BLADE_H - 6);
    bladeCtx.strokeStyle = "#e8e8e0";
    bladeCtx.strokeRect(cx + 2.5, cy + 4.5, BLADE_W - 5, BLADE_H - 9);
    bladeCtx.font = "bold 17px Verdana";
    bladeCtx.textAlign = "center";
    bladeCtx.textBaseline = "middle";
    bladeCtx.fillStyle = "#f4f2e8";
    let label = name.replace("Street", "St").replace("Avenue", "Ave").toUpperCase();
    while (bladeCtx.measureText(label).width > BLADE_W - 14 && label.length > 4) label = label.slice(0, -2);
    bladeCtx.fillText(label, cx + BLADE_W / 2, cy + BLADE_H / 2 + 1);
    bladeCells.set(name, bladeCell);
    return bladeCell++;
  };
  let bladesPlaced = 0;
  const bladeQuad = (cell: number, pos: Vector3, rotY: number) => {
    if (cell < 0) return;
    const w = 1.8, h = 0.24;
    const u0 = (cell % BLADE_COLS) / BLADE_COLS;
    const v0 = 1 - (Math.floor(cell / BLADE_COLS) + 1) / BLADE_ROWS;
    const right = new Vector3(Math.cos(rotY), 0, -Math.sin(rotY)).scale(w / 2);
    const a = pos.subtract(right).add(new Vector3(0, -h / 2, 0));
    const b2 = pos.add(right).add(new Vector3(0, -h / 2, 0));
    const c2 = pos.add(right).add(new Vector3(0, h / 2, 0));
    const d2 = pos.subtract(right).add(new Vector3(0, h / 2, 0));
    buf(pos.x, pos.z, "blade").quad(
      a, b2, c2, d2, new Vector3(Math.sin(rotY), 0, Math.cos(rotY)).scale(-1),
      [u0, v0, u0 + 1 / BLADE_COLS, v0 + 1 / BLADE_ROWS], [1, 1, 1],
    );
  };
  for (const ix of data.intersections) {
    if (bladesPlaced >= 90 || ix.names.length < 2) continue;
    if (ix.p[0] > 140) continue;
    const polePos = new Vector3(ix.p[0] + 3.2, 1.8, ix.p[1] + 3.2);
    buf(polePos.x, polePos.z, "iron").box(polePos, [0.09, 3.6, 0.09], 0, [0.5, 0.5], [1, 1, 1]);
    ix.names.slice(0, 2).forEach((nm, k) => {
      const cell = bladeFor(nm);
      const p = polePos.add(new Vector3(0, 1.5 - k * 0.3, 0));
      bladeQuad(cell, p, k === 0 ? 0 : Math.PI / 2);
    });
    bladesPlaced++;
  }
  bladeTex.update();

  // ---- gas lamps along the major streets ----
  const lampPole = MeshBuilder.CreateBox("q_lamp0", { width: 0.12, height: 3.8, depth: 0.12 }, scene);
  lampPole.material = matIron;
  lampPole.parent = root;
  const lampHead = MeshBuilder.CreateBox("q_lamphead0", { width: 0.34, height: 0.46, depth: 0.34 }, scene);
  const lampGlow = new StandardMaterial("q_lampglow", scene);
  lampGlow.diffuseColor = new Color3(1, 0.85, 0.5);
  lampGlow.emissiveColor = new Color3(0.35, 0.27, 0.12);
  lampHead.material = lampGlow;
  lampHead.position.y = 2.0;
  lampHead.parent = lampPole;
  lampPole.position = new Vector3(0, 1.9, -9999);
  let lampCount = 0;
  for (const st of data.streets) {
    if (!BALCONY_STREETS.has(st.name) || lampCount > 220) continue;
    for (let i = 0; i + 3 < st.pts.length; i += 2) {
      const x0 = st.pts[i], z0 = st.pts[i + 1], x1 = st.pts[i + 2], z1 = st.pts[i + 3];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const steps = Math.floor(len / 26);
      for (let s = 0; s < steps && lampCount <= 220; s++) {
        const t = (s + 0.5) / steps;
        const side = lampCount % 2 === 0 ? 1 : -1;
        const px = ((z1 - z0) / len) * (st.w / 2 + 0.7) * side;
        const pz = (-(x1 - x0) / len) * (st.w / 2 + 0.7) * side;
        const inst = lampPole.createInstance(`q_lamp_${lampCount}`);
        inst.position = new Vector3(x0 + (x1 - x0) * t + px, 1.9, z0 + (z1 - z0) * t + pz);
        inst.parent = root;
        lampHead.createInstance(`q_lamphead_${lampCount}`).parent = inst;
        lampCount++;
      }
    }
  }

  // ---- hero dressing ----
  const interactables: Interactable[] = [];
  const dynamicProps: Mesh[] = [];

  // St. Louis Cathedral: three slate spires above the white box
  {
    const lm = lmByKey.get("stlouis_cathedral");
    if (lm?.bld != null) {
      const b = data.buildings[lm.bld];
      const slate = mkPbr("q_slate", new Color3(0.22, 0.24, 0.28), 0.6);
      const front = new Vector3(b.c[0] + 9, 0, b.c[1]); // faces the square (+x)
      const spire = (off: Vector3, baseH: number, coneH: number, w: number) => {
        const tower = MeshBuilder.CreateBox("q_spiretower", { width: w, height: baseH, depth: w }, scene);
        tower.position = front.add(off).add(new Vector3(0, 14 + baseH / 2 - 2, 0));
        tower.material = matWall;
        tower.parent = root;
        const cone = MeshBuilder.CreateCylinder("q_spire", { diameterTop: 0, diameterBottom: w * 1.15, height: coneH, tessellation: 8 }, scene);
        cone.position = tower.position.add(new Vector3(0, baseH / 2 + coneH / 2, 0));
        cone.material = slate;
        cone.parent = root;
      };
      spire(new Vector3(-2, 0, 0), 4, 9, 4.5);       // center
      spire(new Vector3(-2, 0, -10.5), 2.5, 6, 3.6); // flank
      spire(new Vector3(-2, 0, 10.5), 2.5, 6, 3.6);  // flank
    }
  }

  // Jackson Square: iron fence, statue, buskers' stage, Moonwalk steps
  {
    const sq = data.parks.find((p) => (p.name ?? "").includes("Jackson"));
    if (sq) {
      const fb = new Buf();
      const n = sq.pts.length / 2;
      for (let i = 0; i < n; i++) {
        const x0 = sq.pts[2 * i], z0 = sq.pts[2 * i + 1];
        const x1 = sq.pts[(2 * i + 2) % (2 * n)], z1 = sq.pts[(2 * i + 3) % (2 * n)];
        const len = Math.hypot(x1 - x0, z1 - z0);
        if (len < 1) continue;
        const segs = Math.ceil(len / 6);
        for (let s = 0; s < segs; s++) {
          const t0 = s / segs, t1 = (s + 0.94) / segs;
          fb.box(
            new Vector3(x0 + (x1 - x0) * (t0 + t1) / 2, 0.55, z0 + (z1 - z0) * (t0 + t1) / 2),
            [0.08, 1.1, len * (t1 - t0)],
            Math.atan2(x1 - x0, z1 - z0), [0.5, 0.5], [1, 1, 1],
          );
        }
      }
      const fence = fb.toMesh("q_jsq_fence", scene, matIron, true);
      if (fence) {
        fence.parent = root;
        new PhysicsAggregate(fence, PhysicsShapeType.MESH, { mass: 0 }, scene);
      }
      // Jackson statue: pedestal + rearing-horse silhouette (stylized)
      const cxm = sq.pts.reduce((a, _, i) => (i % 2 === 0 ? a + sq.pts[i] : a), 0) / n;
      const czm = sq.pts.reduce((a, _, i) => (i % 2 === 1 ? a + sq.pts[i] : a), 0) / n;
      const ped = MeshBuilder.CreateBox("q_statue_ped", { width: 3.4, height: 2.6, depth: 3.4 }, scene);
      ped.position = new Vector3(cxm, 1.3, czm);
      ped.material = matGround;
      ped.parent = root;
      new PhysicsAggregate(ped, PhysicsShapeType.BOX, { mass: 0 }, scene);
      const bronze = mkPbr("q_bronze", new Color3(0.18, 0.3, 0.22), 0.5);
      bronze.metallic = 0.5;
      const horse = MeshBuilder.CreateBox("q_statue_h", { width: 1.0, height: 1.6, depth: 2.6 }, scene);
      horse.position = new Vector3(cxm, 3.6, czm);
      horse.rotation.x = -0.5;
      horse.material = bronze;
      horse.parent = root;
      const rider = MeshBuilder.CreateBox("q_statue_r", { width: 0.5, height: 1.2, depth: 0.5 }, scene);
      rider.position = new Vector3(cxm, 4.7, czm - 0.4);
      rider.material = bronze;
      rider.parent = root;
    }
    // buskers' stage on the flagstones facing the cathedral
    const stage = MeshBuilder.CreateCylinder("q_stage", { diameter: 7, height: 1.0, tessellation: 18 }, scene);
    stage.position = new Vector3(14, 0.5, -9);
    stage.material = matWood;
    stage.parent = root;
    new PhysicsAggregate(stage, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
    // Washington Artillery Park platform + cannon, over Decatur
    const plat = MeshBuilder.CreateBox("q_artillery", { width: 10, height: 2.4, depth: 14 }, scene);
    plat.position = new Vector3(96, 1.2, -18);
    plat.material = matGround;
    plat.parent = root;
    new PhysicsAggregate(plat, PhysicsShapeType.BOX, { mass: 0 }, scene);
    const steps = MeshBuilder.CreateBox("q_artillery_steps", { width: 5, height: 1.2, depth: 6 }, scene);
    steps.position = new Vector3(89, 0.6, -18);
    steps.material = matGround;
    steps.parent = root;
    new PhysicsAggregate(steps, PhysicsShapeType.BOX, { mass: 0 }, scene);
    const cannon = MeshBuilder.CreateCylinder("q_cannon", { diameter: 0.5, height: 3, tessellation: 10 }, scene);
    cannon.rotation.z = Math.PI / 2 - 0.25;
    cannon.rotation.y = Math.PI / 2;
    cannon.position = new Vector3(98, 3.0, -18);
    cannon.material = matIron;
    cannon.parent = root;
    // Clover Grill corner sign — the piece-4 perch (crates -> balcony -> jump)
    const grillPole = MeshBuilder.CreateBox("q_grill_pole", { width: 0.14, height: 7.2, depth: 0.14 }, scene);
    grillPole.position = new Vector3(-138.5, 3.6, 103);
    grillPole.material = matIron;
    grillPole.parent = root;
    const grillSign = MeshBuilder.CreateBox("q_grill_sign", { width: 2.4, height: 1.0, depth: 0.5 }, scene);
    grillSign.position = new Vector3(-138.5, 6.6, 103);
    const grillMat = new StandardMaterial("q_grillmat", scene);
    grillMat.diffuseColor = new Color3(0.9, 0.12, 0.12);
    grillMat.emissiveColor = new Color3(0.45, 0.06, 0.06);
    grillSign.material = grillMat;
    grillSign.parent = root;
    new PhysicsAggregate(grillSign, PhysicsShapeType.BOX, { mass: 0 }, scene);

    // Moonwalk steps down to the river
    for (let s = 0; s < 4; s++) {
      const step = MeshBuilder.CreateBox(`q_moonwalk_${s}`, { width: 2.2, height: 0.5, depth: 26 }, scene);
      step.position = new Vector3(138 + s * 2.2, -0.25 - s * 0.35, -10);
      step.material = matGround;
      step.parent = root;
      new PhysicsAggregate(step, PhysicsShapeType.BOX, { mass: 0 }, scene);
    }
  }

  // ---- interiors ----
  const interiors: Interior[] = [];
  const matInterior = mkPbr("q_int_wall", new Color3(0.65, 0.58, 0.5), 0.9);
  const matCounter = mkPbr("q_counter", new Color3(0.4, 0.26, 0.16), 0.6);
  const matNeon = new StandardMaterial("q_neonpink", scene);
  matNeon.emissiveColor = new Color3(1, 0.3, 0.75);
  matNeon.diffuseColor = new Color3(0.4, 0.1, 0.3);

  const buildInterior = (idef: InteriorDef): Interior | null => {
    const lm = lmByKey.get(idef.key);
    if (!lm || lm.bld == null) return null;
    const b = data.buildings[lm.bld];
    const n = b.pts.length / 2;
    const key = idef.key;
    const h = heroH(key, b.lv);
    const tint = HERO_STYLE[key]?.tint ?? [1, 0.95, 0.85];
    const c = new Vector3(b.c[0], 0, b.c[1]);
    const fi = b.f ? b.f[0] : 0;

    // front edge -> door
    const fx0 = b.pts[2 * fi], fz0 = b.pts[2 * fi + 1];
    const fx1 = b.pts[(2 * fi + 2) % (2 * n)], fz1 = b.pts[(2 * fi + 3) % (2 * n)];
    const flen = Math.hypot(fx1 - fx0, fz1 - fz0);
    const fdir = new Vector3((fx1 - fx0) / flen, 0, (fz1 - fz0) / flen);
    const fout = new Vector3(fdir.z, 0, -fdir.x);
    const doorPos = new Vector3((fx0 + fx1) / 2, 0, (fz0 + fz1) / 2);
    const insidePos = doorPos.subtract(fout.scale(3.0));

    if (key === "cafe_du_monde") {
      // open pavilion: white columns + green/white striped canopy, no walls
      const stripeTex = new DynamicTexture("q_stripes", { width: 256, height: 64 }, scene, false);
      const sctx = stripeTex.getContext() as CanvasRenderingContext2D;
      for (let i = 0; i < 8; i++) {
        sctx.fillStyle = i % 2 ? "#1d6b40" : "#f2f0e8";
        sctx.fillRect(i * 32, 0, 32, 64);
      }
      stripeTex.update();
      stripeTex.wrapU = Texture.WRAP_ADDRESSMODE;
      stripeTex.wrapV = Texture.WRAP_ADDRESSMODE;
      const smat = new StandardMaterial("q_stripemat", scene);
      smat.diffuseTexture = stripeTex;
      smat.emissiveColor = new Color3(0.25, 0.25, 0.25);
      smat.specularColor = Color3.Black();
      smat.backFaceCulling = false;
      const white = mkPbr("q_white", new Color3(0.96, 0.96, 0.92), 0.7);
      const cols = new Buf();
      for (let i = 0; i < n; i++) {
        cols.box(new Vector3(b.pts[2 * i], 2.0, b.pts[2 * i + 1]), [0.35, 4.0, 0.35], 0, [0.5, 0.5], [1, 1, 1]);
      }
      const colMesh = cols.toMesh("q_cdm_cols", scene, white, true)!;
      colMesh.parent = root;
      new PhysicsAggregate(colMesh, PhysicsShapeType.MESH, { mass: 0 }, scene);
      const canopy = new Buf();
      for (let t = 0; t < b.tri.length; t += 3) {
        const v = (j: number) => new Vector3(b.pts[2 * b.tri[t + j]], 4.2, b.pts[2 * b.tri[t + j] + 1]);
        canopy.tri(v(0), v(1), v(2), Vector3.Up(), [0.5, 0.5], [1, 1, 1]);
        canopy.tri(v(2), v(1), v(0), Vector3.Down(), [0.5, 0.5], [1, 1, 1]);
      }
      // stripes run with world position (one stripe ≈ 1 m)
      for (let i = 0; i < canopy.pos.length; i += 3) {
        canopy.uv[(i / 3) * 2] = canopy.pos[i] / 8;
        canopy.uv[(i / 3) * 2 + 1] = canopy.pos[i + 2] / 8;
      }
      const can = canopy.toMesh("q_cdm_canopy", scene, smat as never, false)!;
      can.parent = root;
      new PhysicsAggregate(can, PhysicsShapeType.MESH, { mass: 0 }, scene);
      // marble tables + sugar gag
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        const tp = c.add(new Vector3(Math.cos(ang) * 4.5, 0.5, Math.sin(ang) * 4.5));
        const table = MeshBuilder.CreateCylinder(`q_cdm_t${i}`, { diameter: 1.3, height: 1.0, tessellation: 10 }, scene);
        table.position = tp;
        table.material = white;
        table.parent = root;
        new PhysicsAggregate(table, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
      }
      const puff = MeshBuilder.CreateSphere("q_sugar", { diameter: 1 }, scene);
      const puffMat = new StandardMaterial("q_sugarmat", scene);
      puffMat.emissiveColor = new Color3(0.95, 0.95, 0.95);
      puffMat.alpha = 0;
      puff.material = puffMat;
      puff.position = c.add(new Vector3(0, 1.4, 0));
      puff.parent = root;
      let puffT = 99;
      scene.onBeforeRenderObservable.add(() => {
        if (puffT < 1) {
          puffT += scene.getEngine().getDeltaTime() / 1000;
          puff.scaling.setAll(1 + puffT * 6);
          puffMat.alpha = Math.max(0, 0.7 * (1 - puffT));
        }
      });
      interactables.push({
        pos: c.clone(), r: 6, cooldown: 12, lastFired: -99,
        fire: () => {
          puffT = 0;
          puff.position = c.add(new Vector3(0, 1.2, 0));
        },
      });
      return {
        def: idef, door: null, doorAgg: null, doorPos, insidePos: c.clone(),
        isOpen: true, open: () => undefined,
      };
    }

    // standard shell: walls with a door gap on the front edge, flat roof
    const shell = new Buf();
    const wallH = h;
    for (let i = 0; i < n; i++) {
      const x0 = b.pts[2 * i], z0 = b.pts[2 * i + 1];
      const x1 = b.pts[(2 * i + 2) % (2 * n)], z1 = b.pts[(2 * i + 3) % (2 * n)];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.2) continue;
      const dir = new Vector3((x1 - x0) / len, 0, (z1 - z0) / len);
      const mid = new Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2);
      const rotY = Math.atan2(x1 - x0, z1 - z0);
      if (i === fi && len > 4) {
        // two wall pieces with a 2.4m door gap + lintel
        const gap = 2.4;
        const seg = (len - gap) / 2;
        shell.box(mid.subtract(dir.scale((gap + seg) / 2)).add(new Vector3(0, wallH / 2, 0)), [0.45, wallH, seg], rotY, [0.5, 0.5], tint);
        shell.box(mid.add(dir.scale((gap + seg) / 2)).add(new Vector3(0, wallH / 2, 0)), [0.45, wallH, seg], rotY, [0.5, 0.5], tint);
        shell.box(mid.add(new Vector3(0, 3.0 + (wallH - 3.0) / 2, 0)), [0.45, wallH - 3.0, gap + 0.2], rotY, [0.5, 0.5], tint);
      } else {
        shell.box(mid.add(new Vector3(0, wallH / 2, 0)), [0.45, wallH, len], rotY, [0.5, 0.5], tint);
      }
    }
    // roof (with skylight hole for the antiques heist)
    if (key === "ms_rau") {
      // roof = footprint bbox minus a skylight hole at the centroid
      const hole = 3.4;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < n; i++) {
        x0 = Math.min(x0, b.pts[2 * i]);
        x1 = Math.max(x1, b.pts[2 * i]);
        z0 = Math.min(z0, b.pts[2 * i + 1]);
        z1 = Math.max(z1, b.pts[2 * i + 1]);
      }
      const hx0 = c.x - hole / 2, hx1 = c.x + hole / 2;
      const hz0 = c.z - hole / 2, hz1 = c.z + hole / 2;
      const roofTint: [number, number, number] = [tint[0] * 0.5, tint[1] * 0.5, tint[2] * 0.5];
      const slab = (sx0: number, sz0: number, sx1: number, sz1: number) => {
        if (sx1 - sx0 < 0.1 || sz1 - sz0 < 0.1) return;
        shell.box(new Vector3((sx0 + sx1) / 2, wallH, (sz0 + sz1) / 2), [sx1 - sx0, 0.3, sz1 - sz0], 0, [0.5, 0.5], roofTint);
      };
      slab(x0, z0, hx0, z1);          // west of the hole
      slab(hx1, z0, x1, z1);          // east of the hole
      slab(hx0, z0, hx1, hz0);        // strip toward Royal
      slab(hx0, hz1, hx1, z1);        // strip toward the courtyard
    } else {
      for (let t = 0; t < b.tri.length; t += 3) {
        const v = (j: number) => new Vector3(b.pts[2 * b.tri[t + j]], wallH, b.pts[2 * b.tri[t + j] + 1]);
        shell.tri(v(0), v(1), v(2), Vector3.Up(), [0.5, 0.5], [tint[0] * 0.5, tint[1] * 0.5, tint[2] * 0.5]);
        shell.tri(v(2), v(1), v(0), Vector3.Down(), [0.5, 0.5], [0.6, 0.55, 0.5]);
      }
    }
    const shellMesh = shell.toMesh(`q_int_${key}`, scene, matWall, true)!;
    shellMesh.parent = root;
    new PhysicsAggregate(shellMesh, PhysicsShapeType.MESH, { mass: 0 }, scene);

    // furniture by theme
    const F = new Buf();
    const place = (off: Vector3, size: [number, number, number], rot = 0) =>
      F.box(c.add(off), size, rot, [0.5, 0.5], [1, 1, 1]);
    switch (idef.theme) {
      case "bar":
      case "cottage":
        place(new Vector3(0, 0.6, 2), [1.0, 1.2, 5]);          // the bar counter
        for (let s = 0; s < 4; s++) place(new Vector3(1.4, 0.4, 0.6 + s * 1.3), [0.4, 0.8, 0.4]); // stools
        place(new Vector3(-2.5, 1.4, 3.5), [0.5, 2.8, 3]);     // back shelf
        break;
      case "voodoo":
        place(new Vector3(0, 0.55, 2.2), [1.0, 1.1, 3.4]);     // counter
        place(new Vector3(-2.4, 1.2, 0), [0.5, 2.4, 4]);       // shelves
        place(new Vector3(2.4, 1.2, 1), [0.5, 2.4, 3]);
        break;
      case "jazz":
        place(new Vector3(0, 0.25, 3), [4.5, 0.5, 2.2]);       // the band riser
        for (let s = 0; s < 3; s++) place(new Vector3(-2 + s * 2, 0.3, -1.5), [1.6, 0.6, 0.5]); // benches
        break;
      case "antiques":
        place(new Vector3(-2.2, 0.9, 0), [0.7, 1.8, 5]);
        place(new Vector3(2.2, 0.9, 0), [0.7, 1.8, 5]);
        place(new Vector3(0, 0.6, 3.4), [2.4, 1.2, 0.8]);
        break;
      case "club":
        place(new Vector3(0, 0.5, 3), [4, 1.0, 2.6]);          // stage
        place(new Vector3(-2.4, 0.6, -1), [0.9, 1.2, 3]);      // bar
        break;
      default:
        break;
    }
    const furn = F.toMesh(`q_furn_${key}`, scene, idef.theme === "voodoo" ? matIron : matCounter, false);
    if (furn) {
      furn.parent = root;
      new PhysicsAggregate(furn, PhysicsShapeType.MESH, { mass: 0 }, scene);
    }
    if (idef.theme === "club") {
      const pole = MeshBuilder.CreateCylinder("q_pole", { diameter: 0.12, height: 4.5, tessellation: 8 }, scene);
      pole.position = c.add(new Vector3(0, 2.25, 3));
      pole.material = matNeon;
      pole.parent = root;
      const trim = MeshBuilder.CreateBox("q_trim", { width: 5, height: 0.15, depth: 0.15 }, scene);
      trim.position = doorPos.add(new Vector3(0, 3.4, 0)).add(fout.scale(0.4));
      trim.rotation.y = Math.atan2(fdir.x, fdir.z);
      trim.material = matNeon;
      trim.parent = root;
    }
    if (idef.theme === "jazz") {
      const brassMat = mkPbr("q_brass", new Color3(0.9, 0.7, 0.25), 0.3);
      brassMat.metallic = 0.85;
      for (let s = 0; s < 3; s++) {
        const horn = MeshBuilder.CreateCylinder(`q_horn_${s}`, { diameterTop: 0.5, diameterBottom: 0.1, height: 0.9, tessellation: 10 }, scene);
        horn.position = c.add(new Vector3(-1.4 + s * 1.4, 0.95, 3));
        horn.rotation.x = -0.9;
        horn.material = brassMat;
        horn.parent = root;
      }
    }

    // themed interactable
    const gag: Record<string, () => string> = {
      voodoo: () => ["The bones say: the collage completes itself.", "A gris-gris for luck. It smells like beignets.", "Marie Laveau approves of your bow tie."][Math.floor(Math.random() * 3)],
      bar: () => "The absinthe fountain drips. The green fairy nods at the bear.",
      cottage: () => "The fireplace has burned since 1772. Allegedly.",
      jazz: () => "The band warms up. Someone hands the bear a tambourine.",
      antiques: () => "A 19th-century music box plays four notes of Tiger Rag.",
      club: () => "The stage lights find you. Destiny smells like cheap fog machine.",
    };
    const gagFn = gag[idef.theme];
    if (gagFn) {
      interactables.push({
        pos: c.clone().add(new Vector3(0, 1, 0)), r: 3.2, cooldown: 10, lastFired: -99,
        fire: () => {
          const w = window as unknown as { __hudMessage?: (m: string) => void };
          w.__hudMessage?.(gagFn());
        },
      });
    }

    // door (locked until open hour)
    let door: Mesh | null = null;
    let doorAgg: PhysicsAggregate | null = null;
    if (idef.opens !== -1) {
      door = MeshBuilder.CreateBox(`q_door_${key}`, { width: 0.3, height: 3.0, depth: 2.4 }, scene);
      door.position = doorPos.add(new Vector3(0, 1.5, 0));
      door.rotation.y = Math.atan2(fdir.x, fdir.z); // long axis along the wall gap
      door.material = matWood;
      door.parent = root;
      doorAgg = new PhysicsAggregate(door, PhysicsShapeType.BOX, { mass: 0 }, scene);
    }
    const interior: Interior = {
      def: idef, door, doorAgg, doorPos: doorPos.clone(), insidePos,
      isOpen: idef.opens === -1,
      open: () => {
        if (interior.isOpen) return;
        interior.isOpen = true;
        interior.doorAgg?.dispose();
        interior.door?.dispose();
        interior.door = null;
        interior.doorAgg = null;
      },
    };
    return interior;
  };

  for (const idef of INTERIORS) {
    const itr = buildInterior(idef);
    if (itr) interiors.push(itr);
  }

  // ---- climb props & street dressing ----
  const matCrate = mkPbr("q_crate", new Color3(0.55, 0.4, 0.22), 0.85);
  for (const spot of CLIMB_SPOTS) {
    const [x, , z] = spot.pos;
    if (spot.kind === "crates") {
      for (const [dx, dy, dz, s] of [[0, 0.65, 0, 1.3], [0.2, 1.95, 1.5, 1.3], [-0.1, 3.25, 3.0, 1.3]] as const) {
        const cr = MeshBuilder.CreateBox(`q_crate_${x}_${dz}`, { size: s }, scene);
        cr.position = new Vector3(x + dx, dy, z + dz);
        cr.material = matCrate;
        cr.parent = root;
        new PhysicsAggregate(cr, PhysicsShapeType.BOX, { mass: 0 }, scene);
      }
    } else if (spot.kind === "dumpster") {
      const d = MeshBuilder.CreateBox(`q_dump_${x}`, { width: 2.4, height: 1.7, depth: 1.6 }, scene);
      d.position = new Vector3(x, 0.85, z);
      d.material = matProp;
      d.parent = root;
      new PhysicsAggregate(d, PhysicsShapeType.BOX, { mass: 0 }, scene);
      const lid = MeshBuilder.CreateBox(`q_dumplid_${x}`, { width: 1.2, height: 0.5, depth: 1.6 }, scene);
      lid.position = new Vector3(x + 1.6, 2.6, z);
      lid.material = matProp;
      lid.parent = root;
      new PhysicsAggregate(lid, PhysicsShapeType.BOX, { mass: 0 }, scene);
    } else {
      const van = MeshBuilder.CreateBox(`q_van_${x}`, { width: 2.2, height: 2.3, depth: 5 }, scene);
      van.position = new Vector3(x, 1.15, z);
      van.material = mkPbr(`q_vanmat_${x}`, new Color3(0.8, 0.75, 0.6), 0.5);
      van.parent = root;
      new PhysicsAggregate(van, PhysicsShapeType.BOX, { mass: 0 }, scene);
    }
  }

  // dynamic props clustered where the action is
  const dynSpots: Array<[number, number, "can" | "bottle" | "chair"]> = [
    [-150, 150, "can"], [-145, 100, "can"], [-148, -50, "can"], [-150, -200, "can"],
    [-148, -330, "can"], [84, 30, "chair"], [88, 42, "chair"], [-100, -80, "can"],
    [-144, -10, "bottle"], [-146, -54, "bottle"], [-150, -195, "bottle"], [12, -20, "bottle"],
    [-40, -22, "bottle"], [78, 150, "can"], [-150, -325, "bottle"], [122, -5, "can"],
  ];
  const matBottle = mkPbr("q_bottle", new Color3(0.2, 0.4, 0.3), 0.2);
  for (const [x, z, kind] of dynSpots) {
    const size: [number, number, number] = kind === "can" ? [0.7, 1.1, 0.7] : kind === "chair" ? [0.8, 0.9, 0.8] : [0.25, 0.7, 0.25];
    const m = MeshBuilder.CreateBox(`q_dyn_${x}_${z}`, { width: size[0], height: size[1], depth: size[2] }, scene);
    m.position = new Vector3(x, size[1] / 2 + 0.3, z);
    m.material = kind === "bottle" ? matBottle : kind === "chair" ? matCrate : matProp;
    m.parent = root;
    new PhysicsAggregate(m, PhysicsShapeType.BOX, { mass: kind === "bottle" ? 1 : 6, friction: 0.5, restitution: 0.3 }, scene);
    dynamicProps.push(m);
  }

  // ---- street-following coin trails (the real centerlines) ----
  const streetCoins: Vector3[] = [];
  const COIN_STREETS = new Set(["Bourbon Street", "Royal Street", "Decatur Street", "Chartres Street"]);
  for (const st of data.streets) {
    if (!COIN_STREETS.has(st.name)) continue;
    for (let i = 0; i + 3 < st.pts.length; i += 2) {
      const x0 = st.pts[i], z0 = st.pts[i + 1], x1 = st.pts[i + 2], z1 = st.pts[i + 3];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const steps = Math.floor(len / 9);
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const wob = Math.sin((x0 + z0 + s) * 1.7) * 1.6;
        const px = ((z1 - z0) / len) * wob;
        const pz = (-(x1 - x0) / len) * wob;
        streetCoins.push(new Vector3(x0 + (x1 - x0) * t + px, 0.6, z0 + (z1 - z0) * t + pz));
        if (streetCoins.length >= 230) break;
      }
      if (streetCoins.length >= 230) break;
    }
    if (streetCoins.length >= 230) break;
  }

  // ---- tram line for the Riverfront streetcar ----
  let tramLine: Vector3[] = [];
  let bestLen = 0;
  for (const t of data.trams) {
    const pts: Vector3[] = [];
    for (let i = 0; i < t.length; i += 2) pts.push(new Vector3(t[i], 0, t[i + 1]));
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Vector3.Distance(pts[i - 1], pts[i]);
    if (len > bestLen) {
      bestLen = len;
      tramLine = pts;
    }
  }

  // ---- realize chunk meshes (everything contributed by now) ----
  const chunkMeshes: Array<{ cx: number; cz: number; mesh: Mesh; far: number }> = [];
  const kindMat: Record<string, PBRMaterial | StandardMaterial> = {
    facade: matFacade, wall: matWall, iron: matIron, road: matRoad, park: matPark,
    sign: signMat, blade: bladeMat,
  };
  for (const [key, rec] of chunks) {
    const [gx, gz] = key.split("_").map(Number);
    const cx = gx * CHUNK - 2000 + CHUNK / 2;
    const cz = gz * CHUNK - 2000 + CHUNK / 2;
    for (const [kind, bb] of Object.entries(rec)) {
      if (kind === "phys") {
        const m = bb.toMesh(`phys_${key}`, scene, matFacade, false);
        if (m) {
          m.isVisible = false;
          m.parent = root;
          new PhysicsAggregate(m, PhysicsShapeType.MESH, { mass: 0, friction: 0.8, restitution: 0 }, scene);
        }
        continue;
      }
      const m = bb.toMesh(`${kind}_${key}`, scene, kindMat[kind], kind !== "sign" && kind !== "blade");
      if (m) {
        m.parent = root;
        m.freezeWorldMatrix();
        chunkMeshes.push({ cx, cz, mesh: m, far: kind === "sign" || kind === "blade" ? SIGN_CULL_R : CULL_R });
      }
    }
  }

  // ---- culling + night ----
  const updateCulling = (p: Vector3) => {
    for (const c of chunkMeshes) {
      const d = Math.hypot(c.cx - p.x, c.cz - p.z);
      c.mesh.setEnabled(d < c.far + CHUNK * 0.75);
    }
  };
  const setNight = (nightAmount: number) => {
    lampGlow.emissiveColor = Color3.Lerp(new Color3(0.35, 0.27, 0.12), new Color3(1.0, 0.78, 0.35), nightAmount);
    signMat.emissiveColor = Color3.Lerp(new Color3(0.55, 0.55, 0.55), new Color3(1.0, 1.0, 1.0), nightAmount);
    matNeon.emissiveColor = Color3.Lerp(new Color3(1, 0.3, 0.75), new Color3(1.2, 0.4, 0.9), nightAmount);
  };

  return {
    root, data, dynamicProps, waterMesh, interiors, interactables,
    landmarkMarkers, streetCoins, tramLine, updateCulling, setNight,
  };
}
