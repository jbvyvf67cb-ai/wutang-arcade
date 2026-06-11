/** Central game state + simple event bus. */
import { TICKET_PRICE } from "../level/layout";

export type GameEvent =
  | "health" | "coins" | "groove" | "piece" | "fishbowl" | "ko"
  | "message" | "quest" | "win";

export class GameState {
  maxHealth = 6;
  health = 6;
  coins = 0;
  groove = 0; // 0..1
  grooveReady = false;
  pieces = new Set<number>();
  fishbowls = 0; // carried
  fishbowlTimer = 0; // active seconds remaining
  kos = 0;
  secretsFound = new Set<string>();
  startTime = performance.now();
  phase: "wake" | "explore" | "lastcall" | "assembly" | "win" = "wake";

  private listeners = new Map<GameEvent, Array<(v?: unknown) => void>>();

  on(ev: GameEvent, fn: (v?: unknown) => void) {
    const arr = this.listeners.get(ev) ?? [];
    arr.push(fn);
    this.listeners.set(ev, arr);
  }

  emit(ev: GameEvent, v?: unknown) {
    this.listeners.get(ev)?.forEach((fn) => fn(v));
  }

  get invulnerable(): boolean {
    return this.fishbowlTimer > 0;
  }

  damage(n = 1, hyperArmor = false): boolean {
    if (this.invulnerable) return false;
    if (hyperArmor) n = Math.ceil(n * 0.5);
    this.health = Math.max(0, this.health - n);
    this.emit("health");
    if (this.health === 0) {
      this.kos++;
      this.emit("ko");
      return true;
    }
    return false;
  }

  heal(n = 2) {
    this.health = Math.min(this.maxHealth, this.health + n);
    this.emit("health");
  }

  addCoins(n: number) {
    this.coins += n;
    this.emit("coins");
  }

  /** KO spill: lose half, return how many hit the pavement */
  spillCoins(): number {
    const spilled = Math.floor(this.coins / 2);
    this.coins -= spilled;
    this.emit("coins");
    return spilled;
  }

  addGroove(n: number) {
    if (this.grooveReady) return;
    this.groove = Math.min(1, this.groove + n);
    if (this.groove >= 1) this.grooveReady = true;
    this.emit("groove");
  }

  drainGroove(dt: number) {
    if (this.grooveReady || this.groove <= 0) return;
    this.groove = Math.max(0, this.groove - dt * 0.01);
    this.emit("groove");
  }

  spendGroove() {
    this.groove = 0;
    this.grooveReady = false;
    this.emit("groove");
  }

  refundGroove() {
    this.groove = 1;
    this.grooveReady = true;
    this.emit("groove");
  }

  collectPiece(id: number) {
    this.pieces.add(id);
    this.emit("piece", id);
    if (this.pieces.size === 8) {
      this.phase = "lastcall";
      this.emit("quest");
    }
  }

  get ticketProgress(): string {
    return `$${Math.min(this.coins, TICKET_PRICE)} / $${TICKET_PRICE}`;
  }

  styleRating(): "Bronze" | "Silver" | "Gold" {
    return this.coins >= 400 ? "Gold" : this.coins >= 250 ? "Silver" : "Bronze";
  }
}
