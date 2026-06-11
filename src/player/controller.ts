import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import {
  PhysicsAggregate,
  PhysicsShapeType,
} from "@babylonjs/core/Physics/v2";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine";
import { InputState } from "../core/input";
import { WATER } from "../level/layout";

export type MoveState =
  | "ground"
  | "air"
  | "swim"
  | "dance"
  | "drop"
  | "ko"
  | "cutscene";

const WALK_SPEED = 5.4;
export const RUN_SPEED = 9.5;
const SWIM_SPEED = 4.2;
const JUMP_VELOCITY = 9.2;
const DOUBLE_JUMP_VELOCITY = 8.2;
const GROUND_ACCEL = 58;
const AIR_ACCEL = 20;
const COYOTE = 0.12;
const JUMP_BUFFER = 0.12;
const CAPSULE_RADIUS = 0.45;
const CAPSULE_HEIGHT = 1.7;

export class PlayerController {
  /** Physics capsule (invisible once the bear model is attached). */
  capsule: Mesh;
  aggregate: PhysicsAggregate;
  /** Visual root: bear model parents here; yaw-faces movement. */
  visual: TransformNode;
  state: MoveState = "ground";
  grounded = false;
  swimming = false;
  facing = 0; // yaw radians
  /** distance traveled on ground this frame — feeds the Groove meter */
  groundTravel = 0;
  /** set true while dance/drop/cutscene animations own movement */
  movementLocked = false;

  private vyExtra = 0;
  private coyoteTimer = 0;
  private bufferTimer = 0;
  private doubleJumpReady = true;
  private rayResult = new PhysicsRaycastResult();
  private lastPos = new Vector3();
  onJump: (() => void) | null = null;
  onDoubleJump: (() => void) | null = null;
  onLand: ((impact: number) => void) | null = null;
  private wasGrounded = false;
  private lastVy = 0;

  constructor(
    private scene: Scene,
    spawn: Vector3,
  ) {
    this.capsule = MeshBuilder.CreateCapsule(
      "player_capsule",
      { radius: CAPSULE_RADIUS, height: CAPSULE_HEIGHT },
      scene,
    );
    this.capsule.position.copyFrom(spawn);
    this.capsule.visibility = 0.6;
    this.aggregate = new PhysicsAggregate(
      this.capsule,
      PhysicsShapeType.CAPSULE,
      { mass: 70, friction: 0.0, restitution: 0 },
      scene,
    );
    this.aggregate.body.setMassProperties({ inertia: new Vector3(0, 0, 0) });
    this.aggregate.body.setAngularDamping(1);

    this.visual = new TransformNode("player_visual", scene);
    this.visual.rotationQuaternion = Quaternion.Identity();
    this.lastPos.copyFrom(spawn);
  }

  get position(): Vector3 {
    return this.capsule.position;
  }

  teleport(p: Vector3) {
    this.aggregate.body.disablePreStep = false;
    this.capsule.position.copyFrom(p);
    this.aggregate.body.setLinearVelocity(Vector3.Zero());
    this.scene.onAfterRenderObservable.addOnce(() => {
      this.aggregate.body.disablePreStep = true;
    });
  }

  private checkGround(): boolean {
    const engine = this.scene.getPhysicsEngine() as PhysicsEngine | null;
    if (!engine) return false;
    const from = this.capsule.position.clone();
    const to = from.add(new Vector3(0, -(CAPSULE_HEIGHT / 2 + 0.25), 0));
    engine.raycastToRef(from, to, this.rayResult, {
      shouldHitTriggers: false,
    });
    if (this.rayResult.hasHit && this.rayResult.body !== this.aggregate.body) {
      return true;
    }
    // two offset rays so capsule edges on ledges still count
    for (const off of [new Vector3(CAPSULE_RADIUS * 0.7, 0, 0), new Vector3(-CAPSULE_RADIUS * 0.7, 0, 0), new Vector3(0, 0, CAPSULE_RADIUS * 0.7), new Vector3(0, 0, -CAPSULE_RADIUS * 0.7)]) {
      engine.raycastToRef(from.add(off), to.add(off), this.rayResult);
      if (this.rayResult.hasHit && this.rayResult.body !== this.aggregate.body) return true;
    }
    return false;
  }

  private inWater(): boolean {
    const p = this.capsule.position;
    return (
      p.y - CAPSULE_HEIGHT * 0.25 < WATER.surfaceY &&
      WATER.isIn(p.x, p.z)
    );
  }

