import { Scene } from "@babylonjs/core/scene";
import { Engine } from "@babylonjs/core/Engines/engine";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";

/** ?debug overlay: fps / draw calls / position. Also exposes window.__telemetry for QA. */
export function attachDebug(engine: Engine, scene: Scene, getInfo: () => string) {
  const inst = new SceneInstrumentation(scene);
  inst.captureRenderTime = true;

  const telemetry = {
    fps: 0,
    drawCalls: 0,
    samples: [] as number[],
  };
  (window as unknown as { __telemetry: typeof telemetry }).__telemetry = telemetry;

  const visible = new URLSearchParams(location.search).has("debug");
  let el: HTMLDivElement | null = null;
  if (visible) {
    el = document.createElement("div");
    el.style.cssText =
      "position:fixed;top:8px;left:8px;color:#0f0;background:rgba(0,0,0,.6);font:12px monospace;padding:6px 8px;z-index:50;white-space:pre;pointer-events:none";
    document.body.appendChild(el);
  }

  let acc = 0;
  scene.onAfterRenderObservable.add(() => {
    telemetry.fps = engine.getFps();
    telemetry.drawCalls = inst.drawCallsCounter.current;
    acc += engine.getDeltaTime();
    if (acc > 500) {
      acc = 0;
      telemetry.samples.push(Math.round(telemetry.fps));
      if (telemetry.samples.length > 300) telemetry.samples.shift();
      if (el) {
        el.textContent = `fps ${telemetry.fps.toFixed(0)}  draws ${telemetry.drawCalls}\n${getInfo()}`;
      }
    }
  });
}
