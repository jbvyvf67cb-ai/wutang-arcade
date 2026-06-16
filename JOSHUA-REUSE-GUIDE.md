# Reusing JOSHUA — World-Building & Mechanics Reference

A field guide to the systems in **JOSHUA: A French Quarter Bear Tale**, written
to be imported into a new advanced 3D game repo. It documents what each piece
does, where it lives, the public API surface, and how to lift it cleanly.

- **Source repo:** `jbvyvf67cb-ai/wutang-arcade` (branch
  `claude/joshua-bear-platformer-7jr08s`, the deployable default).
- **Reference commit for these paths:** `a047c4a`.
- **Live build:** https://jbvyvf67cb-ai.github.io/wutang-arcade/
- **The design contract:** `PLAN.md` (level map, economy, the §9 quality
  rubric, milestone history). Read it alongside this doc.

> Paths below are relative to the repo root. Line counts are a rough guide to
> how self-contained each module is. The two systems most worth stealing are
> the **OSM → playable world pipeline** (`tools/map/` + `src/level/quarter.ts`)
> and the **scripted-Blender character pipeline** (`tools/character/`). Almost
> everything else is a small, dependency-light gameplay module you can paste in.

---

## 1. Tech stack & why

| Layer | Choice | Notes for reuse |
|---|---|---|
| Engine | **Babylon.js 8** (`@babylonjs/core`, `@babylonjs/loaders`) | Tree-shaken side-effect imports throughout (e.g. `import "@babylonjs/core/Physics/physicsEngineComponent"`). Keep that style or bundle size explodes. |
| Physics | **Havok WASM** (`@babylonjs/havok`) via `PhysicsAggregate` v2 API | `optimizeDeps.exclude` it in Vite; it needs top-level await to init (see `vite-plugin-top-level-await`). |
| Language/build | TypeScript (strict) + Vite 6 | `tsconfig.json` is strict but `noUnusedLocals:false`. `vite.config.ts` sets `publicDir:"assets"` and `base:"./"` (relative — works on project subpaths like GitHub Pages). |
| Asset authoring | **Blender as `bpy` (headless Python)** | All characters/animations generated, never hand-authored. See §4. |
| Audio | **fluidsynth + FluidR3_GM**, rendered offline to MP3; Web Audio for SFX | See §7. |
| World data | **OpenStreetMap via Overpass**, baked offline to JSON | See §3. The crown jewel. |
| QA | Playwright (pinned 1.56.0) driving a debug API on `window` | See §9. |

`package.json` scripts: `dev`, `build` (`tsc --noEmit && vite build`),
`preview`, `qa`. No framework, no state library — plain classes and an event
bus.

---

## 2. Architecture at a glance

Everything is wired together imperatively in **`src/main.ts`** (496 lines —
the one file that knows about all the others). The boot sequence is the best
map of the codebase; read it top to bottom first. The shape:

```
core/setup.ts      → engine + scene + Havok + device tier
core/input.ts      → unified InputState (keyboard/mouse/touch all feed it)
core/camera.ts     → ArcRotate chase cam, follow-behind + recenter
level/quarter.ts   → builds the whole world from assets/map/quarter.json
player/controller.ts → capsule rigidbody, movement, swim, tank/cam-relative modes
player/bear.ts     → glTF load + animation state machine
combat/combat.ts   → melee, the Groove special, fishbowl, shockwave
ai/enemies.ts      → behavior-tree enemies sharing one Hittable interface
game/state.ts      → GameState + tiny typed event bus
game/collectibles.ts → coins (thin instances), pieces, items, KO spill
level/timeofday.ts → keyframed sun/fog/sky rig, drives "night" amount
level/streetcar.ts → rideable moving platform on a real rail polyline
ui/*               → DOM HUD, minimap, touch controls, assembly minigame
```

**The decoupling pattern worth copying:** systems never call each other
directly. `GameState` (`src/game/state.ts`) is a typed event bus
(`on(ev, fn)` / `emit(ev, v)` over a `GameEvent` string union) plus the
canonical numbers (health, coins, groove, pieces, phase). UI subscribes;
gameplay emits. Swapping the HUD or adding analytics touches nothing else.

---

## 3. ⭐ The OSM → playable world pipeline (the reason you're here)

Turns real OpenStreetMap geography into a merged, culled, physics-backed 3D
world. Three stages: **fetch** (network, once) → **bake** (offline, Python) →
**render** (runtime, TS). The first two are committed so the build is
reproducible offline.

### 3a. Fetch — `tools/map/fetch_osm.py`
Queries the Overpass API for buildings, highways, POIs, water/parks, and the
river, with mirror fallback + exponential backoff. Writes raw responses to
**`assets/map/osm_raw/*.json`** (committed, ~3.8 MB). Edit the `BBOX` and the
`QUERIES` dict to retarget any city.

