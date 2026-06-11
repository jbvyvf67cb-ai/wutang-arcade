/** Melee combo, Groove special (dance -> Drop shockwave), fishbowl, KO. */
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { GameState } from "../game/state";
import { PlayerController } from "../player/controller";
import { Bear } from "../player/bear";
import { InputState } from "../core/input";

/** Anything claws/shockwaves can hit (enemies register themselves). */
export interface Hittable {
  position: Vector3;
  alive: boolean;
  hit(damage: number, impulse: Vector3, ragdoll: boolean): void;
}

export const SHOCKWAVE_RADIUS = 8;
const CLAW_RANGE = 2.1;
const CLAW_ARC = 1.1; // radians half-angle

export class Combat {
  hittables: Hittable[] = [];
  dynamicBodies: PhysicsBody[] = [];
  private comboStage = 0;
  private comboCooldown = 0;
  private danceTimer = 0;
  private dropTimer = 0;
  /** hyper-armor flag (Joshua's note: half damage, uninterruptible) */
  get dancing(): boolean {
    return this.danceTimer > 0 || this.dropTimer > 0;
  }
  private ring: Mesh;
  private ringMat: StandardMaterial;
  private ringAge = 99;
  private fishbowlMesh: Mesh | null = null;
  onShake: ((strength: number) => void) | null = null;
  onShockwave: (() => void) | null = null;
  onClawHit: ((hit: boolean) => void) | null = null;

  constructor(
    private scene: Scene,
    private state: GameState,
    private player: PlayerController,
    private bear: Bear,
  ) {
    this.ring = MeshBuilder.CreateTorus("shockring", { diameter: 1, thickness: 0.25, tessellation: 40 }, scene);
    this.ringMat = new StandardMaterial("shockring_mat", scene);
    this.ringMat.emissiveColor = new Color3(1.0, 0.7, 0.25);
    this.ringMat.disableLighting = true;
    this.ringMat.alpha = 0.9;
    this.ring.material = this.ringMat;
    this.ring.setEnabled(false);
  }

  update(dt: number, input: InputState) {
    this.comboCooldown = Math.max(0, this.comboCooldown - dt);

    // ---- groove charging from movement + drain when still ----
    this.state.addGroove(this.player.groundTravel * 0.0023);
    if (this.player.groundTravel < 0.001) this.state.drainGroove(dt);

    // ---- fishbowl timer + helmet visual ----
    if (this.state.fishbowlTimer > 0) {
      this.state.fishbowlTimer = Math.max(0, this.state.fishbowlTimer - dt);
      if (this.state.fishbowlTimer === 0) {
        this.fishbowlMesh?.dispose();
        this.fishbowlMesh = null;
        this.state.emit("fishbowl");
        this.state.emit("message", "Fishbowl shattered. The goldfish is fine.");
      }
    }
    if (input.fishbowlPressed) this.activateFishbowl();

    // ---- dance -> drop sequencing ----
    if (this.danceTimer > 0) {
      this.danceTimer -= dt;
      if (this.danceTimer <= 0) this.executeDrop();
      return; // no other combat while dancing
    }
    if (this.dropTimer > 0) {
      this.dropTimer -= dt;
      if (this.dropTimer <= 0) {
        this.player.movementLocked = false;
        this.bear.interrupt();
      }
    }

    if (input.specialPressed && this.state.grooveReady && this.player.grounded) {
      this.startDance();
      return;
    }

    if (input.attackPressed && this.comboCooldown === 0 && !this.player.movementLocked) {
      this.clawAttack();
    }

    // shockwave ring expansion
    if (this.ringAge < 0.6) {
      this.ringAge += dt;
      const r = (this.ringAge / 0.6) * SHOCKWAVE_RADIUS * 2;
      this.ring.scaling.setAll(r);
      this.ringMat.alpha = 0.9 * (1 - this.ringAge / 0.6);
      if (this.ringAge >= 0.6) this.ring.setEnabled(false);
    }
  }

