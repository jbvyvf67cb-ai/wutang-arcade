/** Coins (thin-instanced + physics spills), beignets, fishbowls, collage pieces. */
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3, Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics/v2";
import { GameState } from "./state";
import { COIN_TRAILS, ITEMS, PIECES, SECRETS, PieceDef } from "../level/layout";

const COIN_PICKUP_R = 1.4;
const PIECE_PICKUP_R = 1.6;

interface StaticCoin {
  pos: Vector3;
  taken: boolean;
}

export class Collectibles {
  private coinBase: Mesh;
  private staticCoins: StaticCoin[] = [];
  private spilled: Array<{ mesh: Mesh; agg: PhysicsAggregate; age: number }> = [];
  private items: Array<{ mesh: Mesh; kind: "beignet" | "fishbowl"; taken: boolean }> = [];
  pieces: Array<{ mesh: Mesh; def: PieceDef; taken: boolean }> = [];
  private secretCoins: Array<{ key: string; coins: StaticCoin[] }> = [];
  private t = 0;
  onPieceCollected: ((def: PieceDef) => void) | null = null;

  constructor(
    private scene: Scene,
    private state: GameState,
  ) {
    // doubloon: short cylinder, gold PBR
    this.coinBase = MeshBuilder.CreateCylinder(
      "coin",
      { diameter: 0.34, height: 0.06, tessellation: 14 },
      scene,
    );
    const gold = new PBRMaterial("coin_mat", scene);
    gold.albedoColor = new Color3(0.95, 0.75, 0.25);
    gold.metallic = 0.9;
    gold.roughness = 0.35;
    gold.emissiveColor = new Color3(0.25, 0.18, 0.04);
    this.coinBase.material = gold;
    this.coinBase.rotation.x = Math.PI / 2;
    this.coinBase.bakeCurrentTransformIntoVertices();
    this.coinBase.isVisible = true;

    for (const trail of COIN_TRAILS) {
      const a = new Vector3(...trail.from);
      const b = new Vector3(...trail.to);
      for (let i = 0; i < trail.count; i++) {
        const p = Vector3.Lerp(a, b, trail.count === 1 ? 0 : i / (trail.count - 1));
        this.staticCoins.push({ pos: p, taken: false });
      }
    }
    for (const [key, s] of Object.entries(SECRETS)) {
      const cluster: StaticCoin[] = [];
      const n = s.coins;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 * 3; // spiral
        const r = 0.3 + (i / n) * 1.2;
        cluster.push({
          pos: new Vector3(s.pos[0] + Math.cos(ang) * r, s.pos[1], s.pos[2] + Math.sin(ang) * r),
          taken: false,
        });
      }
      this.staticCoins.push(...cluster);
      this.secretCoins.push({ key, coins: cluster });
    }
    this.rebuildInstances();

    // items
    for (const it of ITEMS) {
      this.items.push({ mesh: this.makeItemMesh(it.kind, new Vector3(...it.pos)), kind: it.kind, taken: false });
    }

