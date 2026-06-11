/**
 * Time of day — the immersion centerpiece. The clock starts at 8 AM and
 * advances with play time and collage progress; the sun rig animates from
 * golden morning through noon to a neon dusk; businesses open on schedule.
 */
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { GameState } from "../game/state";

interface Key {
  h: number;
  sun: number;          // intensity
  sunColor: [number, number, number];
  sky: number;
  skyColor: [number, number, number];
  fog: [number, number, number];
  fogD: number;
  clear: [number, number, number];
  night: number;        // 0..1 lamp/neon amount
}

const KEYS: Key[] = [
  { h: 8, sun: 2.9, sunColor: [1.0, 0.87, 0.68], sky: 0.9, skyColor: [0.65, 0.72, 0.85], fog: [0.82, 0.78, 0.72], fogD: 0.0036, clear: [0.72, 0.78, 0.88], night: 0 },
  { h: 12, sun: 3.3, sunColor: [1.0, 0.98, 0.92], sky: 1.05, skyColor: [0.7, 0.78, 0.92], fog: [0.84, 0.86, 0.9], fogD: 0.0028, clear: [0.62, 0.76, 0.95], night: 0 },
  { h: 16, sun: 2.9, sunColor: [1.0, 0.9, 0.7], sky: 0.95, skyColor: [0.7, 0.74, 0.85], fog: [0.85, 0.8, 0.7], fogD: 0.0032, clear: [0.7, 0.74, 0.85], night: 0 },
  { h: 18.5, sun: 2.1, sunColor: [1.0, 0.62, 0.38], sky: 0.7, skyColor: [0.6, 0.55, 0.7], fog: [0.8, 0.6, 0.5], fogD: 0.004, clear: [0.85, 0.6, 0.5], night: 0.35 },
  { h: 20, sun: 1.0, sunColor: [0.9, 0.45, 0.35], sky: 0.5, skyColor: [0.4, 0.4, 0.62], fog: [0.45, 0.36, 0.45], fogD: 0.0046, clear: [0.36, 0.32, 0.5], night: 0.85 },
  { h: 21.5, sun: 0.4, sunColor: [0.5, 0.45, 0.65], sky: 0.38, skyColor: [0.3, 0.32, 0.5], fog: [0.22, 0.2, 0.3], fogD: 0.0048, clear: [0.16, 0.16, 0.3], night: 1 },
];

export class TimeOfDay {
  /** current game-clock hour, 8 = 8 AM */
  hour = 8;
  private elapsed = 0;
  night = 0;

  constructor(
    private scene: Scene,
    private sun: DirectionalLight,
    private sky: HemisphericLight,
    private state: GameState,
    private onNight: (n: number) => void,
  ) {}

  /** "8:42 AM" for the HUD */
  get clock(): string {
    const h24 = Math.floor(this.hour) % 24;
    const m = Math.floor((this.hour % 1) * 60);
    const ap = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${m.toString().padStart(2, "0")} ${ap}`;
  }

  update(dt: number) {
    this.elapsed += dt;
    // ~0.55h per real minute + 0.55h per collage piece; finale lands ~7-8 PM
    const target = 8 + (this.elapsed / 60) * 0.55 + this.state.pieces.size * 0.55;
    this.hour = Math.min(21.5, Math.max(this.hour, this.hour + (target - this.hour) * Math.min(1, dt * 0.5)));

    // interpolate the key rig
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (this.hour >= KEYS[i].h && this.hour <= KEYS[i + 1].h) {
        a = KEYS[i];
        b = KEYS[i + 1];
        break;
      }
    }
    const t = a === b ? 0 : Math.min(1, Math.max(0, (this.hour - a.h) / (b.h - a.h)));
    const lerp = (x: number, y: number) => x + (y - x) * t;
    const lerp3 = (x: [number, number, number], y: [number, number, number]) =>
      new Color3(lerp(x[0], y[0]), lerp(x[1], y[1]), lerp(x[2], y[2]));

    this.sun.intensity = lerp(a.sun, b.sun);
    this.sun.diffuse = lerp3(a.sunColor, b.sunColor);
    this.sky.intensity = lerp(a.sky, b.sky);
    this.sky.diffuse = lerp3(a.skyColor, b.skyColor);
    const fog = lerp3(a.fog, b.fog);
    this.scene.fogColor = fog;
    this.scene.fogDensity = lerp(a.fogD, b.fogD);
    const cc = lerp3(a.clear, b.clear);
    this.scene.clearColor = new Color4(cc.r, cc.g, cc.b, 1);

    // sun sweeps east -> west (the river is roughly east of the Quarter)
    const dayT = Math.min(1, Math.max(0, (this.hour - 6) / 14)); // 6am..8pm
    const az = Math.PI * (0.15 + 0.7 * dayT);
    const alt = 0.25 + Math.sin(dayT * Math.PI) * 0.85;
    this.sun.direction = new Vector3(-Math.cos(az), -alt, -Math.sin(az) * 0.7).normalize();

    const night = lerp(a.night, b.night);
    if (Math.abs(night - this.night) > 0.01) {
      this.night = night;
      this.onNight(night);
    }
  }
}
