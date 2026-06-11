import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3, Vector4, Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import {
  PhysicsAggregate,
  PhysicsShapeType,
} from "@babylonjs/core/Physics/v2";
import { STREET, ZONES } from "./layout";

/**
 * Bourbon Street builder. Collision layout == PLAN §7 contract.
 * Visuals: procedural facade atlas (12 storefronts), signs, lamps, beads.
 * All static meshes merge by material to stay inside the draw-call budget.
 */

interface Palette {
  [k: string]: PBRMaterial;
}

function makePalette(scene: Scene): Palette {
  const mk = (name: string, c: Color3, rough = 0.9, tex?: string, metallic = 0) => {
    const m = new PBRMaterial(name, scene);
    m.albedoColor = c;
    m.roughness = rough;
    m.metallic = metallic;
    if (tex) {
      m.albedoTexture = new Texture(`./textures/${tex}`, scene);
    }
    return m;
  };
  const road = mk("mat_road", new Color3(0.85, 0.85, 0.9), 0.38, "road.png", 0.05);
  (road.albedoTexture as Texture).uScale = 3;
  (road.albedoTexture as Texture).vScale = 60;
  const sidewalk = mk("mat_sidewalk", new Color3(1, 1, 1), 0.85, "sidewalk.png");
  (sidewalk.albedoTexture as Texture).uScale = 1;
  (sidewalk.albedoTexture as Texture).vScale = 60;
  const facade = mk("mat_facade", new Color3(1, 1, 1), 0.92, "facades.png");
  return {
    road,
    sidewalk,
    facade,
    balcony: mk("mat_balcony", new Color3(0.10, 0.10, 0.12), 0.45),
    crate: mk("mat_crate", new Color3(0.55, 0.4, 0.22)),
    vehicle: mk("mat_vehicle", new Color3(0.85, 0.78, 0.2), 0.5),
    barrier: mk("mat_barrier", new Color3(0.8, 0.3, 0.2), 0.7),
    lipstixx: mk("mat_lipstixx", new Color3(0.45, 0.12, 0.3), 0.6),
    water: mk("mat_water", new Color3(0.2, 0.35, 0.4), 0.1),
    prop: mk("mat_prop", new Color3(0.3, 0.35, 0.3), 0.6),
    lamp: mk("mat_lamp", new Color3(0.08, 0.08, 0.09), 0.4),
    awning_r: mk("mat_awning_r", new Color3(0.55, 0.15, 0.17), 0.8),
    awning_g: mk("mat_awning_g", new Color3(0.14, 0.32, 0.2), 0.8),
    awning_b: mk("mat_awning_b", new Color3(0.17, 0.22, 0.43), 0.8),
    hydrant: mk("mat_hydrant", new Color3(0.7, 0.12, 0.1), 0.5),
    plant: mk("mat_plant", new Color3(0.16, 0.34, 0.14), 0.95),
  };
}

export interface GrayboxResult {
  root: TransformNode;
  dynamicProps: Mesh[];
  waterMesh: Mesh;
  lockedDoor: Mesh;
}

