/** Enemy archetypes: behavior trees, physics bodies, ragdoll deaths. */
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics/v2";
import "@babylonjs/loaders/glTF/2.0";
import { GameState } from "../game/state";
import { PlayerController } from "../player/controller";
import { Hittable } from "../combat/combat";
import { AudioBus } from "../audio/audio";
import { EnemySpawn } from "../level/layout";

type Brain = "idle" | "patrol" | "aggro" | "telegraph" | "attack" | "recover" | "dead";

const STATS = {
  frat: { hp: 3, sight: 11, attackRange: 6, telegraph: 0.6, speed: 4.2, coins: 7 },
  pirate: { hp: 5, sight: 10, attackRange: 2.6, telegraph: 0.75, speed: 2.8, coins: 12 },
  huntress: { hp: 12, sight: 14, attackRange: 9, telegraph: 1.6, speed: 3.2, coins: 100 },
} as const;

const MAX_ACTIVE = 6; // mobile aggro cap

export class Enemy implements Hittable {
  brain: Brain = "idle";
  hp: number;
  alive = true;
  capsule: Mesh;
  agg: PhysicsAggregate;
  visual: TransformNode;
  private groups = new Map<string, AnimationGroup>();
  private current: AnimationGroup | null = null;
  private timer = 0;
  private cooldown = 0;
  private patrolIdx = 0;
  private contactCooldown = 0;
  private facing = 0;
  private shrieked = false;
  private pounceVel: Vector3 | null = null;

  constructor(
    private scene: Scene,
    public kind: keyof typeof STATS,
    container: AssetContainer,
    public spawn: EnemySpawn,
    private mgr: EnemyManager,
  ) {
    this.hp = STATS[kind].hp;
    const height = kind === "huntress" ? 1.7 : 1.75;
    this.capsule = MeshBuilder.CreateCapsule(`e_${kind}`, { radius: 0.4, height }, scene);
    this.capsule.position = new Vector3(...spawn.pos).add(new Vector3(0, 0.2, 0));
    this.capsule.visibility = 0;
    this.agg = new PhysicsAggregate(this.capsule, PhysicsShapeType.CAPSULE, { mass: 80, friction: 0.1, restitution: 0 }, scene);
    this.agg.body.setMassProperties({ inertia: new Vector3(0, 0, 0) });

    const inst = container.instantiateModelsToScene((n) => `${kind}_${n}`, false);
    this.visual = new TransformNode(`ev_${kind}`, scene);
    inst.rootNodes.forEach((rn) => (rn.parent = this.visual));
    this.visual.rotationQuaternion = Quaternion.Identity();
    inst.animationGroups.forEach((g) => {
      g.stop();
      for (const ta of g.targetedAnimations) {
        ta.animation.enableBlending = true;
        ta.animation.blendingSpeed = 0.15;
      }
      // instantiate prefixes names; normalize
      const base = g.name.split("_").slice(-2).join("_").includes("e_")
        ? g.name.substring(g.name.indexOf("e_"))
        : g.name;
      this.groups.set(base, g);
    });
    this.play("e_idle");
  }

  get position(): Vector3 {
    return this.capsule.position;
  }

  private play(name: string, loop = true, speed = 1) {
    const g = this.groups.get(name);
    if (!g || this.current === g) return;
    this.current?.stop();
    g.start(loop, speed);
    this.current = g;
  }

  hit(damage: number, impulse: Vector3, ragdoll: boolean) {
    if (!this.alive) return;
    // pirate blocks frontal claw hits (not specials)
    if (this.kind === "pirate" && !ragdoll) {
      const fwd = new Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
      const from = impulse.clone();
      from.y = 0;
      if (Vector3.Dot(from.normalize(), fwd) < -0.25) {
        this.mgr.audio.clink();
        this.mgr.state.emit("message", "Blocked! Flank the pirate — or drop it on him.");
        return;
      }
    }
    this.hp -= damage;
    this.mgr.audio.hit();
    this.agg.body.applyImpulse(impulse, this.position);
    if (this.hp <= 0) {
      this.die(impulse, ragdoll);
    } else {
      this.play("e_hit", false, 1.4);
      if (this.brain === "idle" || this.brain === "patrol") this.brain = "aggro";
      setTimeout(() => this.alive && this.play("e_idle"), 400);
    }
  }

