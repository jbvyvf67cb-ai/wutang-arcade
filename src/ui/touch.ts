/** Touch controls: left virtual stick, right action cluster, Groove button.
 * Feeds the same Input state the keyboard uses. Targets ≥56px.
 */
import { Input } from "../core/input";
import { GameState } from "../game/state";

export function attachTouchControls(input: Input, state: GameState) {
  const root = document.createElement("div");
  root.id = "touch";
  root.innerHTML = `
    <style>
      #touch { position: fixed; inset: 0; z-index: 15; pointer-events: none;
               -webkit-user-select: none; user-select: none; }
      #touch .stick-zone { position: absolute; left: 0; bottom: 0; width: 45vw; height: 55vh;
                           pointer-events: auto; }
      #touch .stick { position: absolute; width: 110px; height: 110px; border-radius: 50%;
                      border: 2px solid rgba(255,255,255,.35); background: rgba(255,255,255,.08);
                      display: none; }
      #touch .nub { position: absolute; width: 48px; height: 48px; border-radius: 50%;
                    background: rgba(255,255,255,.45); left: 31px; top: 31px; }
      #touch .btn { position: absolute; border-radius: 50%; pointer-events: auto;
                    display: flex; align-items: center; justify-content: center;
                    font: 700 15px Georgia, serif; color: #fff;
                    background: rgba(255,255,255,.14); border: 2px solid rgba(255,255,255,.4);
                    text-shadow: 0 1px 2px #000; touch-action: none; }
      #touch .btn:active { background: rgba(255,255,255,.34); }
      #touch .jump { width: 76px; height: 76px; right: 22px;
                     bottom: calc(110px + env(safe-area-inset-bottom)); }
      #touch .atk  { width: 64px; height: 64px; right: 110px;
                     bottom: calc(40px + env(safe-area-inset-bottom)); }
      #touch .fish { width: 56px; height: 56px; right: 30px;
                     bottom: calc(210px + env(safe-area-inset-bottom)); display: none; }
      #touch .groove-btn { position: absolute; left: 50%; transform: translateX(-50%);
                     bottom: calc(54px + env(safe-area-inset-bottom));
                     width: 84px; height: 84px; border-radius: 50%; pointer-events: auto;
                     display: none; align-items: center; justify-content: center;
                     font: 700 13px Georgia, serif; color: #fff; text-align: center;
                     background: radial-gradient(circle, #e8488a 0%, #7a3cc4 80%);
                     border: 3px solid #fff; box-shadow: 0 0 22px #e8488a;
                     animation: gpulse .7s infinite alternate; touch-action: none; }
      @keyframes gpulse { from { transform: translateX(-50%) scale(1); }
                          to { transform: translateX(-50%) scale(1.12); } }
    </style>
    <div class="stick-zone"><div class="stick"><div class="nub"></div></div></div>
    <button class="btn jump">JUMP</button>
    <button class="btn atk">CLAW</button>
    <button class="btn fish">🐠</button>
    <button class="btn groove-btn">DROP<br/>IT</button>
  `;
  document.body.appendChild(root);

  const zone = root.querySelector(".stick-zone") as HTMLDivElement;
  const stick = root.querySelector(".stick") as HTMLDivElement;
  const nub = root.querySelector(".nub") as HTMLDivElement;
  let stickId: number | null = null;
  let cx = 0, cy = 0;

  zone.addEventListener("pointerdown", (e) => {
    stickId = e.pointerId;
    cx = e.clientX;
    cy = e.clientY;
    stick.style.display = "block";
    stick.style.left = `${cx - 55}px`;
    stick.style.top = `${cy - 55}px`;
    zone.setPointerCapture(e.pointerId);
    input.touchMove = { x: 0, z: 0 };
  });
  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== stickId) return;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    const max = 52;
    const k = len > max ? max / len : 1;
    nub.style.left = `${31 + dx * k}px`;
    nub.style.top = `${31 + dy * k}px`;
    input.touchMove = { x: (dx * k) / max, z: -(dy * k) / max };
  });
  const endStick = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    stick.style.display = "none";
    nub.style.left = "31px";
    nub.style.top = "31px";
    input.touchMove = { x: 0, z: 0 };
  };
  zone.addEventListener("pointerup", endStick);
  zone.addEventListener("pointercancel", endStick);

  const jump = root.querySelector(".jump") as HTMLButtonElement;
  jump.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    input.state.jumpPressed = true;
    input.touchJumpHeld = true;
  });
  jump.addEventListener("pointerup", () => (input.touchJumpHeld = false));
  jump.addEventListener("pointercancel", () => (input.touchJumpHeld = false));

  (root.querySelector(".atk") as HTMLButtonElement).addEventListener("pointerdown", (e) => {
    e.preventDefault();
    input.state.attackPressed = true;
  });

  const fish = root.querySelector(".fish") as HTMLButtonElement;
  fish.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    input.state.fishbowlPressed = true;
  });
  const groove = root.querySelector(".groove-btn") as HTMLButtonElement;
  groove.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    input.state.specialPressed = true;
  });

  // camera orbit: drag on the right half above the buttons
  let camId: number | null = null;
  let lx = 0, ly = 0;
  window.addEventListener("pointerdown", (e) => {
    if (e.clientX > window.innerWidth * 0.45 && e.clientY < window.innerHeight * 0.55 && (e.target as HTMLElement).tagName === "CANVAS") {
      camId = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
    }
  });
  window.addEventListener("pointermove", (e) => {
    if (e.pointerId !== camId) return;
    input.state.camDX += (e.clientX - lx) * 0.007;
    input.state.camDY += (e.clientY - ly) * 0.005;
    lx = e.clientX;
    ly = e.clientY;
  });
  const endCam = (e: PointerEvent) => {
    if (e.pointerId === camId) camId = null;
  };
  window.addEventListener("pointerup", endCam);
  window.addEventListener("pointercancel", endCam);

  // show/hide contextual buttons
  state.on("groove", () => {
    groove.style.display = state.grooveReady ? "flex" : "none";
  });
  state.on("fishbowl", () => {
    fish.style.display = state.fishbowls > 0 && state.fishbowlTimer === 0 ? "flex" : "none";
  });
}
