import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import HavokPhysics from "@babylonjs/havok";
import "@babylonjs/core/Physics/physicsEngineComponent";
import "@babylonjs/core/Engines/Extensions/engine.query";

export type DeviceTier = "high" | "medium" | "low";

export function detectTier(): DeviceTier {
  const isMobile =
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints ?? 0) > 2;
  if (!isMobile) return "high";
  const mem = (navigator as { deviceMemory?: number }).deviceMemory;
  if (mem !== undefined && mem <= 3) return "low";
  return "medium";
}

export interface GameContext {
  engine: Engine;
  scene: Scene;
  canvas: HTMLCanvasElement;
  tier: DeviceTier;
  isTouch: boolean;
}

export async function createGameContext(
  canvas: HTMLCanvasElement,
): Promise<GameContext> {
  const tier = detectTier();
  const engine = new Engine(canvas, true, {
    powerPreference: "high-performance",
    stencil: true,
    adaptToDeviceRatio: false,
  });
  // Cap render resolution by tier; CSS keeps the canvas full-size.
  const dpr = Math.min(window.devicePixelRatio || 1, tier === "high" ? 2 : 1.5);
  engine.setHardwareScalingLevel(1 / dpr);

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.72, 0.78, 0.88, 1);
  scene.ambientColor = new Color3(0.35, 0.33, 0.3);

  const havok = await HavokPhysics();
  const plugin = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, -16, 0), plugin); // heavier-than-earth gravity: platformer feel

  window.addEventListener("resize", () => engine.resize());

  const isTouch =
    "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0;

  return { engine, scene, canvas, tier, isTouch };
}
