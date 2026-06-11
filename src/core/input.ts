/** Unified input: keyboard+mouse now; the touch UI (M7) feeds the same state. */
export interface InputState {
  moveX: number; // -1..1 strafe intent (camera-relative)
  moveZ: number; // -1..1 forward intent
  jumpHeld: boolean;
  jumpPressed: boolean; // edge, consumed each frame
  attackPressed: boolean;
  specialPressed: boolean;
  interactPressed: boolean;
  fishbowlPressed: boolean;
  camDX: number; // accumulated orbit deltas, consumed each frame
  camDY: number;
}

export class Input {
  state: InputState = {
    moveX: 0,
    moveZ: 0,
    jumpHeld: false,
    jumpPressed: false,
    attackPressed: false,
    specialPressed: false,
    interactPressed: false,
    fishbowlPressed: false,
    camDX: 0,
    camDY: 0,
  };

  private keys = new Set<string>();
  private dragging = false;
  /** External writers (touch UI) set these each frame instead of keys. */
  touchMove: { x: number; z: number } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "Space") this.state.jumpPressed = true;
      if (e.code === "KeyJ") this.state.attackPressed = true;
      if (e.code === "KeyK") this.state.specialPressed = true;
      if (e.code === "KeyE") this.state.interactPressed = true;
      if (e.code === "KeyF") this.state.fishbowlPressed = true;
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());

    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") {
        this.dragging = true;
        if (e.button === 0) this.state.attackPressed = true;
        if (e.button === 2) this.state.specialPressed = true;
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener("pointerup", () => (this.dragging = false));
    canvas.addEventListener("pointermove", (e) => {
      if (this.dragging || document.pointerLockElement === canvas) {
        this.state.camDX += e.movementX * 0.005;
        this.state.camDY += e.movementY * 0.004;
      }
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Call once per frame before systems read, after they read call consume(). */
  poll() {
    if (this.touchMove) {
      this.state.moveX = this.touchMove.x;
      this.state.moveZ = this.touchMove.z;
    } else {
      this.state.moveX =
        (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
        (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
      this.state.moveZ =
        (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
        (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    }
    this.state.jumpHeld = this.keys.has("Space") || this.touchJumpHeld;
  }

  touchJumpHeld = false;

  consume() {
    this.state.jumpPressed = false;
    this.state.attackPressed = false;
    this.state.specialPressed = false;
    this.state.interactPressed = false;
    this.state.fishbowlPressed = false;
    this.state.camDX = 0;
    this.state.camDY = 0;
  }
}
