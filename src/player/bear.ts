/** Loads Joshua and drives his animation state machine off the controller. */
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
  /** one-shot lock: while set, locomotion can't override (attack/land/etc) */
  private oneShotUntil = 0;
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
      for (const ta of g.targetedAnimations) {
        ta.animation.enableBlending = true;
        ta.animation.blendingSpeed = 0.12;
      }
      bear.groups.set(g.name, g);
    }
    return bear;
  }

  play(name: ClipName, loop = true, speed = 1, force = false) {
    if (this.currentName === name && !force) {
      if (this.current) this.current.speedRatio = speed;
      return;
    }
    this.current?.stop();
    const g = this.groups.get(name);
    if (!g) return;
    g.start(loop, speed);
    this.current = g;
    this.currentName = name;
  }

  /** plays a one-shot clip; locomotion resumes after its duration/speed */
  oneShot(name: ClipName, speed = 1, now = performance.now()) {
    const g = this.groups.get(name);
    if (!g) return 0;
    const durMs = ((g.to - g.from) / 24) * 1000 / speed;
    this.play(name, false, speed, true);
    this.oneShotUntil = now + durMs;
    return durMs;
  }

  get busy(): boolean {
    return performance.now() < this.oneShotUntil;
  }

  /** clears the one-shot lock (e.g. interrupted) */
  interrupt() {
    this.oneShotUntil = 0;
  }

  /** locomotion update: call every frame unless gameplay owns the pose */
  updateLocomotion(dt: number, ctl: PlayerController, horizSpeed: number) {
    if (this.busy) return;
    if (ctl.swimming) {
      this.play("swim", true, Math.max(0.7, horizSpeed / 3));
      this.idleTime = 0;
    } else if (!ctl.grounded) {
      const vy = ctl.aggregate.body.getLinearVelocity().y;
      this.play(vy > 0.5 ? "jump" : "fall", vy <= 0.5);
      this.idleTime = 0;
    } else if (horizSpeed > 5.2) {
      this.play("run", true, horizSpeed / 7);
      this.idleTime = 0;
    } else if (horizSpeed > 0.6) {
      this.play("walk", true, Math.max(0.6, horizSpeed / 4.2));
      this.idleTime = 0;
    } else {
      this.idleTime += dt;
      if (this.idleTime > 20) {
        if (this.currentName !== "idle_bored") this.play("idle_bored", true);
      } else {
        this.play("idle", true);
      }
    }
  }
}
