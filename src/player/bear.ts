/** Loads Joshua and drives his animation state machine off the controller.
 *
 * Reliability rules (Safari/iOS got stuck poses with the fancy version):
 * - No animation blending. Clips switch instantly.
 * - One-shots end via onAnimationGroupEndObservable, not wall-clock math.
 * - A watchdog restarts the intended clip if the engine ever drops it.
 */
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF/2.0";
import { PlayerController } from "./controller";

export type ClipName =
  | "idle" | "idle_bored" | "walk" | "run" | "jump" | "fall" | "land"
  | "doublejump" | "attack" | "hit" | "ko" | "dance" | "drop"
  | "victory" | "wake" | "swim";

export class Bear {
  root!: TransformNode;
  meshes: AbstractMesh[] = [];
  private groups = new Map<string, AnimationGroup>();
  private current: AnimationGroup | null = null;
  private currentName = "";
  private oneShotActive = false;
  private idleTime = 0;

  static async load(scene: Scene, parent: TransformNode): Promise<Bear> {
    const bear = new Bear();
    const result = await ImportMeshAsync("./models/joshua.glb", scene);
    bear.root = new TransformNode("bear_root", scene);
    bear.root.parent = parent;
    for (const m of result.meshes) {
      if (!m.parent || m.name === "__root__") m.parent = bear.root;
      bear.meshes.push(m);
    }
    for (const g of result.animationGroups) {
      g.stop();
      bear.groups.set(g.name, g);
    }
    return bear;
  }

  play(name: ClipName, loop = true, speed = 1, force = false) {
    const g = this.groups.get(name);
    if (!g) return;
    // quantize: WebKit wedges into a stuck pose if speedRatio mutates every
    // frame (analog movement makes raw speed continuous) — step it coarsely
    // and only write on change
    const q = Math.max(0.2, Math.round(speed * 5) / 5);
    if (this.currentName === name && !force) {
      if (g.speedRatio !== q) g.speedRatio = q;
      // watchdog: if it silently stopped (platform hiccup, finished loop), restart
      if (!g.isPlaying && loop) g.start(true, q);
      return;
    }
    this.current?.stop();
    g.start(loop, q);
    this.current = g;
    this.currentName = name;
  }

  /** plays a clip once; locomotion resumes when the group reports it ended */
  oneShot(name: ClipName, speed = 1) {
    const g = this.groups.get(name);
    if (!g) return 0;
    this.current?.stop();
    this.oneShotActive = true;
    g.start(false, speed);
    this.current = g;
    this.currentName = name;
    g.onAnimationGroupEndObservable.addOnce(() => {
      this.oneShotActive = false;
    });
    return (((g.to - g.from) / 24) * 1000) / speed;
  }

  get busy(): boolean {
    return this.oneShotActive;
  }

  interrupt() {
    if (this.oneShotActive) {
      this.current?.stop();
      this.oneShotActive = false;
      this.currentName = "";
    }
  }

  private airTime = 0;

  updateLocomotion(dt: number, ctl: PlayerController, horizSpeed: number) {
    if (this.busy) return;
    this.airTime = ctl.grounded || ctl.swimming ? 0 : this.airTime + dt;
    if (ctl.swimming) {
      this.play("swim", true, Math.max(0.7, horizSpeed / 3));
      this.idleTime = 0;
    } else if (this.airTime > 0.18) {
      // hysteresis: 1-frame grounded flickers at speed must never flash the
      // limp fall pose (it can stick on iOS) — only truly airborne counts
      const vy = ctl.aggregate.body.getLinearVelocity().y;
      this.play("fall", true, vy > 0.5 ? 1.4 : 1.0);
      this.idleTime = 0;
    } else if (horizSpeed > 6.2) {
      this.play("run", true, Math.max(0.8, horizSpeed / 8.2));
      this.idleTime = 0;
    } else if (horizSpeed > 0.6) {
      this.play("walk", true, Math.max(0.7, horizSpeed / 4.6));
      this.idleTime = 0;
    } else {
      this.idleTime += dt;
      this.play(this.idleTime > 20 ? "idle_bored" : "idle", true);
    }
  }
}
