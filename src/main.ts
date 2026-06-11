import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { createGameContext } from "./core/setup";
import { Input } from "./core/input";
import { buildGraybox } from "./level/graybox";
import { PlayerController } from "./player/controller";
import { Bear } from "./player/bear";
import { ChaseCamera } from "./core/camera";
import { GameState } from "./game/state";
import { Hud } from "./ui/hud";
import { Collectibles } from "./game/collectibles";
import { Combat } from "./combat/combat";
import { AudioBus } from "./audio/audio";
import { EnemyManager } from "./ai/enemies";
import { ENEMIES, LAST_CALL, TICKET_PRICE } from "./level/layout";
import { AssemblyMinigame, showEndCard } from "./ui/assembly";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { attachDebug } from "./ui/debug";
import { ZONES } from "./level/layout";

const TIPS = [
  "Waking the bear…",
  "Sweeping last night off Bourbon Street…",
  "Tightening the bow tie…",
  "Chilling the daiquiris (it's 8am)…",
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
  setLoading(35, 1);

  // ---- 8am light rig: low warm sun + cool sky fill ----
  const sun = new DirectionalLight("sun", new Vector3(-0.45, -0.55, 0.55), scene);
  sun.position = new Vector3(60, 60, -40);
  sun.intensity = 2.6;
  sun.diffuse = new Color3(1.0, 0.87, 0.68);
  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  sky.intensity = 0.55;
  sky.diffuse = new Color3(0.65, 0.72, 0.85);
  sky.groundColor = new Color3(0.35, 0.3, 0.26);

  const shadows = new ShadowGenerator(tier === "high" ? 2048 : 1024, sun);
  shadows.usePercentageCloserFiltering = tier === "high";
  shadows.bias = 0.002;

  // warm 8am haze down the street
  scene.fogMode = 2; // EXP2
  scene.fogDensity = 0.0055;
  scene.fogColor = new Color3(0.82, 0.78, 0.72);

  setLoading(55, 2);
  const level = buildGraybox(scene);
  level.dynamicProps.forEach((p) => shadows.addShadowCaster(p));

  setLoading(75, 3);
  const input = new Input(canvas);
  const player = new PlayerController(scene, new Vector3(...ZONES.spawn));
  const camera = new ChaseCamera(scene, () => player.position);
  const state = new GameState();
  const hud = new Hud(state);

  const bear = await Bear.load(scene, player.visual);
  player.capsule.visibility = 0;
  bear.meshes.forEach((m) => shadows.addShadowCaster(m));
  player.onJump = () => bear.oneShot("jump", 1.4);
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
  const collectibles = new Collectibles(scene, state);
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
  combat.onShockwave = () => audio.shockwave();
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
      hud.message("8/8! Last call gauntlet — get to Lipstixx!", 5000);
    }
  });

  // antiques shop door unlocks once the goldfish bowl (piece 8) is lifted
  collectibles.onPieceCollected = (def) => {
    if (def.id === 8) {
      level.lockedDoor.physicsBody?.dispose();
      level.lockedDoor.dispose();
      hud.message("The shop door clicks open behind you.");
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
    game.onSnap = (n) => audio.pickup();
    game.onComplete = () => {
      // ---- busking finale: the crowd pays for the flight ----
      state.phase = "win";
      bear.oneShot("victory", 1.0);
      hud.message("The morning crowd gathers…", 4000);
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
      const z = player.position.z;
      const respawn =
        z < 70 ? new Vector3(7.5, 1.2, 8) : z < 156 ? new Vector3(7.5, 1.2, 90) : new Vector3(7.5, 1.2, 176);
      player.teleport(respawn);
      state.health = state.maxHealth;
      state.emit("health");
      player.movementLocked = false;
      bear.interrupt();
    }, 2400);
  });

  // ---- opening: wake up in the gutter ----
  player.movementLocked = true;
  bear.oneShot("wake", 1.0);
  setTimeout(() => {
    if (state.phase !== "wake") return;
    player.movementLocked = false;
    bear.interrupt();
    state.phase = "explore";
    hud.message("Bourbon Street. 8:00 AM. Find the 8 collage pieces — and $500 for a flight home.", 6000);
  }, 4200);

  setLoading(95, 4);

  let lastMoveDir: { x: number; z: number } | null = null;
  let wasSwimming = false;
  scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.2);
    input.poll();
    player.update(dt, input.state, camera.yaw);
    const v = player.aggregate.body.getLinearVelocity();
    const horizSpeed = Math.hypot(v.x, v.z);
    lastMoveDir = horizSpeed > 2 ? { x: v.x, z: v.z } : null;
    hurtCooldown = Math.max(0, hurtCooldown - dt);
    combat.update(dt, input.state);
    collectibles.update(dt, player.position);
    enemyMgr.update(dt);

    // music zones
    if (state.phase !== "assembly" && state.phase !== "win") {
      const p = player.position;
      const zone =
        p.x < -12 ? "alley_st_james"
        : p.z < 70 ? "block1_gutter_blues"
        : p.z < 156 ? "block2_tiger_rag"
        : "block3_saints";
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
    camera.update(dt, input.state, lastMoveDir);
    input.consume();
  });

  attachDebug(engine, scene, () => {
    const p = player.position;
    return `pos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}  state ${player.state}`;
  });

  engine.runRenderLoop(() => scene.render());

  setLoading(100);
  document.getElementById("loading")?.classList.add("done");
  (window as unknown as { __gameReady: boolean }).__gameReady = true;
  const w = window as unknown as Record<string, unknown>;
  w.__player = player;
  w.__state = state;
  w.__enemies = enemyMgr;
  w.__combat = combat;
  w.__tp = (x: number, y: number, z: number) => {
    player.teleport(new Vector3(x, y, z));
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
