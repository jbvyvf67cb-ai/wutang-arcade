import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsRaycastResult } from "@babylonjs/core/Physics/physicsRaycastResult";
import { PhysicsEngine } from "@babylonjs/core/Physics/v2/physicsEngine";
import { InputState } from "./input";

const DEFAULT_RADIUS = 7.5;
const MIN_BETA = 0.6;
const MAX_BETA = 1.45;

/** Banjo-style lazy chase camera with manual orbit and physics-aware zoom. */
export class ChaseCamera {
  camera: ArcRotateCamera;
  private rayResult = new PhysicsRaycastResult();
  private targetRadius = DEFAULT_RADIUS;

  constructor(
    private scene: Scene,
    private getTarget: () => Vector3,
  ) {
    this.camera = new ArcRotateCamera(
      "chase",
      -Math.PI / 2,
      1.15,
      DEFAULT_RADIUS,
      getTarget().add(new Vector3(0, 1.3, 0)),
      scene,
    );
    this.camera.minZ = 0.1;
    this.camera.maxZ = 400;
    this.camera.fov = 0.95;
    scene.activeCamera = this.camera;
  }

  /** yaw the player's "camera-relative forward" derives from */
  get yaw(): number {
    return this.camera.alpha + Math.PI / 2;
  }

  private shake = 0;
  addShake(s: number) {
    this.shake = Math.min(1, this.shake + s);
  }

  update(dt: number, input: InputState, playerMovingDir: { x: number; z: number } | null) {
    // manual orbit
    this.camera.alpha -= input.camDX;
    this.camera.beta = Math.min(MAX_BETA, Math.max(MIN_BETA, this.camera.beta + input.camDY));

    // lazy auto-follow: drift behind movement when the user isn't orbiting
    if (playerMovingDir && Math.abs(input.camDX) < 0.0001) {
      const desiredAlpha = Math.atan2(playerMovingDir.z, playerMovingDir.x) + Math.PI;
      let diff = desiredAlpha - this.camera.alpha;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.camera.alpha += diff * Math.min(1, dt * 1.2);
    }

    // smooth target follow (+ shake)
    const want = this.getTarget().add(new Vector3(0, 1.3, 0));
    if (this.shake > 0.001) {
      want.addInPlace(
        new Vector3(
          (Math.random() - 0.5) * this.shake * 0.7,
          (Math.random() - 0.5) * this.shake * 0.5,
          (Math.random() - 0.5) * this.shake * 0.7,
        ),
      );
      this.shake *= Math.pow(0.03, dt);
    }
    Vector3.LerpToRef(this.camera.target, want, Math.min(1, dt * 10), this.camera.target);

    // collision: shorten radius if a wall is between target and camera
    const engine = this.scene.getPhysicsEngine() as PhysicsEngine | null;
    if (engine) {
      const dir = this.camera.position.subtract(this.camera.target).normalize();
      const to = this.camera.target.add(dir.scale(DEFAULT_RADIUS + 0.5));
      engine.raycastToRef(this.camera.target, to, this.rayResult);
      this.targetRadius = this.rayResult.hasHit
        ? Math.max(1.6, this.camera.target.subtract(this.rayResult.hitPointWorld).length() - 0.4)
        : DEFAULT_RADIUS;
    }
    this.camera.radius += (this.targetRadius - this.camera.radius) * Math.min(1, dt * 8);
  }
}
