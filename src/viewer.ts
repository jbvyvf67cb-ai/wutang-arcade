/** Character viewer (?viewer=joshua.glb): Gate A judging stage.
 * window.__viewer: { setAngle(alpha,beta,radius), play(name), silhouette(), list() }
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import "@babylonjs/loaders/glTF/2.0";

export async function bootViewer(canvas: HTMLCanvasElement, model: string) {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.85, 0.85, 0.88, 1);

  const sun = new DirectionalLight("sun", new Vector3(-0.5, -0.7, 0.5), scene);
  sun.position = new Vector3(5, 8, -5);
  sun.intensity = 2.2;
  sun.diffuse = new Color3(1.0, 0.9, 0.75);
  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  sky.intensity = 0.7;
  sky.diffuse = new Color3(0.7, 0.75, 0.85);
  sky.groundColor = new Color3(0.4, 0.35, 0.3);

  const ground = MeshBuilder.CreateGround("g", { width: 12, height: 12 }, scene);
  const gm = new PBRMaterial("gm", scene);
  gm.albedoColor = new Color3(0.5, 0.48, 0.45);
  gm.roughness = 0.9;
  gm.metallic = 0;
  ground.material = gm;
  ground.receiveShadows = true;

  const shadows = new ShadowGenerator(2048, sun);
  shadows.usePercentageCloserFiltering = true;

  const result = await ImportMeshAsync(`./models/${model}`, scene);
  const meshes = result.meshes;
  meshes.forEach((m: AbstractMesh) => {
    shadows.addShadowCaster(m);
    m.receiveShadows = false;
  });
  const groups: AnimationGroup[] = result.animationGroups;
  groups.forEach((g) => g.stop());

  const cam = new ArcRotateCamera("cam", -Math.PI / 2, 1.35, 4.2, new Vector3(0, 1.0, 0), scene);
  cam.minZ = 0.05;
  cam.wheelPrecision = 30;
  cam.attachControl(canvas, true);
  scene.activeCamera = cam;

  let playing: AnimationGroup | null = null;
  const api = {
    setAngle(alpha: number, beta: number, radius = 4.2, ty = 1.0) {
      cam.alpha = alpha;
      cam.beta = beta;
      cam.radius = radius;
      cam.target.y = ty;
    },
    list() {
      return groups.map((g) => g.name);
    },
    play(name: string, loop = true) {
      playing?.stop();
      const g = groups.find((x) => x.name === name);
      if (g) {
        g.start(loop);
        playing = g;
      }
      return !!g;
    },
    pose(name: string, t: number) {
      playing?.stop();
      const g = groups.find((x) => x.name === name);
      if (g) {
        g.start(false);
        g.goToFrame(g.from + (g.to - g.from) * t);
        g.pause();
        playing = g;
      }
    },
    stop() {
      playing?.stop();
      playing = null;
    },
    silhouette(on: boolean) {
      scene.clearColor = on ? new Color4(1, 1, 1, 1) : new Color4(0.85, 0.85, 0.88, 1);
      ground.setEnabled(!on);
      if (on) {
        const black = new StandardMaterial("black", scene);
        black.diffuseColor = Color3.Black();
        black.specularColor = Color3.Black();
        black.emissiveColor = Color3.Black();
        black.disableLighting = true;
        meshes.forEach((m) => {
          if (m.material) (m as { __origMat?: unknown }).__origMat = m.material;
          if (m.getTotalVertices() > 0) m.material = black;
        });
      } else {
        meshes.forEach((m) => {
          const o = (m as { __origMat?: unknown }).__origMat;
          if (o) m.material = o as never;
        });
      }
    },
  };
  (window as unknown as { __viewer: typeof api }).__viewer = api;

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
  (window as unknown as { __gameReady: boolean }).__gameReady = true;
  document.getElementById("loading")?.classList.add("done");
}
