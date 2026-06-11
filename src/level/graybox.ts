import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import {
  PhysicsAggregate,
  PhysicsShapeType,
} from "@babylonjs/core/Physics/v2";
import { STREET, ZONES } from "./layout";

/**
 * M1 graybox: every walkable/climbable surface at final coordinates.
 * M5 replaces visuals; collision layout is the contract and stays.
 */

interface Palette {
  [k: string]: PBRMaterial;
}

function makePalette(scene: Scene): Palette {
  const mk = (name: string, c: Color3, rough = 0.9) => {
    const m = new PBRMaterial(name, scene);
    m.albedoColor = c;
    m.roughness = rough;
    m.metallic = 0;
    return m;
  };
  return {
    road: mk("mat_road", new Color3(0.16, 0.16, 0.18)),
    sidewalk: mk("mat_sidewalk", new Color3(0.45, 0.42, 0.38)),
    building: mk("mat_building", new Color3(0.62, 0.5, 0.4)),
    building2: mk("mat_building2", new Color3(0.55, 0.55, 0.5)),
    building3: mk("mat_building3", new Color3(0.5, 0.42, 0.46)),
    balcony: mk("mat_balcony", new Color3(0.12, 0.12, 0.13), 0.4),
    crate: mk("mat_crate", new Color3(0.55, 0.4, 0.22)),
    vehicle: mk("mat_vehicle", new Color3(0.85, 0.78, 0.2), 0.5),
    barrier: mk("mat_barrier", new Color3(0.8, 0.3, 0.2), 0.7),
    lipstixx: mk("mat_lipstixx", new Color3(0.85, 0.3, 0.55), 0.5),
    water: mk("mat_water", new Color3(0.2, 0.35, 0.4), 0.1),
    prop: mk("mat_prop", new Color3(0.3, 0.35, 0.3), 0.6),
  };
}

let palette: Palette;

function staticBox(
  scene: Scene,
  name: string,
  pos: Vector3,
  size: Vector3,
  mat: PBRMaterial,
  rotY = 0,
): Mesh {
  const m = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, scene);
  m.position = pos;
  m.rotation.y = rotY;
  m.material = mat;
  m.receiveShadows = true;
  new PhysicsAggregate(m, PhysicsShapeType.BOX, { mass: 0, friction: 0.8, restitution: 0 }, scene);
  return m;
}

export interface GrayboxResult {
  root: TransformNode;
  dynamicProps: Mesh[];
  waterMesh: Mesh;
}

