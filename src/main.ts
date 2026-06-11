import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { createGameContext } from "./core/setup";
import { Input } from "./core/input";
import { buildQuarter } from "./level/quarter";
import { PlayerController } from "./player/controller";
import { Bear } from "./player/bear";
import { ChaseCamera } from "./core/camera";
import { GameState } from "./game/state";
import { Hud } from "./ui/hud";
import { Minimap } from "./ui/minimap";
import { Collectibles } from "./game/collectibles";
import { Combat, GROOVE_RATE } from "./combat/combat";
import { RUN_SPEED } from "./player/controller";
import { AudioBus } from "./audio/audio";
import { EnemyManager } from "./ai/enemies";
import { ENEMIES, LAST_CALL, TICKET_PRICE, ZONES, RESPAWNS, INTERIORS } from "./level/layout";
import { TimeOfDay } from "./level/timeofday";
import { Streetcar } from "./level/streetcar";
import { AssemblyMinigame, showEndCard } from "./ui/assembly";
import { attachTouchControls } from "./ui/touch";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { attachDebug } from "./ui/debug";

const TIPS = [
  "Waking the bear…",
  "Laying 78 squares of the Vieux Carré…",
  "Hanging the ironwork galleries…",
  "Frying beignets (it's 8am)…",
  "Tuning the trombones…",
];

function setLoading(pct: number, tipIndex?: number) {
  const fill = document.getElementById("loading-fill");
  if (fill) fill.style.width = `${pct}%`;
  if (tipIndex !== undefined) {
    const tip = document.getElementById("loading-tip");
    if (tip) tip.textContent = TIPS[tipIndex % TIPS.length];
  }
}

