/**
 * The Riverfront streetcar — runs on the real OSM tram rails along the
 * levee, Canal to Esplanade. Ridable: stand on the roof or the deck and
 * it carries you (main loop adds the platform velocity to the player).
 */
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics/v2";

const SPEED = 6.5;
const PAUSE = 3.5;

export class Streetcar {
  body: Mesh;
  velocity = new Vector3();
  private agg: PhysicsAggregate;
  private cum: number[] = [0];
  private total = 0;
  private s = 0;
  private dir = 1;
  private pause = 0;
  onDing: (() => void) | null = null;

  constructor(scene: Scene, private line: Vector3[]) {
    for (let i = 1; i < line.length; i++) {
      this.total += Vector3.Distance(line[i - 1], line[i]);
      this.cum.push(this.total);
    }
    this.body = MeshBuilder.CreateBox("streetcar", { width: 2.5, height: 3.0, depth: 9 }, scene);
    const mat = new PBRMaterial("streetcar_mat", scene);
    mat.albedoColor = new Color3(0.72, 0.12, 0.12); // the red Riverfront cars
    mat.roughness = 0.4;
    mat.metallic = 0.1;
    this.body.material = mat;
    const roof = MeshBuilder.CreateBox("streetcar_roof", { width: 2.7, height: 0.18, depth: 9.2 }, scene);
    roof.position.y = 1.6;
    roof.parent = this.body;
    const roofMat = new PBRMaterial("streetcar_roofmat", scene);
    roofMat.albedoColor = new Color3(0.85, 0.75, 0.45);
    roofMat.roughness = 0.6;
    roof.material = roofMat;
    const stripe = MeshBuilder.CreateBox("streetcar_stripe", { width: 2.55, height: 0.3, depth: 9.05 }, scene);
    stripe.position.y = 0.6;
    const stripeMat = new StandardMaterial("streetcar_stripemat", scene);
    stripeMat.diffuseColor = new Color3(0.9, 0.8, 0.3);
    stripeMat.emissiveColor = new Color3(0.25, 0.2, 0.05);
    stripe.material = stripeMat;
    stripe.parent = this.body;

    this.body.position = this.at(0);
    this.agg = new PhysicsAggregate(this.body, PhysicsShapeType.BOX, { mass: 0, friction: 0.9 }, scene);
    this.agg.body.disablePreStep = false; // kinematic: we move the node every frame
  }

  private at(s: number): Vector3 {
    s = Math.max(0, Math.min(this.total, s));
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < s) i++;
    const t = (s - this.cum[i - 1]) / Math.max(0.001, this.cum[i] - this.cum[i - 1]);
    const p = Vector3.Lerp(this.line[i - 1], this.line[i], t);
    p.y = 1.55; // deck height over the rails
    return p;
  }

  update(dt: number) {
    if (this.pause > 0) {
      this.pause -= dt;
      this.velocity.setAll(0);
      return;
    }
    const before = this.body.position.clone();
    this.s += this.dir * SPEED * dt;
    if (this.s >= this.total || this.s <= 0) {
      this.dir *= -1;
      this.pause = PAUSE;
      this.onDing?.();
    }
    const p = this.at(this.s);
    const look = this.at(this.s + this.dir * 2);
    this.body.position.copyFrom(p);
    const d = look.subtract(p);
    if (d.lengthSquared() > 0.01) this.body.rotation.y = Math.atan2(d.x, d.z);
    this.velocity = this.body.position.subtract(before).scale(dt > 0 ? 1 / dt : 0);
  }
}