export function buildGraybox(scene: Scene): GrayboxResult {
  palette = makePalette(scene);
  const root = new TransformNode("level", scene);
  const P = palette;
  const B = (name: string, pos: [number, number, number], size: [number, number, number], mat: PBRMaterial, rotY = 0) => {
    const m = staticBox(scene, name, new Vector3(...pos), new Vector3(...size), mat, rotY);
    m.parent = root;
    return m;
  };

  const L = STREET.length; // 240

  // ---- Ground: road + sidewalks (sidewalks raised 0.15 curb) ----
  B("road", [0, -0.5, L / 2], [12, 1, L + 20], P.road);
  B("sidewalk_e", [8, -0.425, L / 2], [4, 1.15, L + 20], P.sidewalk);
  B("sidewalk_w", [-8, -0.425, L / 2], [4, 1.15, L + 20], P.sidewalk);

  // ---- Building line (varied graybox facades), leaving gaps at intersections (70-86, 156-172) and alley (west 140-156) ----
  const segments: Array<{ z0: number; z1: number; sides: ("e" | "w")[] }> = [
    { z0: -4, z1: 70, sides: ["e", "w"] },
    { z0: 86, z1: 140, sides: ["e", "w"] },
    { z0: 140, z1: 156, sides: ["e"] }, // west side here is the alley mouth
    { z0: 172, z1: 244, sides: ["e", "w"] },
  ];
  let bi = 0;
  for (const seg of segments) {
    for (const side of seg.sides) {
      const sx = side === "e" ? 1 : -1;
      let z = seg.z0;
      while (z < seg.z1) {
        const w = Math.min(8 + (bi % 3) * 4, seg.z1 - z); // 8/12/16m frontages
        const h = 8 + (bi % 4); // 8..11m
        const mats = [P.building, P.building2, P.building3];
        B(`bldg_${side}_${bi}`, [sx * (10 + STREET.buildingDepth / 2), h / 2, z + w / 2], [STREET.buildingDepth, h, w - 0.3], mats[bi % 3]);
        bi++;
        z += w;
      }
    }
  }

  // ---- Balconies (walkable, y=4.5 deck) with railings ----
  const balcony = (side: "e" | "w", z0: number, z1: number, name: string) => {
    const sx = side === "e" ? 1 : -1;
    const len = z1 - z0;
    const cx = sx * 8.6;
    B(`${name}_deck`, [cx, STREET.balconyY, (z0 + z1) / 2], [2.8, 0.2, len], P.balcony);
    B(`${name}_rail`, [sx * 7.3, STREET.balconyY + 0.6, (z0 + z1) / 2], [0.1, 1.0, len], P.balcony);
  };
  balcony("e", 44, 62, "balc_b1"); // piece 5 route
  balcony("w", 124, 134, "balc_b2a"); // piece 6 plank run, part 1
  balcony("w", 140, 150, "balc_b2b"); // part 2 (gap 134-140 = plank)
  B("plank_b2", [-8.6, STREET.balconyY + 0.02, 137], [0.8, 0.08, 6.4], P.crate);
  balcony("e", 118, 132, "balc_secret"); // leads to shutter room (secret 2)
  balcony("w", 206, 216, "balc_b3"); // antiques shop access
  balcony("w", 188, 200, "balc_roof"); // rooftop secret route

  // ---- Climbing routes ----
  // Crates to balcony b1 (piece 5): 1m, 2m, 3m stack + AC unit 4m
  B("crate_a", [8.5, 0.65, 47], [1.3, 1.3, 1.3], P.crate);
  B("crate_b", [8.5, 1.3, 49], [1.3, 2.6, 1.3], P.crate);
  B("crate_c", [8.5, 1.95, 51], [1.3, 3.9, 1.3], P.crate);
  B("ac_unit", [8.6, 3.6, 53], [1.6, 1.0, 1.6], P.prop);
  // Stairs-ish crates to east secret balcony
  B("crate_d", [8.5, 0.65, 116], [1.3, 1.3, 1.3], P.crate);
  B("crate_e", [8.5, 1.95, 118], [1.3, 3.9, 1.3], P.crate);
  // Shutter room (secret 2): hollow box on building face, entered from balcony
  B("shutter_floor", [8.5, 4.4, 125], [3.5, 0.2, 5], P.sidewalk);
  B("shutter_roof", [8.5, 7.6, 125], [3.5, 0.2, 5], P.building2);
  B("shutter_back", [10.2, 6.0, 125], [0.2, 3.2, 5], P.building2);
  B("shutter_l", [8.5, 6.0, 122.6], [3.5, 3.2, 0.2], P.building2);
  B("shutter_r", [8.5, 6.0, 127.4], [3.5, 3.2, 0.2], P.building2);
  // West balcony access in block 2 (to piece 6 run): pedestal + awning
  B("awning_b2", [-8.4, 3.2, 122], [2.6, 0.2, 3], P.barrier);
  B("table_b2", [-7.5, 0.55, 119], [1.2, 1.1, 1.2], P.prop);
  // Rooftop secret route: AC on balc_roof then roof slab
  B("ac_roof", [-8.8, 5.6, 193], [1.5, 1.4, 1.5], P.prop);
  B("roof_slab", [-9.5, 9.2, 196], [4, 0.3, 10], P.building3);

  // ---- Café (block 1): table with piece 1, counter with beignet ----
  B("cafe_table", [7.5, 0.5, 30], [1.4, 1.0, 1.4], P.prop);
  B("cafe_counter", [8.6, 0.6, 26], [2.4, 1.2, 1.2], P.prop);
  // Dumpster + alcove (secret 1)
  B("dumpster", [9.0, 0.9, 33.5], [1.8, 1.8, 2.4], P.prop);

  // ---- Intersection A: cross street stubs + truck with climbable bumper/hood/cab ----
  B("crossA_road_e", [13, -0.5, 78], [14, 1, 16], P.road);
  B("crossA_road_w", [-13, -0.5, 78], [14, 1, 16], P.road);
  B("crossA_barrier_e", [19, 0.8, 78], [0.8, 1.6, 16], P.barrier);
  B("crossA_barrier_w", [-19, 0.8, 78], [0.8, 1.6, 16], P.barrier);
  B("truck_bumper", [-3.5, 0.6, 78], [2.0, 1.2, 3.2], P.vehicle);
  B("truck_hood", [-1.5, 1.1, 78], [2.4, 2.2, 3.2], P.vehicle);
  B("truck_cab", [1.0, 1.8, 78], [2.6, 3.6, 3.2], P.vehicle);
  B("truck_tank", [4.5, 1.5, 78], [4.5, 3.0, 3.0], P.vehicle);

  // ---- Daiquiri bar (block 2) ----
  B("daiquiri_bar", [-8.2, 0.6, 120], [2.8, 1.2, 4], P.prop);
  B("daiquiri_stoop", [-8.2, 0.3, 110], [3, 0.6, 3], P.sidewalk);

  // ---- The Alley (west, z 140-156): corridor + flooded section + boss arena ----
  B("alley_floor_dry1", [-15, -0.425, 148], [10, 1.15, 16], P.sidewalk);
  // flooded depression x -32..-20: floor lowered to -1.2
  B("alley_floor_flood", [-26, -1.7, 146], [12, 1.0, 12], P.road);
  // ramps into/out of the flood
  B("alley_ramp_e", [-20.5, -0.7, 146], [3, 0.5, 12], P.sidewalk, 0); // step down
  B("alley_floor_dry2", [-36.5, -0.425, 150], [13, 1.15, 11], P.sidewalk);
  B("alley_wall_n", [-25, 4, 156.5], [30, 9, 1], P.building2);
  B("alley_wall_s", [-25, 4, 139.5], [30, 9, 1], P.building3);
  B("alley_end", [-42.5, 4, 150], [1, 9, 12], P.building);
  // submerged grate to duck under at the waterline
  B("alley_grate", [-26, 0.65, 146], [0.4, 0.5, 6], P.balcony);
  // fire escape above boss arena (huntress ceiling-drop origin)
  B("fire_escape", [-36, 4.2, 150], [3, 0.2, 4], P.balcony);

  // Water surface (visual only; buoyancy handled by controller via ZONES.water AABB)
  const water = MeshBuilder.CreateGround("water", { width: 12, height: 12 }, scene);
  water.position = new Vector3(-26, ZONES.water.max[1], 146);
  const wmat = new StandardMaterial("water_std", scene);
  wmat.diffuseColor = new Color3(0.15, 0.3, 0.35);
  wmat.alpha = 0.7;
  wmat.specularColor = new Color3(0.5, 0.5, 0.5);
  water.material = wmat;
  water.parent = root;

  // ---- Intersection B: pedicab springboard + grill sign (piece 4) ----
  B("crossB_road_e", [13, -0.5, 164], [14, 1, 16], P.road);
  B("crossB_road_w", [-13, -0.5, 164], [14, 1, 16], P.road);
  B("crossB_barrier_e", [19, 0.8, 164], [0.8, 1.6, 16], P.barrier);
  B("crossB_barrier_w", [-19, 0.8, 164], [0.8, 1.6, 16], P.barrier);
  B("pedicab", [5.5, 0.8, 164], [1.6, 1.6, 2.6], P.vehicle);
  B("grill_awning", [7.8, 4.6, 164], [2.4, 0.2, 5], P.barrier);
  B("grill_sign", [8.5, 6.3, 164], [1.2, 1.4, 3], P.lipstixx);

  // ---- Block 3: antiques shop (skylight heist) + Lipstixx + travel agency ----
  // Antiques shop: hollow interior x -14..-7, z 214-222, skylight hole in roof
  B("antq_floor", [-10.5, -0.425, 218], [7, 1.15, 8], P.sidewalk);
  B("antq_wall_n", [-10.5, 4, 222.2], [7, 8, 0.4], P.building);
  B("antq_wall_s", [-10.5, 4, 213.8], [7, 8, 0.4], P.building);
  B("antq_wall_w", [-14.2, 4, 218], [0.4, 8, 8], P.building);
  // front wall with (initially locked) door gap — door blocker removed on piece pickup
  B("antq_front_a", [-6.8, 4, 215.2], [0.4, 8, 3], P.building);
  B("antq_front_b", [-6.8, 4, 220.8], [0.4, 8, 3], P.building);
  B("antq_front_top", [-6.8, 6, 218], [0.4, 4, 2.6], P.building);
  const door = B("antq_door", [-6.8, 1.95, 218], [0.3, 3.9, 2.6], P.crate);
  door.metadata = { lockedDoor: true };
  // roof with skylight hole (4 slabs around a 2.5m gap)
  B("antq_roof_a", [-10.5, 8.1, 215.0], [7, 0.3, 2.4], P.building2);
  B("antq_roof_b", [-10.5, 8.1, 221.0], [7, 0.3, 2.4], P.building2);
  B("antq_roof_c", [-13.2, 8.1, 218], [1.6, 0.3, 3.6], P.building2);
  B("antq_roof_d", [-7.8, 8.1, 218], [1.6, 0.3, 3.6], P.building2);
  // display shelf inside (holds piece 8)
  B("antq_shelf", [-8.5, 0.5, 218], [1.2, 1.0, 2], P.prop);

  // Lipstixx facade (east, z 222-230) + sign + awning + chalk assembly spot
  B("lipstixx", [13, 5, 226], [6, 10, 8], P.lipstixx);
  B("lipstixx_sign", [9.6, 7, 226], [0.6, 2.5, 5], P.lipstixx);
  B("lipstixx_awning", [8.8, 3.4, 226], [2.4, 0.2, 6], P.lipstixx);
  // Travel agency (east, z 232-238)
  B("travel_agency", [13, 4, 235], [6, 8, 6], P.building2);

  // ---- Bookend barriers ----
  B("barrier_n", [0, 1, -2], [20, 2, 1], P.barrier);
  B("barrier_s", [0, 1, 242], [20, 2, 1], P.barrier);
  // safety walls behind sidewalks at intersections' open corners
  B("wall_corner_a", [0, 5, -3.5], [22, 10, 1], P.building2);
  B("wall_corner_b", [0, 5, 243.5], [22, 10, 1], P.building3);

  // ---- Dynamic physics props (>=12): trash cans, bottles, chairs ----
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
  const canSpots: [number, number, number][] = [
    [6.5, 0.55, 18], [-6.5, 0.55, 36], [6.5, 0.55, 95], [-6.5, 0.55, 145],
  ];
  canSpots.forEach((p, i) => dyn(`trashcan_${i}`, p, [0.7, 1.1, 0.7], 8, P.prop));
  const bottleSpots: [number, number, number][] = [
    [2, 0.35, 24], [-3, 0.35, 52], [1, 0.35, 99], [-2, 0.35, 133], [3, 0.35, 178], [-1, 0.35, 205],
  ];
  bottleSpots.forEach((p, i) => dyn(`bottle_${i}`, p, [0.25, 0.7, 0.25], 1, P.water));
  const chairSpots: [number, number, number][] = [
    [6.8, 0.45, 31], [7.0, 0.45, 29], [-7.0, 0.45, 112], [6.8, 0.45, 188],
  ];
  chairSpots.forEach((p, i) => dyn(`chair_${i}`, p, [0.8, 0.9, 0.8], 5, P.crate));

  return { root, dynamicProps, waterMesh: water };
}
