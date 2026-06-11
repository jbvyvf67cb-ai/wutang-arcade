/** Executable rubric gates (PLAN.md §9 + v2.0 mission gates).
 *
 * Note on waits: CI/software-GL runs at ~4 fps and Babylon steps physics per
 * frame, so simulated time crawls (~8× slower than wall time). Waits are
 * generous for that reason.
 */
import { test, expect, Page } from "@playwright/test";

declare global {
  interface Window {
    __gameReady: boolean;
    __state: any;
    __player: any;
    __enemies: any;
    __combat: any;
    __telemetry: any;
    __time: any;
    __landmarks: Array<{ key: string; x: number; z: number }>;
    __interiors: any[];
    __tp: (x: number, y: number, z: number) => void;
    __unlock: () => void;
    __viewer: any;
  }
}

async function boot(page: Page, url = "/?debug") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__gameReady === true, { timeout: 90000 });
  await page.waitForTimeout(600);
  return errors;
}

test("E: boots with zero console errors", async ({ page }) => {
  const errors = await boot(page);
  await page.waitForTimeout(3000);
  expect(errors).toEqual([]);
});

test("B: all 16 bear clips exported", async ({ page }) => {
  await boot(page, "/?viewer=joshua.glb");
  const clips = await page.evaluate(() => window.__viewer.list().sort());
  expect(clips).toEqual(
    ["attack", "dance", "doublejump", "drop", "fall", "hit", "idle", "idle_bored",
     "jump", "ko", "land", "run", "swim", "victory", "wake", "walk"].sort(),
  );
});

test("C: no fall-throughs at walkable sample points across the Quarter", async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await page.evaluate(() => window.__unlock());
  const points: [number, number, number][] = [
    [-150.5, 1.4, 160],  // spawn, Lafitte's gutter
    [-147, 1.4, 0],      // Bourbon mid
    [-148, 1.4, -336],   // Bourbon 300 block (Lipstixx)
    [-76, 1.4, -60],     // Royal St
    [-4, 1.4, 100],      // Chartres St
    [14, 1.4, -9],       // Jackson Square plaza
    [76, 1.4, 150],      // Decatur at the French Market
    [88, 1.4, 47],       // Café du Monde
    [128, 1.4, -10],     // the Moonwalk
    [-40, 1.4, -24],     // Pirate's Alley
    [96, 3.2, -18],      // Washington Artillery platform
    [1, 1.4, 268],       // Ursuline Convent block
    [-219, 1.4, 100],    // Dauphine St (residential)
    [-300, 1.4, 0],      // toward Rampart
    [-100, 1.4, 430],    // Esplanade end
    [-160, 1.4, -460],   // Canal end
  ];
  for (const [x, y, z] of points) {
    await page.evaluate(([px, py, pz]) => window.__tp(px, py, pz), [x, y, z]);
    await page.waitForTimeout(2600);
    const py = await page.evaluate(() => window.__player.position.y);
    expect(py, `fell through at ${x},${y},${z} (y=${py})`).toBeGreaterThan(-1);
  }
});

test("V2: ≥30 landmarks placed within 25m of their OSM positions", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    const data = await (await fetch("./map/quarter.json")).json();
    const placed = window.__landmarks;
    let ok = 0;
    const misses: string[] = [];
    for (const lm of data.landmarks) {
      if (lm.src !== "osm") continue;
      const m = placed.find((p: any) => p.key === lm.key);
      if (!m) continue;
      const d = Math.hypot(m.x - lm.p[0], m.z - lm.p[1]);
      if (d <= 25) ok++;
      else misses.push(`${lm.key}:${d.toFixed(0)}m`);
    }
    return { ok, misses };
  });
  expect(r.ok, `misses: ${r.misses.join(", ")}`).toBeGreaterThanOrEqual(30);
});

test("V2: ≥6 enterable interiors, rooms stand on solid floors", async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await page.evaluate(() => window.__unlock());
  const keys = await page.evaluate(() => window.__interiors.map((i: any) => i.key));
  expect(keys.length).toBeGreaterThanOrEqual(6);
  for (const key of keys) {
    await page.evaluate((k) => {
      const itr = window.__interiors.find((i: any) => i.key === k);
      itr.open();
      window.__tp(itr.inside.x, itr.inside.y + 0.4, itr.inside.z);
    }, key);
    await page.waitForTimeout(2400);
    const r = await page.evaluate((k) => {
      const itr = window.__interiors.find((i: any) => i.key === k);
      return { open: itr.isOpen(), y: window.__player.position.y };
    }, key);
    expect(r.open, `${key} did not open`).toBe(true);
    expect(r.y, `fell through inside ${key} (y=${r.y})`).toBeGreaterThan(-1);
  }
});

