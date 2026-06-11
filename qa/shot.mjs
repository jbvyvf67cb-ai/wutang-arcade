// Quick screenshot harness: node qa/shot.mjs <url> <outfile> [actionsJSON]
// actions: [{type:"key",key:"KeyW",ms:1000},{type:"wait",ms:500},{type:"teleport",x,y,z},{type:"cam",alpha,beta,radius}]
import { chromium } from "@playwright/test";

const [url, out, actionsJson] = process.argv.slice(2);
const actions = actionsJson ? JSON.parse(actionsJson) : [];

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto(url);
await page.waitForFunction(() => window.__gameReady === true, { timeout: 60000 });
await page.waitForTimeout(800);

for (const a of actions) {
  if (a.type === "key") {
    await page.keyboard.down(a.key);
    await page.waitForTimeout(a.ms ?? 500);
    await page.keyboard.up(a.key);
  } else if (a.type === "wait") {
    await page.waitForTimeout(a.ms);
  } else if (a.type === "teleport") {
    await page.evaluate(({ x, y, z }) => {
      window.__player.teleport({ x, y, z, copyFrom: undefined } );
    }, a).catch(() => {});
    await page.evaluate(({ x, y, z }) => {
      const { Vector3 } = window.__BABYLON ?? {};
      if (Vector3) window.__player.teleport(new Vector3(x, y, z));
    }, a).catch(() => {});
    await page.waitForTimeout(400);
  } else if (a.type === "eval") {
    const result = await page.evaluate(a.code);
    if (result !== undefined) console.log("eval:", JSON.stringify(result));
    await page.waitForTimeout(a.ms ?? 300);
  }
}

const telemetry = await page.evaluate(() => window.__telemetry ?? null);
await page.screenshot({ path: out });
console.log("telemetry:", JSON.stringify(telemetry));
console.log("errors:", errors.length ? errors : "none");
await browser.close();
process.exit(errors.length ? 2 : 0);