function nearestRespawn(p: Vector3): Vector3 {
  let best = RESPAWNS[0];
  let bd = Infinity;
  for (const r of RESPAWNS) {
    const d = Math.hypot(r[0] - p.x, r[2] - p.z);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return new Vector3(...best);
}

async function boot() {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  const viewerModel = new URLSearchParams(location.search).get("viewer");
  if (viewerModel) {
    const { bootViewer } = await import("./viewer");
    await bootViewer(canvas, viewerModel);
    return;
  }
  setLoading(10, 0);

  const ctx = await createGameContext(canvas);
  const { engine, scene, tier } = ctx;
  setLoading(30, 1);

  // ---- light rig (time-of-day animates it from 8 AM onward) ----
  const sun = new DirectionalLight("sun", new Vector3(-0.45, -0.55, 0.55), scene);
  sun.position = new Vector3(60, 80, -40);
  sun.intensity = 2.6;
  sun.diffuse = new Color3(1.0, 0.87, 0.68);
  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  sky.intensity = 0.55;
  sky.diffuse = new Color3(0.65, 0.72, 0.85);
  sky.groundColor = new Color3(0.35, 0.3, 0.26);

  const shadows = new ShadowGenerator(tier === "high" ? 2048 : 1024, sun);
  shadows.usePercentageCloserFiltering = tier === "high";
  shadows.bias = 0.002;

  scene.fogMode = 2; // EXP2
  scene.fogDensity = 0.0042;
  scene.fogColor = new Color3(0.82, 0.78, 0.72);

  setLoading(45, 2);
  const level = await buildQuarter(scene);
  level.dynamicProps.forEach((p) => shadows.addShadowCaster(p));
  setLoading(70, 3);

  const input = new Input(canvas);
  const player = new PlayerController(scene, new Vector3(...ZONES.spawn));
  const camera = new ChaseCamera(scene, () => player.position);
  camera.camera.maxZ = 700; // see across the river
  const state = new GameState();
  const hud = new Hud(state);
  const minimap = new Minimap(level.data, state);
  const time = new TimeOfDay(scene, sun, sky, state, level.setNight);
  (window as unknown as { __hudMessage?: (m: string) => void }).__hudMessage = (m) =>
    hud.message(m);

  const bear = await Bear.load(scene, player.visual);
  player.capsule.visibility = 0;
  bear.meshes.forEach((m) => shadows.addShadowCaster(m));
  player.onDoubleJump = () => {
    bear.oneShot("doublejump", 1.2);
    state.addGroove(0.04); // style bonus
  };
  player.onLand = (impact) => {
    if (impact > 7) bear.oneShot("land", 1.3);
  };

  const audio = new AudioBus();
  audio.load("shriek", "./audio/huntress_shriek.wav");
  for (const m of [
    "block1_gutter_blues", "block2_tiger_rag", "alley_st_james",
    "block3_saints", "assembly_entertainer",
  ]) {
    audio.load(m, `./audio/music/${m}.mp3`);
  }
  state.on("coins", () => audio.coin());
  state.on("piece", () => audio.pickup());
  player.onJump = () => {
    bear.oneShot("jump", 1.4);
    audio.jump();
  };
  const collectibles = new Collectibles(scene, state, level.streetCoins);
  const combat = new Combat(scene, state, player, bear);

  // ---- enemies ----
  let hurtCooldown = 0;
  const enemyMgr = new EnemyManager(scene, state, audio, player, (dir) => {
    if (hurtCooldown > 0 || state.invulnerable) return;
    hurtCooldown = 1.1;
    audio.hurt();
    camera.addShake(0.25);
    const died = state.damage(1, combat.dancing);
    if (!died && !combat.dancing) {
      bear.oneShot("hit", 1.5);
      player.aggregate.body.applyImpulse(
        dir.scale(220).add(new Vector3(0, 120, 0)),
        player.position,
      );
    }
  });
  await enemyMgr.loadContainers();
  enemyMgr.spawnAll(ENEMIES);
  combat.hittables = enemyMgr.hittables;
  combat.onClawHit = (hit) => {
    if (!hit) audio.clink();
  };

  // piece 7 (pin-up lady) is the Huntress' trophy — hidden until she falls
  const piece7 = collectibles.pieces.find((p) => p.def.id === 7);
  piece7?.mesh.setEnabled(false);
  let lastCallSpawned = false;
  enemyMgr.onDeath = (e) => {
    const burst = e.kind === "huntress" ? 100 : e.kind === "pirate" ? 12 : 7;
    collectibles.spawnBurst(e.position, Math.min(burst, 24));
    state.addCoins(e.kind === "huntress" ? 100 - 24 : 0); // huntress pays the rest directly
    if (e.kind === "huntress") {
      piece7?.mesh.setEnabled(true);
      state.refundGroove();
      hud.message("The Huntress is vanquished. Chris is safe. (Groove refunded!)");
    }
  };
  state.on("quest", () => {
    if (state.phase === "lastcall" && !lastCallSpawned) {
      lastCallSpawned = true;
      enemyMgr.spawnAll(LAST_CALL);
      combat.hittables = enemyMgr.hittables;
      level.interiors.find((i) => i.def.key === "lipstixx")?.open();
      hud.message("8/8! Last call — Lipstixx is lit. Get to the 300 block of Bourbon!", 6000);
    }
  });

  // ---- interiors: doors open as the day rolls on ----
  const msRau = level.interiors.find((i) => i.def.key === "ms_rau");
  collectibles.onPieceCollected = (def) => {
    if (def.id === 8 && msRau && !msRau.isOpen) {
      msRau.open();
      hud.message("The antiques shop door clicks open behind you.");
    }
  };
  let doorHintCooldown = 0;

  // ---- the Riverfront streetcar ----
  const streetcar = level.tramLine.length >= 2 ? new Streetcar(scene, level.tramLine) : null;
  if (streetcar) streetcar.onDing = () => audio.pickup();

  // ---- busking on the Jackson Square stage: drop the Groove for tips ----
  let lastBusk = -999;
  combat.onShockwave = () => {
    audio.shockwave();
    const stage = new Vector3(...ZONES.jacksonStage);
    const t = performance.now() / 1000;
    if (Vector3.Distance(player.position, stage.add(new Vector3(0, 1, 0))) < 6 && t - lastBusk > 45) {
      lastBusk = t;
      const tips = 35 + Math.floor(Math.random() * 16);
      collectibles.spawnBurst(player.position.add(new Vector3(0, 2, 0)), 18);
      state.addCoins(tips - 18);
      hud.message(`The square erupts! The crowd tips ${tips} doubloons 🎺`, 4500);
    }
  };

  // ---- assembly spot: chalk rectangle in front of Lipstixx ----
  const chalk = MeshBuilder.CreateGround("chalk", { width: 2.6, height: 3.4 }, scene);
  chalk.position = new Vector3(...ZONES.assemblySpot);
  chalk.position.y = 0.16;
  const chalkMat = new StandardMaterial("chalkmat", scene);
  chalkMat.diffuseColor = new Color3(0.9, 0.9, 0.85);
  chalkMat.emissiveColor = new Color3(0.25, 0.25, 0.22);
  chalkMat.alpha = 0.35;
  chalk.material = chalkMat;

  let finaleStarted = false;
  const startAssembly = () => {
    if (finaleStarted) return;
    finaleStarted = true;
    state.phase = "assembly";
    player.movementLocked = true;
    audio.playMusic("assembly_entertainer");
    const game = new AssemblyMinigame();
    game.onSnap = () => audio.pickup();
    game.onComplete = () => {
      // ---- busking finale: the crowd pays for the flight ----
      state.phase = "win";
      bear.oneShot("victory", 1.0);
      hud.message("The evening crowd gathers under the neon…", 4000);
      audio.playMusic("block3_saints");
      let shower = 0;
      const interval = setInterval(() => {
        shower++;
        collectibles.spawnBurst(player.position.add(new Vector3((Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4)), 6);
        state.addCoins(Math.ceil((TICKET_PRICE - state.coins) / Math.max(1, 10 - shower)));
        camera.addShake(0.06);
        if (state.coins >= TICKET_PRICE || shower > 14) {
          clearInterval(interval);
          state.coins = Math.max(state.coins, TICKET_PRICE);
          state.emit("coins");
          bear.play("dance", true);
          setTimeout(() => {
            showEndCard({
              minutes: (performance.now() - state.startTime) / 60000,
              coins: state.coins,
              kos: state.kos,
              secrets: state.secretsFound.size,
              rating: state.styleRating(),
            });
            state.emit("win");
          }, 2600);
        }
      }, 700);
    };
    game.open();
  };
  combat.dynamicBodies = level.dynamicProps
    .map((m) => m.physicsBody)
    .filter((b): b is NonNullable<typeof b> => !!b);
  combat.onShake = (s) => camera.addShake(s);

  // ---- KO: Sonic rule — coins spill everywhere, scramble to re-grab ----
  state.on("ko", () => {
    player.movementLocked = true;
    bear.oneShot("ko", 1.0);
    const spilled = state.spillCoins();
    collectibles.spawnBurst(player.position, spilled);
    camera.addShake(0.6);
    hud.message("KO'd! Your doubloons!");
    setTimeout(() => {
      player.teleport(nearestRespawn(player.position));
      state.health = state.maxHealth;
      state.emit("health");
      player.movementLocked = false;
      bear.interrupt();
    }, 2400);
  });

  // ---- opening: wake up in the gutter outside Lafitte's ----
  player.movementLocked = true;
  bear.oneShot("wake", 1.0);
  setTimeout(() => {
    if (state.phase !== "wake") return;
    player.movementLocked = false;
    bear.interrupt();
    state.phase = "explore";
    hud.message("The French Quarter. 8:00 AM. 8 collage pieces, $500, one flight home.", 6000);
    setTimeout(() => {
      if (ctx.isTouch) {
        hud.message("Left stick: move · drag right: camera · follow the orange compass chevron", 6000);
      } else {
        hud.message("WASD move · Space jump ×2 · J claw · K Groove · follow the orange compass chevron", 7000);
      }
    }, 6500);
  }, 4200);

  // first full Groove: teach the special
  let grooveTaught = false;
  state.on("groove", () => {
    if (state.grooveReady && !grooveTaught) {
      grooveTaught = true;
      hud.message(ctx.isTouch ? "GROOVE FULL — hit DROP IT 💥 (on the Jackson Sq stage: tips!)" : "GROOVE FULL — press K to DROP IT 💥 (on the Jackson Sq stage: tips!)", 6500);
    }
  });

  // ---- kill plane: the river is fine, the void is not ----
  scene.onBeforeRenderObservable.add(() => {
    if (player.position.y < -12 && !player.swimming) {
      player.teleport(nearestRespawn(player.position));
      hud.message("Whoa — that's not the Quarter anymore. Back you go.");
    }
  });

  setLoading(95, 4);

  let lastMoveDir: { x: number; z: number } | null = null;
  let wasSwimming = false;
  let openIdx = 0;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.2);
    input.poll();
    player.update(dt, input.state, camera.yaw);

    // streetcar carries the bear
    if (streetcar) {
      streetcar.update(dt);
      const sp = streetcar.body.position;
      const pp = player.position;
      const local = pp.subtract(sp);
      if (Math.abs(local.x) < 2.2 && Math.abs(local.z) < 5.2 && local.y > 0.5 && local.y < 4 && player.grounded) {
        const v = player.aggregate.body.getLinearVelocity();
        player.aggregate.body.setLinearVelocity(v.add(streetcar.velocity.scale(0.96)));
      }
    }

    const v = player.aggregate.body.getLinearVelocity();
    const horizSpeed = Math.hypot(v.x, v.z);
    lastMoveDir = horizSpeed > 0.8 ? { x: v.x, z: v.z } : null;
    hurtCooldown = Math.max(0, hurtCooldown - dt);
    combat.update(dt, input.state);
    collectibles.update(dt, player.position);
    enemyMgr.update(dt);
    time.update(dt);
    level.updateCulling(player.position);
    minimap.update(player.position, camera.yaw, time.clock);

    // open businesses on schedule
    for (const itr of level.interiors) {
      if (!itr.isOpen && itr.def.opens > 0 && itr.def.opens < 90 && time.hour >= itr.def.opens) {
        itr.open();
        hud.message(`${itr.def.label} is open.`, 3500);
      }
    }
    // locked-door hint
    doorHintCooldown = Math.max(0, doorHintCooldown - dt);
    if (doorHintCooldown === 0) {
      openIdx = (openIdx + 1) % level.interiors.length;
      const itr = level.interiors[openIdx];
      if (!itr.isOpen && Vector3.Distance(player.position, itr.doorPos.add(new Vector3(0, 1, 0))) < 3.4) {
        doorHintCooldown = 6;
        hud.message(
          itr.def.opens >= 90
            ? `${itr.def.label} — locked. There's a way over the roof…`
            : `${itr.def.label} opens at ${itr.def.opens > 12 ? itr.def.opens - 12 : itr.def.opens} ${itr.def.opens >= 12 ? "PM" : "AM"}.`,
          3000,
        );
      }
    }

    // walk-over interactables (interior gags)
    const tNow = performance.now() / 1000;
    for (const ia of level.interactables) {
      if (tNow - ia.lastFired < ia.cooldown) continue;
      if (Vector3.DistanceSquared(player.position, ia.pos) < ia.r * ia.r) {
        ia.lastFired = tNow;
        ia.fire();
      }
    }

    // music regions: riverfront brass, Jackson Sq rag, Bourbon stomp, quiet lower Quarter
    if (state.phase !== "assembly" && state.phase !== "win") {
      const p = player.position;
      const nearJackson = Math.hypot(p.x - 25, p.z + 10) < 75;
      const zone =
        Math.hypot(p.x + 41, p.z + 27) < 30 ? "alley_st_james" // the Huntress' alley
        : nearJackson ? "assembly_entertainer"
        : p.x > 95 ? "block3_saints" // the river
        : p.x < -120 ? "block2_tiger_rag" // Bourbon
        : "block1_gutter_blues"; // quiet Royal/Chartres
      audio.playMusic(zone);
    }

    // swim splash on entry
    if (player.swimming && !wasSwimming) audio.splash();
    wasSwimming = player.swimming;

    // assembly trigger
    if (state.phase === "lastcall" && !finaleStarted) {
      const d = Vector3.DistanceSquared(player.position, new Vector3(...ZONES.assemblySpot));
      if (d < 6) startAssembly();
    }
    bear.updateLocomotion(dt, player, horizSpeed);
    camera.update(dt, input.state, lastMoveDir, input.orbitKeys);
    input.consume();
  });

  if (ctx.isTouch) attachTouchControls(input, state);

  attachDebug(engine, scene, () => {
    const p = player.position;
    return `pos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}  ${time.clock}  state ${player.state}`;
  });

  // ---- pause (Esc/P, or tap the badge on touch) ----
  let paused = false;
  const pauseEl = document.createElement("div");
  pauseEl.style.cssText =
    "position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;" +
    "background:rgba(10,8,6,.7);color:#e8d5a3;font:italic 34px Georgia,serif;cursor:pointer";
  pauseEl.textContent = "paused — the trombones wait";
  document.body.appendChild(pauseEl);
  const togglePause = () => {
    paused = !paused;
    pauseEl.style.display = paused ? "flex" : "none";
  };
  pauseEl.addEventListener("pointerdown", togglePause);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" || e.code === "KeyP") togglePause();
  });
  if (ctx.isTouch) {
    const pbtn = document.createElement("div");
    pbtn.textContent = "⏸";
    pbtn.style.cssText =
      "position:fixed;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);" +
      "z-index:30;font-size:22px;color:#fff;opacity:.6;padding:6px 14px";
    pbtn.addEventListener("pointerdown", togglePause);
    document.body.appendChild(pbtn);
  }

  engine.runRenderLoop(() => {
    if (!paused) scene.render();
  });

  setLoading(100);
  document.getElementById("loading")?.classList.add("done");
  (window as unknown as { __gameReady: boolean }).__gameReady = true;
  const w = window as unknown as Record<string, unknown>;
  w.__player = player;
  w.__state = state;
  w.__enemies = enemyMgr;
  w.__combat = combat;
  w.__camera = camera;
  w.__bear = bear;
  w.__time = time;
  w.__landmarks = level.landmarkMarkers;
  w.__interiors = level.interiors.map((i) => ({
    key: i.def.key, label: i.def.label, isOpen: () => i.isOpen,
    inside: { x: i.insidePos.x, y: 1.2, z: i.insidePos.z },
    open: i.open,
  }));
  w.__metrics = { grooveRate: GROOVE_RATE, runSpeed: RUN_SPEED, interiors: INTERIORS.length };
  w.__tp = (x: number, y: number, z: number) => {
    player.teleport(new Vector3(x, y, z));
  };
  w.__freecam = (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => {
    camera.freeze = true;
    camera.camera.target.set(tx, ty, tz);
    camera.camera.setPosition(new Vector3(px, py, pz));
  };
  w.__chasecam = () => {
    camera.freeze = false;
  };
  w.__unlock = () => {
    player.movementLocked = false;
    bear.interrupt();
    if (state.phase === "wake") state.phase = "explore";
  };
}

boot().catch((e) => {
  const tip = document.getElementById("loading-tip");
  if (tip) tip.textContent = `Boot failed: ${e?.message ?? e}`;
  console.error(e);
});