  private die(impulse: Vector3, dramatic: boolean) {
    this.alive = false;
    this.brain = "dead";
    this.current?.stop();
    // "action-figure" ragdoll: free the rotation axes and let Havok tumble it
    this.agg.body.setMassProperties({
      inertia: new Vector3(0.6, 0.6, 0.6),
      mass: 40,
    });
    this.agg.body.setAngularDamping(0.4);
    this.agg.body.applyImpulse(
      impulse.scale(dramatic ? 1.6 : 0.9).add(new Vector3(0, dramatic ? 180 : 60, 0)),
      this.position.add(new Vector3(0.1, 0.6, 0.05)), // off-center -> spin
    );
    this.agg.body.setAngularVelocity(
      new Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 12),
    );
    this.mgr.onEnemyDeath(this);
    // sink away after the tumble settles
    setTimeout(() => {
      const fade = setInterval(() => {
        this.visual.position.y -= 0.02;
        if (this.visual.position.y < -3) {
          clearInterval(fade);
          this.dispose();
        }
      }, 50);
      this.agg.dispose();
    }, 3500);
  }

  dispose() {
    this.visual.dispose();
    this.capsule.dispose();
  }

  update(dt: number, player: PlayerController, state: GameState) {
    if (!this.alive) {
      // visual follows tumbling capsule with full rotation
      this.visual.position.copyFrom(this.capsule.position);
      this.visual.position.y -= 0.9;
      if (this.capsule.rotationQuaternion) {
        this.visual.rotationQuaternion!.copyFrom(this.capsule.rotationQuaternion);
      }
      return;
    }
    const stats = STATS[this.kind];
    const toPlayer = player.position.subtract(this.position);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.contactCooldown = Math.max(0, this.contactCooldown - dt);
    const vel = this.agg.body.getLinearVelocity();

    let moveDir: Vector3 | null = null;

    switch (this.brain) {
      case "idle":
      case "patrol": {
        if (dist < stats.sight && this.mgr.activeCount < MAX_ACTIVE) {
          this.brain = "aggro";
          this.mgr.activeCount++;
          break;
        }
        if (this.spawn.patrol && this.spawn.patrol.length > 1) {
          const target = new Vector3(...this.spawn.patrol[this.patrolIdx]);
          const to = target.subtract(this.position);
          to.y = 0;
          if (to.length() < 0.8) {
            this.patrolIdx = (this.patrolIdx + 1) % this.spawn.patrol.length;
          } else {
            moveDir = to.normalize();
            this.play("e_walk", true, 0.9);
          }
        } else {
          this.play("e_idle");
        }
        break;
      }
      case "aggro": {
        if (dist > stats.sight * 1.6) {
          this.brain = "idle";
          this.mgr.activeCount = Math.max(0, this.mgr.activeCount - 1);
          break;
        }
        if (dist < stats.attackRange && this.cooldown === 0) {
          this.brain = "telegraph";
          this.timer = stats.telegraph;
          this.play("e_telegraph", false, 1);
          if (this.kind === "huntress") {
            this.mgr.audio.playClip("shriek", 0.9);
            this.shrieked = true;
          }
          break;
        }
        moveDir = toPlayer.normalize();
        this.play("e_walk", true, 1.2);
        break;
      }
      case "telegraph": {
        this.timer -= dt;
        this.faceToward(toPlayer);
        if (this.timer <= 0) {
          this.brain = "attack";
          this.play("e_attack", false, 1);
          if (this.kind === "frat") {
            this.timer = 0.55;
            const dir = toPlayer.normalize();
            this.agg.body.setLinearVelocity(new Vector3(dir.x * 9, vel.y, dir.z * 9));
          } else if (this.kind === "pirate") {
            this.timer = 0.4;
          } else {
            // huntress pounce: ballistic leap at the bear
            this.timer = 1.0;
            const dir = toPlayer.normalize();
            const arc = Math.random() < 0.4;
            this.pounceVel = new Vector3(dir.x * (arc ? 6 : 9.5), arc ? 9 : 6, dir.z * (arc ? 6 : 9.5));
            this.agg.body.setLinearVelocity(this.pounceVel);
          }
        }
        break;
      }
      case "attack": {
        this.timer -= dt;
        // contact damage window
        if (dist < 1.3 && this.contactCooldown === 0) {
          this.contactCooldown = 1.0;
          this.mgr.onPlayerHit(this, toPlayer.normalize());
        }
        if (this.timer <= 0) {
          this.brain = "recover";
          this.timer = this.kind === "huntress" ? 1.4 : 0.8;
          this.cooldown = this.kind === "frat" ? 1.6 : 2.2;
          this.play("e_idle");
        }
        break;
      }
      case "recover": {
        this.timer -= dt;
        if (this.timer <= 0) this.brain = "aggro";
        break;
      }
    }

    // movement (steering + separation from other enemies)
    if (moveDir) {
      for (const other of this.mgr.enemies) {
        if (other === this || !other.alive) continue;
        const sep = this.position.subtract(other.position);
        sep.y = 0;
        const d = sep.length();
        if (d < 1.2 && d > 0.001) moveDir.addInPlace(sep.normalize().scale(0.8));
      }
      moveDir.normalize();
      const speed = STATS[this.kind].speed;
      this.agg.body.setLinearVelocity(new Vector3(moveDir.x * speed, vel.y, moveDir.z * speed));
      this.faceToward(moveDir);
    } else if (this.brain !== "attack") {
      this.agg.body.setLinearVelocity(new Vector3(vel.x * 0.8, vel.y, vel.z * 0.8));
    }

    // visual follow
    this.visual.position.copyFrom(this.capsule.position);
    this.visual.position.y -= (this.kind === "huntress" ? 1.7 : 1.75) / 2 + 0.4 - 0.88;
    const q = Quaternion.RotationAxis(Vector3.Up(), this.facing);
    Quaternion.SlerpToRef(this.visual.rotationQuaternion!, q, Math.min(1, dt * 8), this.visual.rotationQuaternion!);
  }

  private faceToward(dir: Vector3) {
    if (dir.lengthSquared() < 0.001) return;
    this.facing = Math.atan2(dir.x, dir.z);
  }
}