### 3b. Bake — `tools/map/build_map.py` (the heavy lifting, pure Python)
Reads `osm_raw/`, emits **`assets/map/quarter.json`** (~0.5 MB). What it does,
all offline so the runtime ships zero geometry math:
- **Project** lon/lat → local meters; **rotate** so a chosen street runs along
  +Z; **scale** (`GAME_SCALE = 0.65`) for game feel; flip so the river is +X.
- **Clip** to the neighborhood using boundary streets.
- **Triangulate** every building footprint with ear-clipping
  (`ear_clip()` — ships precomputed triangles; no runtime triangulator).
- **Match landmarks**: a curated dict of ~50 famous places matched to OSM
  features by fuzzy name, with hand-entered fallback coordinates. This is how
  you get named hero buildings ("St. Louis Cathedral") out of anonymous OSM
  polygons.
- Derive **street centerlines, intersections (for street-name signs), parks,
  the river polygon, the land polygon (ends at the shoreline), and tram rails**.
- Curated styling table `tools/map/LANDMARKS.md` (researched colors/stories/
  balcony types) feeds per-landmark tints.

Run: `python3 tools/map/build_map.py`. Deterministic — same input, same output.

### 3c. The data contract — `assets/map/quarter.json`
This is the portable interface between bake and render. Top-level keys:
`meta` (`scale`, `origin`, `rotationRad`, `flipX`, `bounds`, `attribution`),
`buildings` (1880; each `{id, pts[], tri[], lv, name, c, f}`), `streets` (359),
`intersections` (155), `pois` (604), `parks` (24), `river`, `land`, `trams`,
`shoreline`, `landmarks` (53). Coordinates are flat `[x,z,x,z,...]` arrays.
The full TS type is `QuarterData` in `src/level/quarter.ts:25`.

