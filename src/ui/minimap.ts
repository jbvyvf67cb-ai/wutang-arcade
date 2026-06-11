/**
 * Minimap + piece compass — required navigation aid at Quarter scale.
 * The base map (streets/river/parks) is prerendered once to an offscreen
 * canvas from quarter.json, then blitted rotated around the player.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GameState } from "../game/state";
import { PIECES, ZONES } from "../level/layout";
import type { QuarterData } from "../level/quarter";

const SIZE = 170;          // on-screen px
const M_PER_PX = 2.2;      // world meters per base-map pixel

export class Minimap {
  private base: HTMLCanvasElement;
  private el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private clockEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private b: [number, number, number, number];
  private lastHint = "";

  constructor(private data: QuarterData, private state: GameState) {
    this.b = data.meta.bounds;
    const bw = Math.ceil((this.b[2] - this.b[0]) / M_PER_PX);
    const bh = Math.ceil((this.b[3] - this.b[1]) / M_PER_PX);
    this.base = document.createElement("canvas");
    this.base.width = bw;
    this.base.height = bh;
    const bc = this.base.getContext("2d")!;
    bc.fillStyle = "#2a2622";
    bc.fillRect(0, 0, bw, bh);
    const X = (x: number) => (x - this.b[0]) / M_PER_PX;
    const Y = (z: number) => bh - (z - this.b[1]) / M_PER_PX;
    // river
    bc.fillStyle = "#27506b";
    bc.beginPath();
    const rp = data.river.pts;
    bc.moveTo(X(rp[0]), Y(rp[1]));
    for (let i = 2; i < rp.length; i += 2) bc.lineTo(X(rp[i]), Y(rp[i + 1]));
    bc.closePath();
    bc.fill();
    // parks
    bc.fillStyle = "#39512f";
    for (const pk of data.parks) {
      bc.beginPath();
      bc.moveTo(X(pk.pts[0]), Y(pk.pts[1]));
      for (let i = 2; i < pk.pts.length; i += 2) bc.lineTo(X(pk.pts[i]), Y(pk.pts[i + 1]));
      bc.closePath();
      bc.fill();
    }
    // streets
    for (const st of data.streets) {
      bc.strokeStyle = st.name ? "#8d8579" : "#55504a";
      bc.lineWidth = Math.max(1, st.w / M_PER_PX);
      bc.beginPath();
      bc.moveTo(X(st.pts[0]), Y(st.pts[1]));
      for (let i = 2; i < st.pts.length; i += 2) bc.lineTo(X(st.pts[i]), Y(st.pts[i + 1]));
      bc.stroke();
    }

    // DOM
    const wrap = document.createElement("div");
    wrap.id = "minimap";
    wrap.style.cssText =
      `position:fixed;top:max(64px,calc(env(safe-area-inset-top) + 56px));right:12px;z-index:20;` +
      `width:${SIZE}px;pointer-events:none;text-align:center;`;
    this.el = document.createElement("canvas");
    this.el.width = SIZE;
    this.el.height = SIZE;
    this.el.style.cssText =
      `width:${SIZE}px;height:${SIZE}px;border-radius:50%;border:2px solid rgba(232,213,163,.55);` +
      `box-shadow:0 2px 10px rgba(0,0,0,.5);background:#222;`;
    this.clockEl = document.createElement("div");
    this.clockEl.style.cssText =
      "font:bold 14px Georgia,serif;color:#e8d5a3;text-shadow:0 1px 3px #000;margin-top:3px;";
    this.hintEl = document.createElement("div");
    this.hintEl.style.cssText =
      "font:italic 11px Georgia,serif;color:#d8cba8;text-shadow:0 1px 3px #000;margin-top:2px;max-width:170px;";
    wrap.appendChild(this.el);
    wrap.appendChild(this.clockEl);
    wrap.appendChild(this.hintEl);
    document.body.appendChild(wrap);
    this.ctx = this.el.getContext("2d")!;
  }

  /** nearest uncollected piece (for compass + hint) */
  private target(p: Vector3): { x: number; z: number; hint: string } | null {
    if (this.state.phase === "lastcall" || this.state.phase === "assembly") {
      return { x: ZONES.assemblySpot[0], z: ZONES.assemblySpot[2], hint: "Lipstixx — the chalk rectangle. Finish it." };
    }
    let best: { x: number; z: number; hint: string } | null = null;
    let bd = Infinity;
    for (const def of PIECES) {
      if (this.state.pieces.has(def.id)) continue;
      const d = Math.hypot(def.pos[0] - p.x, def.pos[2] - p.z);
      if (d < bd) {
        bd = d;
        best = { x: def.pos[0], z: def.pos[2], hint: def.hint };
      }
    }
    return best;
  }

  update(p: Vector3, camYaw: number, clock: string) {
    const c = this.ctx;
    const half = SIZE / 2;
    c.clearRect(0, 0, SIZE, SIZE);
    c.save();
    c.beginPath();
    c.arc(half, half, half - 2, 0, Math.PI * 2);
    c.clip();
    // rotate map so camera-forward is up
    const px = (p.x - this.b[0]) / M_PER_PX;
    const py = this.base.height - (p.z - this.b[1]) / M_PER_PX;
    c.translate(half, half);
    c.rotate(camYaw + Math.PI);
    c.translate(-px, -py);
    c.drawImage(this.base, 0, 0);
    c.restore();

    const t = this.target(p);
    // pieces as dots
    c.save();
    c.beginPath();
    c.arc(half, half, half - 2, 0, Math.PI * 2);
    c.clip();
    const world2map = (wx: number, wz: number) => {
      const mx = (wx - this.b[0]) / M_PER_PX - px;
      const my = this.base.height - (wz - this.b[1]) / M_PER_PX - py;
      const cos = Math.cos(camYaw + Math.PI), sin = Math.sin(camYaw + Math.PI);
      return [half + mx * cos - my * sin, half + mx * sin + my * cos];
    };
    for (const def of PIECES) {
      if (this.state.pieces.has(def.id)) continue;
      const [sx, sy] = world2map(def.pos[0], def.pos[2]);
      if (Math.hypot(sx - half, sy - half) < half - 6) {
        c.fillStyle = "#ffd76e";
        c.beginPath();
        c.arc(sx, sy, 3.4, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();

    // player arrow (center, pointing up = camera forward)
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(half, half - 7);
    c.lineTo(half - 5, half + 5);
    c.lineTo(half + 5, half + 5);
    c.closePath();
    c.fill();

    // compass chevron to the target on the rim
    if (t) {
      const ang = Math.atan2(t.x - p.x, t.z - p.z) - camYaw + Math.PI;
      const rx = half + Math.sin(ang) * (half - 10);
      const ry = half - Math.cos(ang) * (half - 10);
      c.fillStyle = "#ff9d4d";
      c.save();
      c.translate(rx, ry);
      c.rotate(Math.atan2(rx - half, half - ry));
      c.beginPath();
      c.moveTo(0, -7);
      c.lineTo(-5, 4);
      c.lineTo(5, 4);
      c.closePath();
      c.fill();
      c.restore();
      if (t.hint !== this.lastHint) {
        this.lastHint = t.hint;
        this.hintEl.textContent = `→ ${t.hint}`;
      }
    } else if (this.lastHint) {
      this.lastHint = "";
      this.hintEl.textContent = "";
    }

    this.clockEl.textContent = clock;
  }
}
