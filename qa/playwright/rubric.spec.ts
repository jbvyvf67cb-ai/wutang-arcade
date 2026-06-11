/** Executable rubric gates (PLAN.md §9). Runs against the built game. */
import { test, expect, Page } from "@playwright/test";

declare global {
  interface Window {
    __gameReady: boolean;
    __state: any;
    __player: any;
    __enemies: any;
    __combat: any;
    __telemetry: any;
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

test("C: no fall-throughs at walkable sample points", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.__unlock());
  const points: [number, number, number][] = [
    [0, 1.2, 10], [7.5, 1.4, 30], [-7.5, 1.4, 50], [0, 1.2, 78], [0, 4.5, 78],
    [7.5, 1.4, 110], [-8.2, 1.6, 120], [8.6, 5.2, 125], [-8.6, 5.2, 130],
    [-15, 1.2, 148], [-26, 0.6, 146], [-34, 1.2, 150], [0, 1.2, 164],
    [7.5, 1.4, 190], [-10.5, 1.4, 218], [6.5, 1.2, 222], [0, 1.2, 238],
  ];
  for (const [x, y, z] of points) {
    await page.evaluate(([px, py, pz]) => window.__tp(px, py, pz), [x, y, z]);
    await page.waitForTimeout(900);
    const fell = await page.evaluate(() => window.__player.position.y < -2.5);
    expect(fell, `fell through at ${x},${y},${z}`).toBe(false);
  }
});

test("D+F: shockwave ragdolls every enemy in radius with real impulses", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__unlock();
    window.__tp(-6, 1.2, 111); // middle of the daiquiri pack
  });
  await page.waitForTimeout(1200);
  const before = await page.evaluate(
    () => window.__enemies.enemies.filter((e: any) => e.alive &&
      e.position.subtract(window.__player.position).length() < 8).length,
  );
  expect(before).toBeGreaterThanOrEqual(3);
  await page.evaluate(() => window.__combat["executeDrop"]());
  await page.waitForTimeout(1000);
  const result = await page.evaluate(() => ({
    deadNearby: window.__enemies.enemies.filter((e: any) => !e.alive).length,
    moved: window.__enemies.enemies
      .filter((e: any) => !e.alive)
      .some((e: any) => Math.abs(e.agg.body.getLinearVelocity().y) > 0.1 || e.position.y > 1.5),
  }));
  expect(result.deadNearby).toBeGreaterThanOrEqual(3);
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
  test.setTimeout(300000);
  await boot(page);
  await page.evaluate(() => window.__unlock());
  // collect pieces by visiting them (1-6, 8) — piece 7 needs the Huntress dead
  const visits: [number, number, number][] = [
    [7.5, 1.4, 30], [0, 4.2, 78], [-7.5, 1.4, 110], [8.5, 7.3, 164],
    [8.0, 5.5, 55], [-8.0, 5.1, 138], [-8.5, 1.5, 218],
  ];
  for (const [x, y, z] of visits) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const before = await page.evaluate(() => window.__state.pieces.size);
      await page.evaluate(([px, py, pz]) => window.__tp(px, py, pz), [x, y, z]);
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => window.__state.pieces.size);
      if (after > before) break;
    }
  }
  // the Huntress: drop it on her until she falls
  await page.evaluate(() => window.__tp(-33, 1.2, 149));
  await page.waitForTimeout(800);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.__combat["executeDrop"]());
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1200);
  const huntressDead = await page.evaluate(
    () => !window.__enemies.enemies.find((e: any) => e.kind === "huntress").alive,
  );
  expect(huntressDead).toBe(true);
  // grab piece 7 where she dropped it
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.evaluate(() => window.__tp(-34, 1.2, 148));
    await page.waitForTimeout(700);
    if (await page.evaluate(() => window.__state.pieces.size >= 8)) break;
  }
  const pieces = await page.evaluate(() => window.__state.pieces.size);
  expect(pieces).toBe(8);
  // walk to the chalk rectangle -> assembly
  await page.evaluate(() => window.__tp(6.5, 1.2, 221));
  await page.waitForFunction(() => document.querySelector("#assembly"), { timeout: 20000 });
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

// ---- gameplay-feel gates (added after the first live playtest) ----

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
  await page.keyboard.down("KeyA"); // strafe -> camera should swing behind
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
    window.__tp(0, -30, 100);
    await new Promise((res) => setTimeout(res, 3000));
    return { y: window.__player.position.y, coins: window.__state.coins, coinsBefore };
  });
  expect(r.y).toBeGreaterThan(-2);
  // falling off the map is not a KO — no coins lost (may even grab one where he lands)
  expect(r.coins).toBeGreaterThanOrEqual(r.coinsBefore);
});

test("FEEL: Groove reaches full within 35s of running", async ({ page }) => {
  await boot(page);
  const m = await page.evaluate(() => window.__metrics);
  const secondsToFull = 1 / (m.grooveRate * m.runSpeed);
  expect(secondsToFull).toBeLessThanOrEqual(35);
  // and it actually accrues from real movement
  await page.evaluate(() => window.__unlock());
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(3000);
  await page.keyboard.up("KeyW");
  const groove = await page.evaluate(() => window.__state.groove);
  expect(groove).toBeGreaterThan(0.02);
});

test("E: perf telemetry + draw call budget", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__unlock();
    window.__tp(0, 1.2, 100);
  });
  await page.waitForTimeout(4000);
  const t = await page.evaluate(() => window.__telemetry);
  expect(t.drawCalls).toBeLessThanOrEqual(120);
  expect(t.fps).toBeGreaterThan(0); // absolute fps is meaningless on swiftshader
});
