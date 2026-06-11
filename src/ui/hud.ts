/** DOM HUD: drooping bow-tie health, doubloons, Groove bar, pieces, messages. */
import { GameState } from "../game/state";
import { TICKET_PRICE } from "../level/layout";

export class Hud {
  private root: HTMLDivElement;
  private bowtie!: HTMLDivElement;
  private coinsEl!: HTMLDivElement;
  private grooveFill!: HTMLDivElement;
  private grooveWrap!: HTMLDivElement;
  private piecesEl!: HTMLDivElement;
  private msgEl!: HTMLDivElement;
  private fishEl!: HTMLDivElement;
  private msgTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private state: GameState) {
    this.root = document.createElement("div");
    this.root.id = "hud";
    this.root.innerHTML = `
      <style>
        #hud { position: fixed; inset: 0; pointer-events: none; z-index: 20;
               font-family: Georgia, serif; color: #fff;
               text-shadow: 0 1px 3px rgba(0,0,0,.8); }
        #hud .top-left { position: absolute; top: max(10px, env(safe-area-inset-top)); left: 14px; }
        #hud .bowtie { display: flex; gap: 3px; align-items: center; margin-bottom: 6px; }
        #hud .seg { width: 22px; height: 16px; background: #c2273e; border-radius: 3px;
                    border: 1px solid rgba(0,0,0,.4); transition: all .3s; transform-origin: top center; }
        #hud .seg.knot { width: 12px; height: 12px; border-radius: 50%; }
        #hud .seg.lost { background: #4a4a4a; transform: rotate(25deg) translateY(6px) scale(.8); opacity: .5; }
        #hud .coins { font-size: 19px; letter-spacing: .04em; }
        #hud .coins .ticket { opacity: .75; font-size: 14px; }
        #hud .pieces { position: absolute; top: max(10px, env(safe-area-inset-top)); right: 14px;
                       font-size: 17px; text-align: right; }
        #hud .groove { position: absolute; bottom: max(18px, env(safe-area-inset-bottom)); left: 50%;
                       transform: translateX(-50%); width: min(46vw, 300px); }
        #hud .groove .bar { height: 10px; border: 1px solid rgba(255,255,255,.5); border-radius: 6px;
                            overflow: hidden; background: rgba(0,0,0,.4); }
        #hud .groove .fill { height: 100%; width: 0%;
                             background: linear-gradient(90deg,#7a3cc4,#e8488a,#ffb347); transition: width .2s; }
        #hud .groove .label { text-align: center; font-size: 12px; opacity: .8; margin-top: 3px;
                              letter-spacing: .12em; }
        #hud .groove.ready .bar { box-shadow: 0 0 14px #e8488a; animation: hudpulse 0.8s infinite alternate; }
        @keyframes hudpulse { from { filter: brightness(1); } to { filter: brightness(1.6); } }
        #hud .msg { position: absolute; top: 18%; left: 50%; transform: translateX(-50%);
                    font-size: clamp(16px, 2.6vw, 24px); font-style: italic; text-align: center;
                    max-width: 80vw; opacity: 0; transition: opacity .3s; }
        #hud .msg.show { opacity: 1; }
        #hud .fish { position: absolute; bottom: max(50px, env(safe-area-inset-bottom)); left: 50%;
                     transform: translateX(-50%); font-size: 14px; color: #aee6f5; display: none; }
      </style>
      <div class="top-left">
        <div class="bowtie"></div>
        <div class="coins"></div>
      </div>
      <div class="pieces"></div>
      <div class="groove"><div class="bar"><div class="fill"></div></div>
        <div class="label">GROOVE</div></div>
      <div class="msg"></div>
      <div class="fish"></div>
    `;
    document.body.appendChild(this.root);
    this.bowtie = this.root.querySelector(".bowtie")!;
    this.coinsEl = this.root.querySelector(".coins")!;
    this.grooveFill = this.root.querySelector(".fill")!;
    this.grooveWrap = this.root.querySelector(".groove")!;
    this.piecesEl = this.root.querySelector(".pieces")!;
    this.msgEl = this.root.querySelector(".msg")!;
    this.fishEl = this.root.querySelector(".fish")!;

    state.on("health", () => this.renderHealth());
    state.on("coins", () => this.renderCoins());
    state.on("groove", () => this.renderGroove());
    state.on("piece", () => this.renderPieces());
    state.on("fishbowl", () => this.renderFish());
    state.on("message", (m) => this.message(String(m)));
    this.renderHealth();
    this.renderCoins();
    this.renderGroove();
    this.renderPieces();
  }

  private renderHealth() {
    const segs: string[] = [];
    const h = this.state.health;
    // bow tie: 3 left wing segs, knot, 3 right (knot is seg 4)
    for (let i = 0; i < 6; i++) {
      const lost = i >= h;
      segs.push(`<div class="seg ${i === 3 ? "knot" : ""} ${lost ? "lost" : ""}"></div>`);
    }
    this.bowtie.innerHTML = segs.join("");
  }

  private renderCoins() {
    this.coinsEl.innerHTML = `🪙 ${this.state.coins} <span class="ticket">ticket: ${this.state.ticketProgress}</span>`;
  }

  private renderGroove() {
    this.grooveFill.style.width = `${Math.round(this.state.groove * 100)}%`;
    this.grooveWrap.classList.toggle("ready", this.state.grooveReady);
    const label = this.grooveWrap.querySelector(".label")!;
    label.textContent = this.state.grooveReady ? "DROP IT! (K)" : "GROOVE";
  }

  private renderPieces() {
    this.piecesEl.innerHTML = `🧩 ${this.state.pieces.size} / 8<br><span style="font-size:12px;opacity:.7">collage pieces</span>`;
  }

  private renderFish() {
    if (this.state.fishbowlTimer > 0) {
      this.fishEl.style.display = "block";
      const tick = () => {
        if (this.state.fishbowlTimer <= 0) {
          this.fishEl.style.display = "none";
          return;
        }
        this.fishEl.textContent = `🐠 ${this.state.fishbowlTimer.toFixed(1)}s`;
        requestAnimationFrame(tick);
      };
      tick();
    } else if (this.state.fishbowls > 0) {
      this.fishEl.style.display = "block";
      this.fishEl.textContent = `🐠 ×${this.state.fishbowls} (F to wear it)`;
    } else {
      this.fishEl.style.display = "none";
    }
  }

  message(text: string, ms = 3200) {
    this.msgEl.textContent = text;
    this.msgEl.classList.add("show");
    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.msgEl.classList.remove("show"), ms);
  }
}