export function buildGraybox(scene: Scene): GrayboxResult {
  const P = makePalette(scene);
  const root = new TransformNode("level", scene);
  const mergeGroups = new Map<PBRMaterial, Mesh[]>();

  const staticBox = (
    name: string,
    pos: [number, number, number],
    size: [number, number, number],
    mat: PBRMaterial,
    opts: { rotY?: number; faceUV?: Vector4[]; noMerge?: boolean; invisible?: boolean } = {},
  ): Mesh => {
    const m = MeshBuilder.CreateBox(
      name,
      { width: size[0], height: size[1], depth: size[2], faceUV: opts.faceUV },
      scene,
    );
    m.position = new Vector3(...pos);
    if (opts.rotY) m.rotation.y = opts.rotY;
    m.material = mat;
    m.receiveShadows = true;
    m.parent = root;
    if (opts.invisible) m.isVisible = false;
    new PhysicsAggregate(m, PhysicsShapeType.BOX, { mass: 0, friction: 0.8, restitution: 0 }, scene);
    if (!opts.noMerge && !opts.invisible) {
      const g = mergeGroups.get(mat) ?? [];
      g.push(m);
      mergeGroups.set(mat, g);
    }
    return m;
  };
  const B = staticBox;
  /** decorative only: no physics, merged for draw calls */
  const deco = (
    name: string,
    pos: [number, number, number],
    size: [number, number, number],
    mat: PBRMaterial,
    rotY = 0,
  ): Mesh => {
    const m = MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene);
    m.position = new Vector3(...pos);
    if (rotY) m.rotation.y = rotY;
    m.material = mat;
    m.parent = root;
    const g = mergeGroups.get(mat) ?? [];
    g.push(m);
    mergeGroups.set(mat, g);
    return m;
  };

  const L = STREET.length;

  // ---- ground ----
  B("road", [0, -0.5, L / 2], [12, 1, L + 20], P.road);
  B("sidewalk_e", [8, -0.425, L / 2], [4, 1.15, L + 20], P.sidewalk);
  B("sidewalk_w", [-8, -0.425, L / 2], [4, 1.15, L + 20], P.sidewalk);

  // ---- buildings with facade atlas ----
  const tileUV = (i: number): Vector4 => {
    const col = i % 4;
    const row = Math.floor(i / 4) % 3;
    return new Vector4(col / 4, 1 - (row + 1) / 3, (col + 1) / 4, 1 - row / 3);
  };
  const plainUV = (i: number): Vector4 => {
    const t = tileUV(i);
    return new Vector4(t.x + 0.005, t.y + 0.04, t.x + 0.03, t.y + 0.1);
  };
  const segments: Array<{ z0: number; z1: number; sides: ("e" | "w")[] }> = [
    { z0: -4, z1: 70, sides: ["e", "w"] },
    { z0: 86, z1: 140, sides: ["e", "w"] },
    { z0: 140, z1: 156, sides: ["e"] },
    { z0: 172, z1: 244, sides: ["e", "w"] },
  ];
  let bi = 0;
  for (const seg of segments) {
    for (const side of seg.sides) {
      const sx = side === "e" ? 1 : -1;
      let z = seg.z0;
      while (z < seg.z1) {
        const w = Math.min(8 + (bi % 3) * 4, seg.z1 - z);
        const h = 8 + (bi % 4);
        const tile = tileUV(bi % 12);
        const plain = plainUV(bi % 12);
        // tile on the box's natural front/back (correct UV orientation),
        // then rotate the box 90° so those faces meet the street
        const faceUV = [tile, tile, plain, plain, plain, plain];
        B(`bldg_${side}_${bi}`, [sx * (10 + STREET.buildingDepth / 2), h / 2, z + w / 2], [w - 0.3, h, STREET.buildingDepth], P.facade, { faceUV, rotY: Math.PI / 2 });
        bi++;
        z += w;
      }
    }
  }

  // ---- balconies with wrought-iron railings ----
  const balcony = (side: "e" | "w", z0: number, z1: number, name: string) => {
    const sx = side === "e" ? 1 : -1;
    const len = z1 - z0;
    B(`${name}_deck`, [sx * 8.6, STREET.balconyY, (z0 + z1) / 2], [2.8, 0.2, len], P.balcony);
    B(`${name}_rail`, [sx * 7.3, STREET.balconyY + 0.6, (z0 + z1) / 2], [0.08, 1.0, len], P.balcony);
    // railing balusters (visual only, merged)
    for (let z = z0 + 0.6; z < z1; z += 1.2) {
      const bal = MeshBuilder.CreateBox(`${name}_bal`, { width: 0.05, height: 1.0, depth: 0.05 }, scene);
      bal.position = new Vector3(sx * 7.3, STREET.balconyY + 0.6, z);
      bal.material = P.balcony;
      bal.parent = root;
      const g = mergeGroups.get(P.balcony) ?? [];
      g.push(bal);
      mergeGroups.set(P.balcony, g);
    }
    // support posts
    for (const z of [z0 + 0.4, z1 - 0.4]) {
      B(`${name}_post`, [sx * 7.35, STREET.balconyY / 2, z], [0.12, STREET.balconyY, 0.12], P.balcony);
    }
  };
  balcony("e", 44, 62, "balc_b1");
  balcony("w", 124, 134, "balc_b2a");
  balcony("w", 140, 150, "balc_b2b");
  B("plank_b2", [-8.6, STREET.balconyY + 0.02, 137], [0.8, 0.08, 6.4], P.crate);
  balcony("e", 118, 132, "balc_secret");
  balcony("w", 206, 216, "balc_b3");
  balcony("w", 188, 200, "balc_roof");

  // ---- climbing routes ----
  B("crate_a", [8.5, 0.65, 47], [1.3, 1.3, 1.3], P.crate);
  B("crate_b", [8.5, 1.3, 49], [1.3, 2.6, 1.3], P.crate);
  B("crate_c", [8.5, 1.95, 51], [1.3, 3.9, 1.3], P.crate);
  B("ac_unit", [8.6, 3.6, 53], [1.6, 1.0, 1.6], P.prop);
  B("crate_d", [8.5, 0.65, 116], [1.3, 1.3, 1.3], P.crate);
  B("crate_e", [8.5, 1.95, 118], [1.3, 3.9, 1.3], P.crate);
  B("shutter_floor", [8.5, 4.4, 125], [3.5, 0.2, 5], P.sidewalk);
  B("shutter_roof", [8.5, 7.6, 125], [3.5, 0.2, 5], P.facade);
  B("shutter_back", [10.2, 6.0, 125], [0.2, 3.2, 5], P.facade);
  B("shutter_l", [8.5, 6.0, 122.6], [3.5, 3.2, 0.2], P.facade);
  B("shutter_r", [8.5, 6.0, 127.4], [3.5, 3.2, 0.2], P.facade);
  B("awning_b2", [-8.4, 3.2, 122], [2.6, 0.2, 3], P.barrier);
  B("table_b2", [-7.5, 0.55, 119], [1.2, 1.1, 1.2], P.prop);
  B("ac_roof", [-8.8, 5.6, 193], [1.5, 1.4, 1.5], P.prop);
  B("roof_slab", [-9.5, 9.2, 196], [4, 0.3, 10], P.facade);

  // ---- café & dumpster ----
  B("cafe_table", [7.5, 0.5, 30], [1.4, 1.0, 1.4], P.prop);
  B("cafe_counter", [8.6, 0.6, 26], [2.4, 1.2, 1.2], P.prop);
  B("dumpster", [9.0, 0.9, 33.5], [1.8, 1.8, 2.4], P.prop);

  // ---- intersection A + truck ----
  B("crossA_road_e", [13, -0.5, 78], [14, 1, 16], P.road);
  B("crossA_road_w", [-13, -0.5, 78], [14, 1, 16], P.road);
  B("crossA_barrier_e", [19, 0.8, 78], [0.8, 1.6, 16], P.barrier);
  B("crossA_barrier_w", [-19, 0.8, 78], [0.8, 1.6, 16], P.barrier);
  B("truck_bumper", [-3.5, 0.6, 78], [2.0, 1.2, 3.2], P.vehicle);
  B("truck_hood", [-1.5, 1.1, 78], [2.4, 2.2, 3.2], P.vehicle);
  B("truck_cab", [1.0, 1.8, 78], [2.6, 3.6, 3.2], P.vehicle);
  B("truck_tank", [4.5, 1.5, 78], [4.5, 3.0, 3.0], P.vehicle);

  // ---- daiquiri bar ----
  B("daiquiri_bar", [-8.2, 0.6, 120], [2.8, 1.2, 4], P.prop);
  B("daiquiri_stoop", [-8.2, 0.3, 110], [3, 0.6, 3], P.sidewalk);

  // ---- the alley + flood + boss arena ----
  B("alley_floor_dry1", [-15, -0.425, 148], [10, 1.15, 16], P.sidewalk);
  B("alley_floor_flood", [-26, -1.7, 146], [12, 1.0, 12], P.road);
  B("alley_ramp_e", [-20.5, -0.7, 146], [3, 0.5, 12], P.sidewalk);
  B("alley_floor_dry2", [-36.5, -0.425, 150], [13, 1.15, 11], P.sidewalk);
  B("alley_wall_n", [-25, 4, 156.5], [30, 9, 1], P.facade);
  B("alley_wall_s", [-25, 4, 139.5], [30, 9, 1], P.facade);
  B("alley_end", [-42.5, 4, 150], [1, 9, 12], P.facade);
  B("alley_grate", [-26, 0.65, 146], [0.4, 0.5, 6], P.balcony);
  B("fire_escape", [-36, 4.2, 150], [3, 0.2, 4], P.balcony);

  const water = MeshBuilder.CreateGround("water", { width: 12, height: 12 }, scene);
  water.position = new Vector3(-26, ZONES.water.max[1], 146);
  const wmat = new StandardMaterial("water_std", scene);
  wmat.diffuseColor = new Color3(0.13, 0.28, 0.33);
  wmat.alpha = 0.72;
  wmat.specularColor = new Color3(0.6, 0.6, 0.6);
  wmat.specularPower = 96;
  water.material = wmat;
  water.parent = root;

  // ---- intersection B ----
  B("crossB_road_e", [13, -0.5, 164], [14, 1, 16], P.road);
  B("crossB_road_w", [-13, -0.5, 164], [14, 1, 16], P.road);
  B("crossB_barrier_e", [19, 0.8, 164], [0.8, 1.6, 16], P.barrier);
  B("crossB_barrier_w", [-19, 0.8, 164], [0.8, 1.6, 16], P.barrier);
  B("pedicab", [5.5, 0.8, 164], [1.6, 1.6, 2.6], P.vehicle);
  B("grill_awning", [7.8, 4.6, 164], [2.4, 0.2, 5], P.barrier);
  B("grill_sign", [8.5, 6.3, 164], [1.2, 1.4, 3], P.lipstixx);

  // ---- block 3: antiques shop, Lipstixx, travel agency ----
  B("antq_floor", [-10.5, -0.425, 218], [7, 1.15, 8], P.sidewalk);
  B("antq_wall_n", [-10.5, 4, 222.2], [7, 8, 0.4], P.facade);
  B("antq_wall_s", [-10.5, 4, 213.8], [7, 8, 0.4], P.facade);
  B("antq_wall_w", [-14.2, 4, 218], [0.4, 8, 8], P.facade);
  B("antq_front_a", [-6.8, 4, 215.2], [0.4, 8, 3], P.facade);
  B("antq_front_b", [-6.8, 4, 220.8], [0.4, 8, 3], P.facade);
  B("antq_front_top", [-6.8, 6, 218], [0.4, 4, 2.6], P.facade);
  const door = B("antq_door", [-6.8, 1.95, 218], [0.3, 3.9, 2.6], P.crate, { noMerge: true });
  door.metadata = { lockedDoor: true };
  B("antq_roof_a", [-10.5, 8.1, 215.0], [7, 0.3, 2.4], P.facade);
  B("antq_roof_b", [-10.5, 8.1, 221.0], [7, 0.3, 2.4], P.facade);
  B("antq_roof_c", [-13.2, 8.1, 218], [1.6, 0.3, 3.6], P.facade);
  B("antq_roof_d", [-7.8, 8.1, 218], [1.6, 0.3, 3.6], P.facade);
  B("antq_shelf", [-8.5, 0.5, 218], [1.2, 1.0, 2], P.prop);

  B("lipstixx", [13, 5, 226], [6, 10, 8], P.lipstixx);
  B("lipstixx_awning", [8.8, 3.4, 226], [2.4, 0.2, 6], P.lipstixx);
  B("travel_agency", [13, 4, 235], [6, 8, 6], P.facade, {
    faceUV: (() => {
      const f = [plainUV(3), plainUV(3), plainUV(3), plainUV(3), plainUV(3), plainUV(3)];
      f[3] = tileUV(3);
      return f;
    })(),
  });

  // ---- signs (emissive textured planes) ----
  const signDefs: Array<{ tex: string; pos: [number, number, number]; w: number; h: number; rotY: number; glow?: boolean }> = [
    { tex: "sign_lipstixx.png", pos: [9.55, 7.0, 226], w: 6, h: 1.5, rotY: Math.PI / 2, glow: true },
    { tex: "sign_travel.png", pos: [9.9, 5.2, 235], w: 5, h: 1.25, rotY: Math.PI / 2 },
    { tex: "sign_cafe.png", pos: [9.85, 3.4, 27], w: 4.4, h: 1.1, rotY: Math.PI / 2 },
    { tex: "sign_daiquiri.png", pos: [-9.85, 3.6, 117], w: 4.8, h: 1.2, rotY: -Math.PI / 2, glow: true },
    { tex: "sign_antiques.png", pos: [-6.55, 5.6, 218], w: 4.4, h: 1.1, rotY: Math.PI / 2 },
    { tex: "sign_grill.png", pos: [7.85, 6.3, 164], w: 3, h: 0.9, rotY: Math.PI / 2 },
  ];
  for (const s of signDefs) {
    const plane = MeshBuilder.CreatePlane(`sign_${s.tex}`, { width: s.w, height: s.h }, scene);
    plane.position = new Vector3(...s.pos);
    plane.rotation.y = s.rotY;
    const mat = new StandardMaterial(`signmat_${s.tex}`, scene);
    const tex = new Texture(`./textures/${s.tex}`, scene);
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.emissiveColor = s.glow ? new Color3(0.9, 0.9, 0.9) : new Color3(0.45, 0.45, 0.45);
    mat.specularColor = Color3.Black();
    plane.material = mat;
    plane.parent = root;
  }

  // ---- gas lamps along both sidewalks (instances) ----
  const lampPole = MeshBuilder.CreateBox("lamp0", { width: 0.12, height: 3.6, depth: 0.12 }, scene);
  lampPole.material = P.lamp;
  const lampHead = MeshBuilder.CreateBox("lamphead0", { width: 0.34, height: 0.45, depth: 0.34 }, scene);
  const lampGlow = new StandardMaterial("lampglow", scene);
  lampGlow.diffuseColor = new Color3(1, 0.85, 0.5);
  lampGlow.emissiveColor = new Color3(0.55, 0.42, 0.2);
  lampHead.material = lampGlow;
  lampHead.position.y = 1.9;
  lampHead.parent = lampPole;
  lampPole.position = new Vector3(6.4, 1.8, 14);
  lampPole.parent = root;
  for (let z = 34; z < 238; z += 20) {
    const side = (z / 20) % 2 === 0 ? 6.4 : -6.4;
    const inst = lampPole.createInstance(`lamp_${z}`);
    inst.position = new Vector3(side, 1.8, z);
    inst.parent = root;
    lampHead.createInstance(`lamphead_${z}`).parent = inst;
  }

  // ---- mardi gras beads litter (thin instances, 3 colors) ----
  const beadColors = [new Color3(0.55, 0.2, 0.7), new Color3(0.2, 0.6, 0.25), new Color3(0.8, 0.65, 0.15)];
  beadColors.forEach((c, ci) => {
    const bead = MeshBuilder.CreateTorus(`beads_${ci}`, { diameter: 0.4, thickness: 0.05, tessellation: 10 }, scene);
    const bm = new PBRMaterial(`beadmat_${ci}`, scene);
    bm.albedoColor = c;
    bm.roughness = 0.3;
    bm.metallic = 0.4;
    bead.material = bm;
    bead.parent = root;
    const n = 40;
    const buf = new Float32Array(n * 16);
    let seed = ci * 1000 + 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < n; i++) {
      const z = 4 + rnd() * 232;
      const x = (rnd() < 0.5 ? -1 : 1) * (6.2 + rnd() * 3.2);
      Matrix.Compose(
        new Vector3(1, 1, 1),
        Quaternion.RotationAxis(Vector3.Up(), rnd() * Math.PI).multiply(
          Quaternion.RotationAxis(Vector3.Right(), Math.PI / 2 + (rnd() - 0.5) * 0.5),
        ),
        new Vector3(x, 0.18, z),
      ).copyToArray(buf, i * 16);
    }
    bead.thinInstanceSetBuffer("matrix", buf, 16, true);
  });

  // ---- bookends ----
  B("barrier_n", [0, 1, -2], [20, 2, 1], P.barrier);
  B("barrier_s", [0, 1, 242], [20, 2, 1], P.barrier);
  B("wall_corner_a", [0, 5, -3.5], [22, 10, 1], P.facade);
  B("wall_corner_b", [0, 5, 243.5], [22, 10, 1], P.facade);

  // ---- containment: invisible walls so nothing leaves the level, ever ----
  B("contain_e", [21, 15, 120], [1, 30, 270], P.facade, { invisible: true });
  B("contain_w", [-21, 15, 70], [1, 30, 170], P.facade, { invisible: true }); // up to the alley
  B("contain_w2", [-21, 15, 200], [1, 30, 90], P.facade, { invisible: true });
  B("contain_alley_w", [-44, 15, 148], [1, 30, 24], P.facade, { invisible: true });
  B("contain_alley_n", [-32, 15, 158.5], [26, 30, 1], P.facade, { invisible: true });
  B("contain_alley_s", [-32, 15, 137.5], [26, 30, 1], P.facade, { invisible: true });
  B("contain_n", [0, 15, -5.5], [44, 30, 1], P.facade, { invisible: true });
  B("contain_s", [0, 15, 245.5], [44, 30, 1], P.facade, { invisible: true });
  // full-height walls over the jumpable cross-street barriers
  B("contain_crossA_e", [19.6, 8, 78], [0.6, 14, 16], P.facade, { invisible: true });
  B("contain_crossA_w", [-19.6, 8, 78], [0.6, 14, 16], P.facade, { invisible: true });
  B("contain_crossB_e", [19.6, 8, 164], [0.6, 14, 16], P.facade, { invisible: true });
  B("contain_crossB_w", [-19.6, 8, 164], [0.6, 14, 16], P.facade, { invisible: true });

  // ---- street furniture & dressing ----
  // gallery support poles at the curb under every balcony
  const poleRuns: Array<[number, number, number]> = [
    [6.9, 44, 62], [-6.9, 124, 134], [-6.9, 140, 150], [6.9, 118, 132], [-6.9, 206, 216], [-6.9, 188, 200],
  ];
  for (const [px, z0, z1] of poleRuns) {
    for (let z = z0 + 1; z < z1; z += 4) {
      deco(`gpole_${px}_${z}`, [px, STREET.balconyY / 2, z], [0.09, STREET.balconyY, 0.09], P.balcony);
    }
    // hanging ferns under the balcony lip
    for (let z = z0 + 2; z < z1; z += 5) {
      deco(`fern_${px}_${z}`, [px * 1.06, STREET.balconyY - 0.35, z], [0.5, 0.45, 0.5], P.plant);
    }
  }
  // striped awnings over storefronts (alternating colors, both sides)
  const awningMats = [P.awning_r, P.awning_g, P.awning_b];
  let ai = 0;
  for (const seg of segments) {
    for (const side of seg.sides) {
      const sx = side === "e" ? 1 : -1;
      for (let z = seg.z0 + 6; z < seg.z1 - 4; z += 13 + (ai % 3) * 4) {
        // skip where balconies already shade the sidewalk
        const shaded = poleRuns.some(([px, z0, z1]) => Math.sign(px) === sx && z > z0 - 2 && z < z1 + 2);
        if (!shaded) {
          deco(`awning_${side}_${z}`, [sx * 8.9, 3.05, z], [2.0, 0.16, 4.6], awningMats[ai % 3]);
          deco(`awning_f_${side}_${z}`, [sx * 7.95, 2.9, z], [0.14, 0.5, 4.6], awningMats[ai % 3]);
        }
        ai++;
      }
    }
  }
  // hydrants + planters
  for (const [hx, hz] of [[6.6, 24], [-6.6, 102], [6.6, 158], [-6.6, 226]] as Array<[number, number]>) {
    deco(`hydrant_${hz}`, [hx, 0.5, hz], [0.34, 0.7, 0.34], P.hydrant);
    deco(`hydrant_cap_${hz}`, [hx, 0.95, hz], [0.2, 0.18, 0.2], P.hydrant);
  }
  for (const [pxx, pz] of [[7.4, 42], [-7.4, 66], [7.4, 142], [-7.4, 182], [7.4, 208]] as Array<[number, number]>) {
    deco(`planter_${pz}`, [pxx, 0.35, pz], [0.9, 0.7, 0.9], P.crate);
    deco(`bush_${pz}`, [pxx, 0.95, pz], [0.85, 0.6, 0.85], P.plant);
  }
  // parapet trims along rooflines facing the street
  for (const seg of segments) {
    for (const side of seg.sides) {
      const sx = side === "e" ? 1 : -1;
      deco(`parapet_${side}_${seg.z0}`, [sx * 10.1, 8.2, (seg.z0 + seg.z1) / 2], [0.25, 0.5, seg.z1 - seg.z0 - 0.5], P.facade, 0);
    }
  }

  // street-name blades at the intersections
  const blade = (tex: string, pos: [number, number, number], rotY: number) => {
    const plane = MeshBuilder.CreatePlane(`blade_${tex}_${pos[2]}`, { width: 1.7, height: 0.32 }, scene);
    plane.position = new Vector3(...pos);
    plane.rotation.y = rotY;
    const mat = new StandardMaterial(`blademat_${tex}_${pos[2]}`, scene);
    const t = new Texture(`./textures/${tex}`, scene);
    mat.diffuseTexture = t;
    mat.emissiveTexture = t;
    mat.emissiveColor = new Color3(0.5, 0.5, 0.5);
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    plane.material = mat;
    plane.parent = root;
  };
  for (const [z, cross] of [[70.5, "street_stpeter.png"], [156.5, "street_orleans.png"]] as Array<[number, string]>) {
    deco(`signpole_${z}`, [6.4, 1.7, z], [0.1, 3.4, 0.1], P.lamp);
    blade("street_bourbon.png", [6.4, 3.1, z], 0);
    blade(cross, [6.4, 2.75, z], Math.PI / 2);
  }

  // ---- dynamic props ----
  const dynamicProps: Mesh[] = [];
  const dyn = (name: string, pos: [number, number, number], size: [number, number, number], mass: number, mat: PBRMaterial) => {
    const m = MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene);
    m.position = new Vector3(...pos);
    m.material = mat;
    m.parent = root;
    new PhysicsAggregate(m, PhysicsShapeType.BOX, { mass, friction: 0.5, restitution: 0.3 }, scene);
    dynamicProps.push(m);
    return m;
  };
  ([[6.5, 0.55, 18], [-6.5, 0.55, 36], [6.5, 0.55, 95], [-6.5, 0.55, 145]] as [number, number, number][])
    .forEach((p, i) => dyn(`trashcan_${i}`, p, [0.7, 1.1, 0.7], 8, P.prop));
  ([[2, 0.35, 24], [-3, 0.35, 52], [1, 0.35, 99], [-2, 0.35, 133], [3, 0.35, 178], [-1, 0.35, 205]] as [number, number, number][])
    .forEach((p, i) => dyn(`bottle_${i}`, p, [0.25, 0.7, 0.25], 1, P.water));
  ([[6.8, 0.45, 31], [7.0, 0.45, 29], [-7.0, 0.45, 112], [6.8, 0.45, 188]] as [number, number, number][])
    .forEach((p, i) => dyn(`chair_${i}`, p, [0.8, 0.9, 0.8], 5, P.crate));

  // ---- merge static visuals by material (sources stay as invisible physics) ----
  for (const [mat, meshes] of mergeGroups) {
    if (meshes.length < 2) continue;
    const merged = Mesh.MergeMeshes(meshes, false, true, undefined, false, false);
    if (merged) {
      merged.name = `merged_${mat.name}`;
      merged.material = mat;
      merged.receiveShadows = true;
      merged.parent = root;
      meshes.forEach((m) => (m.isVisible = false));
    }
  }

  return { root, dynamicProps, waterMesh: water, lockedDoor: door };
}