  update(dt: number, input: InputState, camYaw: number) {
    const body = this.aggregate.body;
    const vel = body.getLinearVelocity();

    this.swimming = this.inWater();
    this.grounded = !this.swimming && this.checkGround() && vel.y < 2;

    // landing event
    if (this.grounded && !this.wasGrounded && this.lastVy < -3 && this.onLand) {
      this.onLand(-this.lastVy);
    }
    this.wasGrounded = this.grounded;
    this.lastVy = vel.y;

    if (this.movementLocked) {
      body.setLinearVelocity(new Vector3(0, Math.min(vel.y, 0), 0));
      return;
    }

    // ---- desired horizontal velocity, camera-relative ----
    const ix = input.moveX;
    const iz = input.moveZ;
    const mag = Math.min(1, Math.hypot(ix, iz));
    let wishX = 0;
    let wishZ = 0;
    if (mag > 0.01) {
      const ang = camYaw + Math.atan2(ix, iz);
      wishX = Math.sin(ang) * mag;
      wishZ = Math.cos(ang) * mag;
      this.facing = ang;
    }
    const maxSpeed = this.swimming
      ? SWIM_SPEED
      : mag > 0.65
        ? RUN_SPEED
        : WALK_SPEED;
    const accel = this.swimming ? 16 : this.grounded ? GROUND_ACCEL : AIR_ACCEL;
    const targetX = wishX * maxSpeed;
    const targetZ = wishZ * maxSpeed;
    let vx = vel.x + Math.max(-accel * dt, Math.min(accel * dt, targetX - vel.x));
    let vz = vel.z + Math.max(-accel * dt, Math.min(accel * dt, targetZ - vel.z));
    let vy = vel.y;

    // ---- jumping ----
    this.coyoteTimer = this.grounded ? COYOTE : Math.max(0, this.coyoteTimer - dt);
    this.bufferTimer = input.jumpPressed ? JUMP_BUFFER : Math.max(0, this.bufferTimer - dt);
    if (this.grounded) this.doubleJumpReady = true;

    if (this.swimming) {
      // buoyancy: settle the chest at the waterline
      const targetY = WATER.surfaceY - 0.45;
      const depth = targetY - this.capsule.position.y;
      vy = vy * 0.8 + depth * 6 * dt * 60 * 0.05;
      if (input.jumpPressed) vy = 6.5; // hop out
      this.state = "swim";
    } else if (this.bufferTimer > 0 && this.coyoteTimer > 0) {
      vy = JUMP_VELOCITY;
      this.coyoteTimer = 0;
      this.bufferTimer = 0;
      this.onJump?.();
    } else if (this.bufferTimer > 0 && !this.grounded && this.doubleJumpReady) {
      vy = DOUBLE_JUMP_VELOCITY;
      this.doubleJumpReady = false;
      this.bufferTimer = 0;
      this.onDoubleJump?.();
    } else if (!this.grounded) {
      // variable jump height: floatier while rising with jump held
      if (vy > 0 && input.jumpHeld) vy += 5.5 * dt;
      // ledge assist: airborne, pushing into a low wall with headroom -> boost
      if (mag > 0.5 && vy < 2 && vy > -6) this.ledgeAssist(wishX, wishZ, () => (vy = 6.0));
    }

    if (!this.swimming) this.state = this.grounded ? "ground" : "air";
    body.setLinearVelocity(new Vector3(vx, vy, vz));

    // ---- visual follow + facing ----
    this.visual.position.copyFrom(this.capsule.position);
    this.visual.position.y -= CAPSULE_HEIGHT / 2 + CAPSULE_RADIUS - 0.88;
    const targetQ = Quaternion.RotationAxis(Vector3.Up(), this.facing);
    Quaternion.SlerpToRef(this.visual.rotationQuaternion!, targetQ, Math.min(1, dt * 12), this.visual.rotationQuaternion!);

    // ---- groove travel ----
    if (this.grounded) {
      const d = this.capsule.position.subtract(this.lastPos);
      d.y = 0;
      this.groundTravel = d.length();
    } else {
      this.groundTravel = 0;
    }
    this.lastPos.copyFrom(this.capsule.position);
  }

  private ledgeAssist(wx: number, wz: number, boost: () => void) {
    const engine = this.scene.getPhysicsEngine() as PhysicsEngine | null;
    if (!engine) return;
    const dir = new Vector3(wx, 0, wz).normalize();
    const chest = this.capsule.position.clone();
    const head = chest.add(new Vector3(0, 1.0, 0));
    engine.raycastToRef(chest, chest.add(dir.scale(0.8)), this.rayResult);
    const wallAtChest = this.rayResult.hasHit;
    engine.raycastToRef(head, head.add(dir.scale(1.0)), this.rayResult);
    const clearAtHead = !this.rayResult.hasHit;
    if (wallAtChest && clearAtHead) boost();
  }
}
