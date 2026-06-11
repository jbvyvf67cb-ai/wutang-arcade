import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { createGameContext } from "./core/setup";
import { Input } from "./core/input";
import { buildGraybox } from "./level/graybox";
import { PlayerController } from "./player/controller";
import { ChaseCamera } from "./core/camera";
import { attachDebug } from "./ui/debug";
import { ZONES } from "./level/layout";

const TIPS = [
  "Waking the bear…",
  "Sweeping last night off Bourbon Street…",
  "Tightening the bow tie…",
  "Chilling the daiquiris (it's 8am)…",
  "Tuning the trombones…",
];

function setLoading(pct: number, tipIndex?: number) {
  const fill = document.getElementById("loading-fill");
  if (fill) fill.style.width = `${pct}%`;
  if (tipIndex !== undefined) {
    const tip = document.getElementById("loading-tip");
    if (tip) tip.textContent = TIPS[tipIndex % TIPS.length];
  }
}

async function boot() {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  const viewerModel = new URLSearchParams(location.search).get("viewer");
  if (viewerModel) {
    const { bootViewer } = await import("./viewer");
    await bootViewer(canvas, viewerModel);
    return;
  }
  setLoading(10, 0);

  const ctx = await createGameContext(canvas);
  const { engine, scene, tier } = ctx;
  setLoading(35, 1);

  // ---- 8am light rig: low warm sun + cool sky fill ----
  const sun = new DirectionalLight("sun", new Vector3(-0.45, -0.55, 0.55), scene);
  sun.position = new Vector3(60, 60, -40);
  sun.intensity = 2.6;
  sun.diffuse = new Color3(1.0, 0.87, 0.68);
  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  sky.intensity = 0.55;
  sky.diffuse = new Color3(0.65, 0.72, 0.85);
  sky.groundColor = new Color3(0.35, 0.3, 0.26);

  const shadows = new ShadowGenerator(tier === "high" ? 2048 : 1024, sun);
  shadows.usePercentageCloserFiltering = tier === "high";
  shadows.bias = 0.002;

  setLoading(55, 2);
  const level = buildGraybox(scene);
  level.dynamicProps.forEach((p) => shadows.addShadowCaster(p));

  setLoading(75, 3);
  const input = new Input(canvas);
  const player = new PlayerController(scene, new Vector3(...ZONES.spawn));
  shadows.addShadowCaster(player.capsule);
  const camera = new ChaseCamera(scene, () => player.position);

  setLoading(95, 4);

  let lastMoveDir: { x: number; z: number } | null = null;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 1 / 20);
    input.poll();
    player.update(dt, input.state, camera.yaw);
    const v = player.aggregate.body.getLinearVelocity();
    lastMoveDir =
      Math.hypot(v.x, v.z) > 2 ? { x: v.x, z: v.z } : null;
    camera.update(dt, input.state, lastMoveDir);
    input.consume();
  });

  attachDebug(engine, scene, () => {
    const p = player.position;
    return `pos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}  state ${player.state}`;
  });

  engine.runRenderLoop(() => scene.render());

  setLoading(100);
  document.getElementById("loading")?.classList.add("done");
  (window as unknown as { __gameReady: boolean }).__gameReady = true;
  (window as unknown as { __player: PlayerController }).__player = player;
}

boot().catch((e) => {
  const tip = document.getElementById("loading-tip");
  if (tip) tip.textContent = `Boot failed: ${e?.message ?? e}`;
  console.error(e);
});