test("V2: time of day advances with collage progress", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    window.__unlock();
    const h0 = window.__time.hour;
    window.__state.pieces.add(901);
    window.__state.pieces.add(902);
    window.__state.pieces.add(903);
    await new Promise((res) => setTimeout(res, 3000));
    return { h0, h1: window.__time.hour, clock: window.__time.clock };
  });
  expect(r.h1).toBeGreaterThan(r.h0 + 0.2);
});

test("V2: the Mississippi is swimmable past the Moonwalk", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__unlock();
    window.__tp(160, 0.5, 0);
  });
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => ({
    swimming: window.__player.swimming,
    y: window.__player.position.y,
  }));
  expect(r.swimming, `not swimming (y=${r.y})`).toBe(true);
  expect(r.y).toBeGreaterThan(-3); // buoyancy holds him at the waterline
});

test("D+F: shockwave ragdolls the Bourbon frat pack with real impulses", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__unlock();
    window.__tp(-146.5, 1.2, -54); // middle of the Cat's Meow pack
  });
  await page.waitForTimeout(2500);
  const before = await page.evaluate(
    () => window.__enemies.enemies.filter((e: any) => e.alive &&
      e.position.subtract(window.__player.position).length() < 8).length,
  );
  expect(before).toBeGreaterThanOrEqual(2);
  await page.evaluate(() => window.__combat["executeDrop"]());
  await page.waitForTimeout(1500);
  const dead = await page.evaluate(() => window.__enemies.enemies.filter((e: any) => !e.alive).length);
  expect(dead).toBeGreaterThanOrEqual(2);
});

test("D: fishbowl costs health, blocked at 1HP, grants invincibility", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    window.__unlock();
    const s = window.__state;
    s.fishbowls = 2;
    s.health = 1;
    window.__combat["activateFishbowl"]();
    const blockedAt1 = s.fishbowlTimer === 0 && s.fishbowls === 2;
    s.health = 6;
    window.__combat["activateFishbowl"]();
    return {
      blockedAt1,
      timer: s.fishbowlTimer,
      healthAfter: s.health,
      invulnerable: s.invulnerable,
    };
  });
  expect(r.blockedAt1).toBe(true);
  expect(r.timer).toBe(15);
  expect(r.healthAfter).toBe(5);
  expect(r.invulnerable).toBe(true);
});

test("D: KO spills half the coins as recoverable physics bodies", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    window.__unlock();
    const s = window.__state;
    s.addCoins(100);
    const spilled = s.spillCoins();
    return { spilled, left: s.coins };
  });
  expect(r.spilled).toBe(50);
  expect(r.left).toBe(50);
});

test("G: full loop — 8 pieces, assembly, busking to $500, end card", async ({ page }) => {
  test.setTimeout(420000);
  await boot(page);
  await page.evaluate(() => window.__unlock());
  // pieces 1-6 by visiting them (7 = Huntress, 8 = the skylight heist)
  const visits: [number, number, number][] = [
    [88, 1.4, 47],        // 1 Café du Monde table
    [14, 2.4, -9],        // 2 Jackson Square stage
    [-142, 1.2, -52],     // 3 Bourbon at St. Peter stoop
    [-138.5, 7.2, 103],   // 4 atop the Clover sign
    [30, 5.7, -50.4],     // 5 Pontalba gallery
    [-83, 5.1, -89],      // 6 Royal St hanging basket
  ];
  for (const [x, y, z] of visits) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const before = await page.evaluate(() => window.__state.pieces.size);
      await page.evaluate(([px, py, pz]) => window.__tp(px, py, pz), [x, y, z]);
      await page.waitForTimeout(900);
      const after = await page.evaluate(() => window.__state.pieces.size);
      if (after > before) break;
    }
  }
  // piece 8: drop through the M.S. Rau skylight, grab the goldfish bowl
  await page.evaluate(() => window.__tp(-62.5, 12, -70.6));
  await page.waitForTimeout(8000);
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate(() => window.__tp(-63, 1.4, -69));
    await page.waitForTimeout(800);
    if (await page.evaluate(() => window.__state.pieces.size >= 7)) break;
  }
  // piece 7: drop it on the Huntress in Pirate's Alley until she falls
  await page.evaluate(() => window.__tp(-41, 1.2, -23));
  await page.waitForTimeout(1500);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__combat["executeDrop"]());
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1500);
  const huntressDead = await page.evaluate(
    () => !window.__enemies.enemies.find((e: any) => e.kind === "huntress").alive,
  );
  expect(huntressDead).toBe(true);
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.evaluate(() => window.__tp(-38, 1.2, -24));
    await page.waitForTimeout(900);
    if (await page.evaluate(() => window.__state.pieces.size >= 8)) break;
  }
  const pieces = await page.evaluate(() => window.__state.pieces.size);
  expect(pieces).toBe(8);
  // to the chalk rectangle in front of Lipstixx -> assembly
  await page.evaluate(() => window.__tp(-157, 1.2, -334));
  await page.waitForFunction(() => document.querySelector("#assembly"), { timeout: 30000 });
  await page.evaluate(() =>
    document.querySelectorAll("#assembly .scrap").forEach((s) => s.dispatchEvent(new Event("pointerdown"))),
  );
  await page.waitForFunction(() => document.querySelector("#endcard"), { timeout: 60000 });
  const finale = await page.evaluate(() => ({
    coins: window.__state.coins,
    phase: window.__state.phase,
  }));
  expect(finale.coins).toBeGreaterThanOrEqual(500);
  expect(finale.phase).toBe("win");
});

