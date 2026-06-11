/** Sidewalk collage assembly: tap each scrap, it snaps home. 8 taps, 8 thunks. */
import { PIECES } from "../level/layout";

export class AssemblyMinigame {
  private overlay: HTMLDivElement;
  private board!: HTMLDivElement;
  private placed = new Set<number>();
  onComplete: (() => void) | null = null;
  onSnap: ((n: number) => void) | null = null;

  constructor() {
    this.overlay = document.createElement("div");
    this.overlay.id = "assembly";
    this.overlay.innerHTML = `
      <style>
        #assembly { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column;
                    align-items: center; justify-content: center; background: rgba(12,8,6,.88);
                    font-family: Georgia, serif; color: #e8d5a3; }
        #assembly h2 { font-style: italic; font-weight: normal; margin: 0 0 12px;
                       font-size: clamp(16px, 3vw, 24px); }
        #assembly .board { position: relative; background: #1a1714; border: 3px solid #3a3026;
                           box-shadow: 0 12px 60px rgba(0,0,0,.7); }
        #assembly .board img.ghost { position: absolute; inset: 0; width: 100%; height: 100%;
                                     opacity: 0.13; filter: grayscale(.7); }
        #assembly .slot { position: absolute; background-image: var(--img); background-size: var(--bs);
                          background-position: var(--bp); opacity: 0; transition: opacity .45s, transform .45s;
                          transform: scale(1.6) rotate(8deg); }
        #assembly .slot.in { opacity: 1; transform: scale(1) rotate(0deg); }
        #assembly .tray { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap;
                          justify-content: center; max-width: 90vw; }
        #assembly .scrap { width: 64px; height: 64px; background-image: var(--img);
                           background-size: var(--bs); background-position: var(--bp);
                           border: 2px solid #e8d5a3aa; border-radius: 4px; cursor: pointer;
                           box-shadow: 0 4px 14px rgba(0,0,0,.6); transition: transform .15s, opacity .3s;
                           transform: rotate(var(--r)); }
        #assembly .scrap:hover { transform: scale(1.15) rotate(0deg); }
        #assembly .scrap.gone { opacity: 0; pointer-events: none; transform: scale(.3); }
      </style>
      <h2>Place the pieces. Make it whole again.</h2>
      <div class="board"><img class="ghost" src="./collage/collage.png" /></div>
      <div class="tray"></div>
    `;
    this.board = this.overlay.querySelector(".board")!;
  }

  open() {
    document.body.appendChild(this.overlay);
    const W = Math.min(window.innerWidth * 0.55, window.innerHeight * 0.62 * (1086 / 1448));
    const H = W * (1448 / 1086);
    this.board.style.width = `${W}px`;
    this.board.style.height = `${H}px`;
    const tray = this.overlay.querySelector(".tray")!;
    const order = [...PIECES].sort(() => Math.random() - 0.5);
    for (const def of order) {
      const [u0, v0, u1, v1] = def.crop;
      // slot on the board
      const slot = document.createElement("div");
      slot.className = "slot";
      slot.style.left = `${u0 * 100}%`;
      slot.style.top = `${v0 * 100}%`;
      slot.style.width = `${(u1 - u0) * 100}%`;
      slot.style.height = `${(v1 - v0) * 100}%`;
      slot.style.setProperty("--img", "url(./collage/collage.png)");
      slot.style.setProperty("--bs", `${100 / (u1 - u0)}% ${100 / (v1 - v0)}%`);
      slot.style.setProperty("--bp", `${(u0 / (1 - (u1 - u0))) * 100}% ${(v0 / (1 - (v1 - v0))) * 100}%`);
      slot.id = `slot_${def.id}`;
      this.board.appendChild(slot);
      // scrap in the tray
      const scrap = document.createElement("div");
      scrap.className = "scrap";
      scrap.style.setProperty("--img", "url(./collage/collage.png)");
      const ar = (u1 - u0) / (v1 - v0);
      scrap.style.width = `${ar >= 1 ? 76 : 76 * ar}px`;
      scrap.style.height = `${ar >= 1 ? 76 / ar : 76}px`;
      scrap.style.setProperty("--bs", `${100 / (u1 - u0)}% ${100 / (v1 - v0)}%`);
      scrap.style.setProperty("--bp", `${(u0 / (1 - (u1 - u0))) * 100}% ${(v0 / (1 - (v1 - v0))) * 100}%`);
      scrap.style.setProperty("--r", `${(Math.random() - 0.5) * 16}deg`);
      scrap.addEventListener("pointerdown", () => {
        if (this.placed.has(def.id)) return;
        this.placed.add(def.id);
        scrap.classList.add("gone");
        slot.classList.add("in");
        this.onSnap?.(this.placed.size);
        if (this.placed.size === PIECES.length) {
          setTimeout(() => this.finish(), 900);
        }
      });
      tray.appendChild(scrap);
    }
  }

  private finish() {
    this.overlay.style.transition = "opacity 1.2s";
    this.overlay.style.opacity = "0";
    setTimeout(() => {
      this.overlay.remove();
      this.onComplete?.();
    }, 1200);
  }
}

/** End card: stats + the quote + a plane overhead. */
export function showEndCard(stats: {
  minutes: number; coins: number; kos: number; secrets: number; rating: string;
}) {
  const el = document.createElement("div");
  el.innerHTML = `
    <style>
      #endcard { position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column;
                 align-items: center; justify-content: center; text-align: center;
                 background: radial-gradient(ellipse at 50% 30%, #2a3a55 0%, #11131d 75%);
                 color: #e8d5a3; font-family: Georgia, serif; opacity: 0; transition: opacity 2s; }
      #endcard .quote { font-size: clamp(20px, 4vw, 36px); font-style: italic; max-width: 720px;
                        line-height: 1.5; padding: 0 24px; }
      #endcard .attr { opacity: .7; margin-top: 10px; }
      #endcard .plane { font-size: 40px; position: absolute; top: 12%; left: -60px;
                        animation: fly 9s linear forwards; }
      @keyframes fly { to { left: 105%; } }
      #endcard .stats { margin-top: 36px; font-size: 17px; line-height: 1.9; opacity: .9; }
      #endcard .rating { font-size: 26px; margin-top: 14px; color: #ffd76e; }
      #endcard button { margin-top: 30px; font: inherit; font-size: 17px; padding: 10px 26px;
                        background: none; color: #e8d5a3; border: 1px solid #e8d5a388;
                        border-radius: 6px; cursor: pointer; }
    </style>
    <div id="endcard">
      <div class="plane">✈️</div>
      <div class="quote">“Reality is merely another kind of wonder.”</div>
      <div class="attr">— Ram Dass</div>
      <div class="stats">
        Time in the Quarter: ${stats.minutes.toFixed(1)} min<br/>
        Doubloons busked: ${stats.coins} &nbsp;·&nbsp; KOs survived: ${stats.kos}
        &nbsp;·&nbsp; Secrets: ${stats.secrets}/4
      </div>
      <div class="rating">★ ${stats.rating} Flight Home ★</div>
      <button onclick="location.reload()">Wake up again</button>
      <div style="position:absolute;bottom:12px;font-size:12px;opacity:.55">
        Map data © OpenStreetMap contributors (ODbL)
      </div>
    </div>
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      (el.querySelector("#endcard") as HTMLDivElement).style.opacity = "1";
    }),
  );
}