    // collage pieces: glowing paper scraps showing real crops of collage.png
    const collageTex = new Texture("./collage/collage.png", scene, true, false);
    for (const def of PIECES) {
      const w = 1.1;
      const du = def.crop[2] - def.crop[0];
      const dv = def.crop[3] - def.crop[1];
      const h = w * ((dv * 1448) / (du * 1086));
      const plane = MeshBuilder.CreatePlane(`piece_${def.id}`, { width: w, height: Math.min(h, 1.4) }, scene);
      plane.position = new Vector3(...def.pos);
      const mat = new StandardMaterial(`piece_mat_${def.id}`, scene);
      mat.diffuseTexture = collageTex.clone();
      const tex = mat.diffuseTexture as Texture;
      tex.uScale = du;
      tex.vScale = dv;
      tex.uOffset = def.crop[0];
      tex.vOffset = 1 - def.crop[3];
      mat.emissiveColor = new Color3(0.55, 0.5, 0.4);
      mat.backFaceCulling = false;
      plane.material = mat;
      this.pieces.push({ mesh: plane, def, taken: false });
    }
  }

  private makeItemMesh(kind: "beignet" | "fishbowl", pos: Vector3): Mesh {
    if (kind === "beignet") {
      const m = MeshBuilder.CreateBox("beignet", { width: 0.4, height: 0.18, depth: 0.3 }, this.scene);
      const mat = new PBRMaterial("beignet_mat", this.scene);
      mat.albedoColor = new Color3(0.95, 0.92, 0.85); // powdered sugar
      mat.roughness = 1;
      mat.metallic = 0;
      mat.emissiveColor = new Color3(0.12, 0.11, 0.09);
      m.material = mat;
      m.position = pos;
      return m;
    }
    const bowl = MeshBuilder.CreateSphere("fishbowl", { diameter: 0.5, slice: 0.82 }, this.scene);
    const mat = new PBRMaterial("fishbowl_mat", this.scene);
    mat.albedoColor = new Color3(0.6, 0.8, 0.9);
    mat.alpha = 0.45;
    mat.roughness = 0.05;
    mat.metallic = 0;
    bowl.material = mat;
    bowl.position = pos;
    const fish = MeshBuilder.CreateBox("fish", { width: 0.12, height: 0.06, depth: 0.04 }, this.scene);
    const fmat = new PBRMaterial("fish_mat", this.scene);
    fmat.albedoColor = new Color3(1.0, 0.45, 0.1);
    fmat.emissiveColor = new Color3(0.4, 0.15, 0.02);
    fmat.roughness = 0.4;
    fish.material = fmat;
    fish.parent = bowl;
    fish.position.y = -0.05;
    return bowl;
  }

  private rebuildInstances() {
    const live = this.staticCoins.filter((c) => !c.taken);
    const buf = new Float32Array(live.length * 16);
    live.forEach((c, i) => {
      Matrix.Compose(
        Vector3.One(),
        Quaternion.RotationAxis(Vector3.Up(), (c.pos.x * 7 + c.pos.z) % Math.PI),
        c.pos,
      ).copyToArray(buf, i * 16);
    });
    this.coinBase.thinInstanceSetBuffer("matrix", buf, 16, false);
  }

  /** physics coin burst (KO spill / enemy drops) */
  spawnBurst(origin: Vector3, count: number) {
    for (let i = 0; i < Math.min(count, 40); i++) {
      const m = this.coinBase.clone(`spill_${Date.now()}_${i}`);
      m.thinInstanceSetBuffer("matrix", null);
      m.position = origin.add(new Vector3((Math.random() - 0.5) * 0.4, 0.4, (Math.random() - 0.5) * 0.4));
      const agg = new PhysicsAggregate(m, PhysicsShapeType.CYLINDER, { mass: 0.2, restitution: 0.5, friction: 0.6 }, this.scene);
      agg.body.setLinearVelocity(
        new Vector3((Math.random() - 0.5) * 7, 4 + Math.random() * 4, (Math.random() - 0.5) * 7),
      );
      this.spilled.push({ mesh: m, agg, age: 0 });
    }
  }

  update(dt: number, playerPos: Vector3) {
    this.t += dt;

    // static coin pickup (+ secret detection)
    let collected = 0;
    for (const c of this.staticCoins) {
      if (!c.taken && Vector3.DistanceSquared(c.pos, playerPos) < COIN_PICKUP_R * COIN_PICKUP_R) {
        c.taken = true;
        collected++;
      }
    }
    if (collected > 0) {
      this.state.addCoins(collected);
      this.rebuildInstances();
      for (const s of this.secretCoins) {
        if (!this.state.secretsFound.has(s.key) && s.coins.some((c) => c.taken)) {
          this.state.secretsFound.add(s.key);
          this.state.emit("message", "Secret found!");
        }
      }
    }

    // spilled coins: pickup, age out
    for (let i = this.spilled.length - 1; i >= 0; i--) {
      const s = this.spilled[i];
      s.age += dt;
      const close = Vector3.DistanceSquared(s.mesh.position, playerPos) < COIN_PICKUP_R * COIN_PICKUP_R;
      if (close || s.age > 15) {
        if (close) this.state.addCoins(1);
        s.agg.dispose();
        s.mesh.dispose();
        this.spilled.splice(i, 1);
      } else if (s.age > 12) {
        s.mesh.visibility = ((Math.sin(s.age * 12) + 1) / 2) * 0.8 + 0.2;
      }
    }

    // items
    for (const it of this.items) {
      if (it.taken) continue;
      it.mesh.rotation.y += dt * 1.5;
      if (Vector3.DistanceSquared(it.mesh.position, playerPos) < 1.3) {
        it.taken = true;
        it.mesh.setEnabled(false);
        if (it.kind === "beignet") {
          this.state.heal(2);
          this.state.emit("message", "Beignet! +2 bow tie");
        } else {
          this.state.fishbowls++;
          this.state.emit("fishbowl");
          this.state.emit("message", "Fishbowl acquired (press F — costs health!)");
        }
      }
    }

    // pieces: float, bob, pickup
    for (const p of this.pieces) {
      if (p.taken) continue;
      p.mesh.position.y = p.def.pos[1] + Math.sin(this.t * 2 + p.def.id) * 0.12;
      p.mesh.rotation.y += dt * 0.8;
      if (Vector3.DistanceSquared(p.mesh.position, playerPos) < PIECE_PICKUP_R * PIECE_PICKUP_R) {
        p.taken = true;
        p.mesh.setEnabled(false);
        this.state.collectPiece(p.def.id);
        this.state.emit("message", `Collage piece: ${p.def.name} (${this.state.pieces.size}/8)`);
        this.onPieceCollected?.(p.def);
      }
    }
  }
}