export class EnemyManager {
  enemies: Enemy[] = [];
  activeCount = 0;
  private containers = new Map<string, AssetContainer>();
  onDeath: ((e: Enemy) => void) | null = null;

  constructor(
    private scene: Scene,
    public state: GameState,
    public audio: AudioBus,
    private player: PlayerController,
    private onPlayerDamaged: (dir: Vector3) => void,
  ) {}

  async loadContainers() {
    for (const kind of ["frat", "pirate", "huntress"] as const) {
      this.containers.set(kind, await LoadAssetContainerAsync(`./models/${kind}.glb`, this.scene));
    }
  }

  spawnAll(spawns: EnemySpawn[]) {
    for (const s of spawns) {
      const c = this.containers.get(s.kind);
      if (!c) continue;
      this.enemies.push(new Enemy(this.scene, s.kind, c, s, this));
    }
  }

  onEnemyDeath(e: Enemy) {
    this.activeCount = Math.max(0, this.activeCount - 1);
    this.onDeath?.(e);
  }

  onPlayerHit(e: Enemy, dir: Vector3) {
    this.onPlayerDamaged(dir);
  }

  update(dt: number) {
    for (const e of this.enemies) e.update(dt, this.player, this.state);
  }

  get hittables(): Hittable[] {
    return this.enemies;
  }
}