### 3d. Render — `src/level/quarter.ts` (1314 lines, the biggest module)
`export async function buildQuarter(scene): Promise<QuarterResult>` consumes
`quarter.json` and produces the world. Techniques to lift:
- **Custom `Buf` class** (`quarter.ts:130`) accumulates positions/indices/
  normals/uv/**vertex colors** and bakes one `VertexData` per material — the
  core of staying under the draw-call budget on a ~1 km map.
- **Chunked merge + distance culling**: geometry is merged into 150 m grid
  chunks (`CHUNK`), each frozen, and toggled by distance in `updateCulling(p)`
  (called per-frame from `main.ts`). Keeps ≤120 draw calls in view.
- **Façade atlas UVs**: storefront walls subdivide into atlas tiles; side/back
  walls use a flat stucco material (vertex-tinted) to avoid atlas bleed.
- **Procedural detail from data**: iron balconies on gallery streets, gas
  lamps, **signage drawn at runtime with `DynamicTexture`** into a shared atlas
  (real business + street names → no texture files), cathedral spires, Jackson
  Square fence/statue, Moonwalk steps.
- **One physics mesh per chunk** (`PhysicsShapeType.MESH`, mass 0) + a land
  mesh that ends at the shoreline + a riverbed slab.
- Returns `QuarterResult` (`quarter.ts:60`): `root`, `data`, `dynamicProps`,
  `waterMesh`, `interiors`, `interactables`, `landmarkMarkers`, `streetCoins`,
  `tramLine`, `updateCulling`, `setNight`.

**Reuse plan:** keep `tools/map/*` and `quarter.ts` almost verbatim; change the
bbox, the landmark dictionary, and the per-landmark style table. The `Buf` +
chunk-merge + cull pattern is engine-generic and worth extracting into its own
module for any large world, OSM or not.

---

## 4. ⭐ The "No Ovals" character pipeline (scripted Blender)

Doctrine from `PLAN.md §3`: **no character geometry is ever authored in
JS/TS** — every mesh comes from a committed `bpy` script and exports to glTF.
Lives in `tools/character/`:

- **`bearlib.py`** (266 lines) — the reusable mesh kit. Builds everything from
  "tubes": chains of elliptical cross-section *stations* bridged with quads,
  using **parallel-transport frames** (`_frame()`) so tubes don't pinch/twist.
  `add_tube`, `add_cone`, `add_box`, `add_disc_ear`, `add_sphere`. Blender
  coords: Z-up, faces −Y. **This is the genuinely reusable file** — a
  primitives-free organic-mesh generator for any creature.
- **`joshua.py`** (339 lines) — `build_joshua()`: parametric bear mesh →
  vertex colors → materials → armature rig → weight cleanup.
- **`joshua_anims.py`** (403 lines) — `Animator` class + `build_all_clips()`:
  16 clips keyframed at 24 fps. **The sign-convention block at the top of this
  file is gold** — it documents which bone rotation does what, the thing that
  otherwise costs hours of trial and error.
- **`humanoid.py`** (350 lines) — `build_humanoid()`/`build_enemy()`/
  `animate_enemy()`: one humanoid rig, costume variants (frat/pirate/huntress)
  via proportions + vertex colors + accessories. Proof the kit generalizes.
- **`build_joshua.py`** — the entry point: `python3 tools/character/build_joshua.py`
  → `assets/models/joshua.glb`. Enemies: `humanoid.py`'s `export_enemy()`.
- **`tools/pipeline/smoke_test.py`** — verifies headless `bpy` can do mesh-from-
  pydata, subsurf, armature + auto-weights, glTF export. Run this first in any
  new environment to confirm the toolchain before building assets.

Setup: `pip install bpy` (it's a real pip package now). Outputs are committed
glTF, so the game runtime never depends on Blender.

**Reuse plan:** `bearlib.py` + `smoke_test.py` transfer directly. Treat
`joshua.py`/`joshua_anims.py`/`humanoid.py` as worked examples of the kit, and
the anim sign-conventions as a cheat sheet.

---

## 5. Player, camera, input (the feel layer)

- **`src/player/controller.ts`** (256) — `PlayerController`: capsule rigidbody
  vs Havok with step offset, slope handling, **coyote time + jump buffer**,
  double jump, ledge assist, buoyancy/swim, KO. Two movement modes share one
  path: **camera-relative WASD** and **analog tank** (touch stick: X turns,
  Y drives along facing, deflection → speed, capped to a jog). Callbacks
  `onJump`/`onDoubleJump`/`onLand`. `RUN_SPEED` exported. The "limp glide"
  class of bug (analog speed churning the animation rate) is solved here +ts in
  bear.ts — see those comments before touching it.
- **`src/player/bear.ts`** (117) — `Bear`: glTF load + an animation state
  machine deliberately built for **iOS Safari reliability**: no blend
  (instant clip switches), one-shots end via `onAnimationGroupEndObservable`,
  a watchdog restarts dropped clips, animation speed is **quantized** before
  writing `speedRatio`, and a fall-pose **hysteresis** prevents 1-frame ground
  flicker. These are hard-won; keep the comments.
- **`src/core/camera.ts`** (115) — `ChaseCamera`: ArcRotate lazy chase, follows
  *behind the player's facing*, goes manual on drag, `C`/⌖ recenters. **Heads-
  up:** the ArcRotate heading is `-alpha - π/2` (not `+alpha + π/2`) — getting
  this reflected parks the camera beside the player; there's a comment.
- **`src/core/input.ts`** (114) — one `InputState` interface fed identically by
  keyboard, mouse, and the touch UI. Edge-triggered actions (`jumpPressed`,
  etc.) are consumed each frame via `consume()`. Clean pattern for cross-device
  input.
- **`src/ui/touch.ts`** (171) — virtual stick + action buttons. **iOS lessons
  baked in:** `touch-action:none`, never trust pointer capture (track via
  window events), clamp the stick vector to its radius so dragging past the rim
  reads as "full", not "released".

---

## 6. Gameplay systems (small, liftable modules)

- **`src/game/state.ts`** (110) — `GameState` + `GameEvent` union. The hub.
  Health, coins, the "Groove" meter, pieces, phase machine, KO/spill logic,
  style rating. Copy this pattern even if you keep nothing else.
- **`src/combat/combat.ts`** (250) — melee combo, the **Groove special**
  (movement charges a meter → dance → radial shockwave with real Havok
  impulses), the fishbowl power-up, slash VFX. `Hittable` interface
  (`{position, alive, hit()}`) is the contract enemies implement.
  `SHOCKWAVE_RADIUS`, `GROOVE_RATE` exported.
- **`src/ai/enemies.ts`** (334) — `Enemy` (behavior tree: idle/patrol → aggro →
  telegraph → attack → recover) + `EnemyManager`. Per-archetype `STATS` table,
  `MAX_ACTIVE` aggro cap for mobile, action-figure ragdoll on death. Enemies
  implement `Hittable`, so combat doesn't know their types.
- **`src/game/collectibles.ts`** (233) — coins as **thin instances** (one mesh,
  thousands of matrices), pickup, the KO physics spill, items, and collage
  pieces. The thin-instance approach is the reusable bit for any scatter of
  many identical pickups.
- **`src/level/timeofday.ts`** (99) — `TimeOfDay`: keyframed sun direction/
  color, fog, sky, clear color across a day; exposes a 0..1 `night` amount that
  drives lamp/neon emissive via `quarter.ts`'s `setNight`. Drop-in dynamic
  lighting clock.
- **`src/level/streetcar.ts`** (90) — `Streetcar`: a kinematic platform that
  follows a polyline (the real OSM tram rails) and carries the player. Generic
  moving-platform recipe.

---

## 7. Audio — `src/audio/audio.ts` + `tools/audio/`

- **`src/audio/audio.ts`** (153) — `AudioBus`: Web Audio with **iOS unlock +
  keep-alive** (resumes the context on every interaction and on
  `visibilitychange` — the fix for "no sound on iPhone"), zone music with 2 s
  crossfades, and procedural SFX (coins, hits, shockwave) synthesized inline so
  there are no per-effect files.
- **`tools/audio/make_music.py`** (286) — arranges **public-domain**
  compositions in code and renders them with fluidsynth + FluidR3_GM to
  seamless-loop MP3s (provenance documented in the docstring + a committed
  `assets/audio/music/manifest.json`). Zero recording-copyright risk.
- **`tools/audio/make_shriek.py`** — espeak-ng → pitch-warp/ring-mod/reverb for
  a one-off voice line. Needs `apt-get install fluidsynth fluid-soundfont-gm
  espeak-ng`.

The **provenance discipline** (PD compositions, render your own, document why
it's legal) is the transferable part if your game ships music.

---

## 8. Procedural textures — `tools/textures/make_textures.py`
(208) Generates the façade atlas (12 variants), emissive signs, and the road
texture with PIL → `assets/textures/*.png` (committed). Useful as a pattern for
"don't ship a texture artist, ship a script."

---

## 9. The executable rubric (how quality stays real)

- **`qa/playwright/rubric.spec.ts`** — 16 gates run against the built game:
  zero console errors, clip manifest, collision sampling across the map, ≥30
  landmarks within 25 m of their OSM positions, ≥6 interiors, time-of-day
  advance, river swim, shockwave ragdolls, fishbowl rules, KO spill, full
  playthrough to the end card, draw-call budget. The game exposes a debug API
  on `window` for this — `__player`, `__state`, `__enemies`, `__combat`,
  `__camera`, `__bear`, `__time`, `__audio`, `__input`, `__tp(x,y,z)`,
  `__freecam(...)`, `__unlock()`, `__telemetry`, `__landmarks`, `__interiors`.
  **Build the same `window.__*` test surface into your game from day one** — it
  makes headless verification of a 3D game actually possible.
- **`qa/shot.mjs`** — quick screenshot harness (drive + teleport + capture).
- **`qa/screenshots/`** — committed evidence (bear fidelity angles + a world
  tour). Caveat: software-GL in CI runs at ~4 fps, so absolute-fps gates are
  meaningless headless; the rubric checks *behavior and budgets*, not fps.
- **`.github/workflows/deploy.yml`** — build + bundle-size gate → GitHub Pages;
  the rubric job is informational (CI has no real WebGL).

---

## 10. What to lift first (priority order)

1. **`tools/map/` + `src/level/quarter.ts` + the `quarter.json` contract** —
   the OSM→world pipeline. Highest-value, most novel, cleanly separable.
2. **`tools/character/bearlib.py`** (+ `smoke_test.py`) — primitives-free
   creature mesh kit, with `joshua*.py`/`humanoid.py` as examples.
3. **`src/game/state.ts` event-bus pattern** — trivial to adopt, pays off
   immediately in decoupling.
4. **`src/player/controller.ts` + `bear.ts` + `core/input.ts`/`touch.ts`** —
   if you want the Banjo-style feel and cross-device input, take them as a set;
   the iOS-reliability comments are the value.
5. **`combat.ts` / `enemies.ts` via the `Hittable` interface** — the
   combat↔enemy decoupling.
6. **`timeofday.ts`, `streetcar.ts`, `audio.ts`** — independent drop-ins.
7. **The `window.__*` debug surface + Playwright rubric** — adopt the *idea*
   even if you rewrite the gates.

## 11. Gotchas carried over from this build
- Babylon imports are deep/side-effecting on purpose — don't "tidy" them to
  barrel imports or tree-shaking breaks and the bundle balloons.
- Havok needs top-level await at init (Vite plugin + `optimizeDeps.exclude`).
- iOS Safari: never blend animations, never trust pointer capture, never write
  `speedRatio` every frame, keep the AudioContext resumed on interaction. All
  four are already solved in the files above — read the comments before
  refactoring.
- `vite.config.ts` uses `base:"./"` and `publicDir:"assets"`; asset URLs are
  relative (`./models/...`). Match that or deployments to a subpath break.
- The map render does **no** runtime triangulation — if you change the world
  shape, re-run `build_map.py` and commit the new `quarter.json`.

---

*Map data © OpenStreetMap contributors (ODbL) if you reuse the baked world or
the fetch/bake pipeline. Music in `assets/audio/` is rendered from public-domain
compositions; see the manifest.*