// ---- gameplay-feel gates (kept from the live playtest) ----

test("FEEL: skeleton visibly animates while moving (no limp glide)", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__unlock());
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(2000);
  const sample = () =>
    page.evaluate(() => {
      const sk = window.__player.visual.getScene().skeletons[0];
      const bone = sk.bones.find((b: any) => b.name.includes("thigh"));
      const m = bone.getWorldMatrix().m;
      return [m[5], m[6], m[9], m[13]];
    });
  const a = await sample();
  await page.waitForTimeout(600);
  const b = await sample();
  await page.keyboard.up("KeyW");
  const delta = a.reduce((s: number, v: number, i: number) => s + Math.abs(v - b[i]), 0);
  expect(delta, "thigh bone did not move while running").toBeGreaterThan(0.01);
  const playing = await page.evaluate(
    () => window.__bear["current"]?.isPlaying && window.__bear["currentName"],
  );
  expect(["walk", "run"]).toContain(playing);
});

test("FEEL: camera auto-follows so you can always turn", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__unlock());
  const a0 = await page.evaluate(() => window.__camera.camera.alpha);
  await page.keyboard.down("KeyA");
  await page.waitForTimeout(3500);
  await page.keyboard.up("KeyA");
  const a1 = await page.evaluate(() => window.__camera.camera.alpha);
  expect(Math.abs(a1 - a0), "camera never followed the turn").toBeGreaterThan(0.25);
});

test("FEEL: kill plane — falling out of the world recovers in-bounds", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(async () => {
    window.__unlock();
    window.__state.addCoins(30);
    const coinsBefore = window.__state.coins;
    window.__tp(-200, -30, 100);
    await new Promise((res) => setTimeout(res, 3000));
    return { y: window.__player.position.y, coins: window.__state.coins, coinsBefore };
  });
  expect(r.y).toBeGreaterThan(-2);
  expect(r.coins).toBeGreaterThanOrEqual(r.coinsBefore);
});

test("FEEL: Groove reaches full within 35s of running", async ({ page }) => {
  await boot(page);
  const m = await page.evaluate(() => window.__metrics);
  const secondsToFull = 1 / (m.grooveRate * m.runSpeed);
  expect(secondsToFull).toBeLessThanOrEqual(35);
  await page.evaluate(() => window.__unlock());
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(3000);
  await page.keyboard.up("KeyW");
  // accrual smoke check only — sim time crawls on software GL, so the
  // threshold is loose; the 35s budget above is the real gate
  const groove = await page.evaluate(() => window.__state.groove);
  expect(groove).toBeGreaterThan(0.008);
});

test("E: perf telemetry + draw call budget on Bourbon", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__unlock();
    window.__tp(-147, 1.2, 0);
  });
  await page.waitForTimeout(4000);
  const t = await page.evaluate(() => window.__telemetry);
  expect(t.drawCalls).toBeLessThanOrEqual(120);
  expect(t.fps).toBeGreaterThan(0); // absolute fps is meaningless on swiftshader
});