  private clawAttack() {
    this.comboStage = (this.comboStage + 1) % 3;
    this.comboCooldown = this.comboStage === 0 ? 0.55 : 0.32;
    this.bear.oneShot("attack", 2.2);
    const v = this.player.aggregate.body.getLinearVelocity();
    const speedBonus = Math.hypot(v.x, v.z) / 7; // sprint hits harder
    const boost = this.state.fishbowlTimer > 0 ? 1.8 : 1.0;
    const fwd = new Vector3(Math.sin(this.player.facing), 0, Math.cos(this.player.facing));
    let landed = false;
    for (const h of this.hittables) {
      if (!h.alive) continue;
      const to = h.position.subtract(this.player.position);
      to.y = 0;
      const dist = to.length();
      if (dist > CLAW_RANGE) continue;
      const ang = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(to.normalize(), fwd))));
      if (ang > CLAW_ARC) continue;
      const impulse = fwd.scale((90 + 140 * speedBonus) * boost).add(new Vector3(0, 60 * boost, 0));
      h.hit(this.comboStage === 0 ? 2 : 1, impulse, this.comboStage === 0 || boost > 1);
      landed = true;
    }
    this.onClawHit?.(landed);
  }

  private startDance() {
    this.state.spendGroove();
    this.player.movementLocked = true;
    this.danceTimer = 2.0;
    this.bear.oneShot("dance", 1.0);
    this.state.emit("message", "💃 hold it... hold it...");
  }

  private executeDrop() {
    this.dropTimer = 0.8;
    this.bear.oneShot("drop", 1.0);
    this.onShockwave?.();
    const origin = this.player.position.clone();
    // real radial impulses: enemies ragdoll, props scatter ballistically
    for (const h of this.hittables) {
      if (!h.alive) continue;
      const to = h.position.subtract(origin);
      const dist = Math.max(0.5, to.length());
      if (dist > SHOCKWAVE_RADIUS) continue;
      const fall = 1 - dist / SHOCKWAVE_RADIUS;
      const dir = to.normalize();
      dir.y = 0.55;
      h.hit(4, dir.scale(250 * fall + 80), true);
    }
    for (const body of this.dynamicBodies) {
      const m = body.transformNode;
      if (!m) continue;
      const to = m.position.subtract(origin);
      const dist = Math.max(0.5, to.length());
      if (dist > SHOCKWAVE_RADIUS) continue;
      const fall = 1 - dist / SHOCKWAVE_RADIUS;
      const dir = to.normalize();
      dir.y = 0.7;
      body.applyImpulse(dir.scale(60 * fall + 15), m.position);
    }
    this.ring.position = origin.add(new Vector3(0, -0.6, 0));
    this.ring.setEnabled(true);
    this.ringAge = 0;
    this.onShake?.(0.5);
  }

  private activateFishbowl() {
    if (this.state.fishbowls <= 0 || this.state.fishbowlTimer > 0) return;
    if (this.state.health <= 1) {
      this.state.emit("message", "Too woozy — the bowl would finish you (1 HP).");
      return;
    }
    this.state.fishbowls--;
    this.state.damage(1); // it hits your health meter — before the glass goes up
    this.state.fishbowlTimer = 15;
    this.state.emit("fishbowl");
    this.state.emit("message", "🐠 FISHBOWL MODE — 15s of glassy invincibility");
    // helmet visual
    const bowl = MeshBuilder.CreateSphere("helm", { diameter: 0.55, slice: 0.85 }, this.scene);
    const mat = new StandardMaterial("helm_mat", this.scene);
    mat.diffuseColor = new Color3(0.6, 0.85, 0.95);
    mat.alpha = 0.35;
    mat.specularColor = new Color3(1, 1, 1);
    bowl.material = mat;
    bowl.parent = this.bear.root;
    bowl.position = new Vector3(0, 1.78, -0.02);
    bowl.rotation.x = Math.PI; // open side down over the head
    const fish = MeshBuilder.CreateBox("helmfish", { width: 0.14, height: 0.07, depth: 0.05 }, this.scene);
    const fmat = new StandardMaterial("helmfish_mat", this.scene);
    fmat.diffuseColor = new Color3(1, 0.45, 0.1);
    fmat.emissiveColor = new Color3(0.5, 0.2, 0.03);
    fish.material = fmat;
    fish.parent = bowl;
    this.scene.onBeforeRenderObservable.add(() => {
      const t = performance.now() / 1000;
      fish.position.set(Math.sin(t * 2.2) * 0.14, -0.12, Math.cos(t * 3.1) * 0.1);
      fish.rotation.y = Math.atan2(Math.cos(t * 2.2) * 0.14, -Math.sin(t * 3.1) * 0.1);
    });
    this.fishbowlMesh = bowl;
  }
}
