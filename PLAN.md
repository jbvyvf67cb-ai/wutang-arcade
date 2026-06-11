# JOSHUA — A Bourbon Street Bear Tale

A 3D physics platformer for the web. One bear. One bow tie. One collage to finish.

Hosted on GitHub Pages. Playable with keyboard/mouse, touch (iPhone), and gamepad.

---

## 1. Vision & Pillars

- **The bear is the game.** Joshua is a smart, funny, deeply odd brown bear in a bow tie.
  If he doesn't read as a *bear* — snout, ears, claws, fur, weight — nothing else matters.
- **Banjo-Kazooie soul, modern body.** Movement feel, camera, collect-a-thon loop, and
  musical-gibberish charm of the N64 era, rendered with modern materials and lighting.
  Joshua is much goofier than Banjo: groggy idle sways, overdramatic dances, comedic
  stumbles.
- **Real physics.** Rigidbody character controller, impulse knockback, ragdolling enemies,
  simulated props (trash cans, beads, bottles) — not animation fakery.
- **Smooth on a phone.** A fairly recent iPhone (12-class or better) holds ≥30 fps;
  desktop holds 60. Performance budgets are hard gates, not aspirations.

### Tone

8 AM on Bourbon Street: golden morning light, wet asphalt, dead neon, seagulls and
distant brass. Joshua wakes up in a gutter with a headache and a mission: his collage —
*"Reality is merely another kind of wonder." — Ram Dass* — has been scattered. Find the
pieces. Bring them back to Lipstixx. Place the finished collage on the sidewalk. Art is
restored to the people.

---

## 2. Tech Stack (decided)

| Layer | Choice | Why |
|---|---|---|
| Engine | **Babylon.js 8** | First-class glTF + skeletal animation, built-in physics integration, WebGPU with automatic WebGL2 fallback, strong iOS Safari support. Confirmed: your instinct was right. |
| Physics | **Havok (WASM)** via `@babylonjs/havok` | The same engine AAA games use, shipped as WASM; an order of magnitude faster than cannon/ammo — this is what makes "real physics + mobile" possible at once. |
| Language/build | TypeScript + Vite | Fast builds, tree-shaking keeps the payload inside the mobile budget. |
| Asset authoring | **Blender 5 as a Python module (`bpy`)**, scripted | See §3 — this is the anti-oval insurance policy. |
| Audio | Web Audio API; pre-baked clips committed to the repo + a small procedural synth layer for SFX | No runtime CDN dependencies. |
| Deploy | GitHub Actions → GitHub Pages | Push to main → built → live. Vite `base` configured for project pages. |
| QA harness | Playwright (Chromium + WebKit) | Automated screenshots, fps telemetry, console-error gates — the rubric in §7 is *executed*, not eyeballed. |

**Art direction call:** "realistic" + "runs on iPhone" + "Banjo homage" cannot all be
photorealism — photoreal fur alone would blow the entire frame budget. The target is
**modern stylized realism**: anatomically correct bear proportions and silhouette,
PBR materials, shell/rim fur shading, real-time shadows — think *Banjo-Kazooie HD
remaster*, not *Naughty Dog*. Recognizably, unmistakably a bear; never a balloon animal.

---

## 3. Asset Pipeline — the "No Ovals" Doctrine

The failure mode to kill: characters assembled from primitive spheres/capsules in
engine code. **Rule: no character or enemy geometry is ever authored in JS/TS.**

Pipeline (all scripted, all reproducible, all committed):

1. **Model in Blender via `bpy`** (installed and verified in this environment).
   Python scripts build Joshua from a reference-driven workflow: base mesh → subdivision
   surface → proportional sculpt passes (muzzle, brow, cheek mass, shoulder hump,
   plantigrade paws) → multi-res detail. Scripts live in `tools/character/` so the bear
   is regenerated, never hand-tweaked into unreproducibility.
2. **Rig with a real armature**: spine, neck/head, jaw, ears, 4 limbs with IK,
   finger/claw bones, tail nub, bow-tie bone (it must waggle).
3. **Animate in Blender actions**, export as glTF animation clips (list in §5).
4. **Texture**: baked AO + hand-scripted procedural fur/albedo maps; bow tie gets a
   crisp red satin material. KTX2/Basis compression for mobile texture memory.
5. **Fallback/reference**: GitHub raw fetches work from here, so CC0 rigged quadruped
   bases (Quaternius mirrors, Khronos sample assets) can be pulled as proportion
   references or emergency fallbacks — but the bar in §7.A is judged on the final
   render either way.
6. **Environment kit**: modular French Quarter set (facade pieces, balconies with
   wrought-iron galleries, shutters, gas lamps, signage) built the same scripted way,
   instanced heavily in engine.

The collage itself is in the repo (`assets/collage/collage.png`, 1086×1448). It gets
sliced into **8 collectible pieces** (see §6) and reassembled at full resolution in the
finale.

---

## 4. Joshua: Character & Moveset

### Character

Brown bear, ~1.9 m standing. Red bow tie. Expressive eyes with blink cycles. Walks
upright (Banjo-style) but drops to all-fours for the run — fast, funny, and very bear.
Personality leaks through idle behaviors: scratching, swaying, examining one claw,
briefly falling back asleep if you idle too long (he did just wake up in a gutter).

### Movement (Banjo-Kazooie-derived, physics-backed)

- Walk / run (all-fours sprint), with momentum and slope handling
- Jump with held-button height control; **double jump** with a comedic flail
- Ledge grab + scramble-up
- Ground pound (utility slam, distinct from the special)
- Swim is out of scope for Level 1 (no water deeper than the gutter)

Character controller: capsule rigidbody against Havok with step-offset, slope limits,
and coyote time. Enemies take *impulse-based* knockback scaled by Joshua's velocity —
sprinting into a claw swipe hits harder. Defeated-by-special enemies **ragdoll**.

### Combat

- **Regular attack — "Claw & Order":** 3-hit chain — claw swipe, backhand swipe,
  big haymaker kick. Short range, fast, cancellable into jump.
- **Special attack — "Drop It Like It's Hot":**
  - **Charged by movement.** A *Groove Meter* fills from horizontal distance traveled,
    with bonus multipliers for style (double jumps, ledge scrambles, near-misses).
    Standing still slowly drains it. Full charge ≈ 60–90 s of active play.
  - **On activation:** Joshua stops, hits a 2-second dance (snake hips → shoulder
    bounce → finger point), then *drops it like it's hot* — a low squat slam, palm to
    the pavement, releasing a **large-radius shockwave** (≈8 m) that ragdolls every
    enemy in range, scatters physics props, and rattles the nearest balcony.
  - **Risk/reward:** he is fully vulnerable during the dance. Interrupted = half the
    meter refunded, full comedic face-plant.

### Camera & controls

- Third-person follow camera, Banjo-style lazy chase with manual orbit; collision-aware.
- Desktop: WASD + mouse/keys, Space jump, J/LMB attack, K/RMB special.
- Mobile: left virtual stick, right-side Jump/Attack buttons, special triggered by a
  big pulsing Groove button when full. Camera auto-assist on touch.
- Gamepad: standard twin-stick mapping (nice-to-have, not a gate).

---

## 5. Animation Set (minimum 14 clips)

| # | Clip | Notes |
|---|---|---|
| 1 | Groggy wake-up | Level-opening: stretch, blink, confused look at gutter |
| 2 | Idle | Breathing, weight shifts, occasional scratch |
| 3 | Idle (bored) | Falls half-asleep after 20 s |
| 4 | Walk | Upright, arms swinging |
| 5 | Run | All-fours bear sprint |
| 6 | Jump / 7 Fall / 8 Land | Land has a heavy squash beat |
| 9 | Double-jump flail | Goofy mid-air scramble |
| 10 | Claw combo (3 stages) | Authored as one chain with cancel points |
| 11 | Hit react / KO | |
| 12 | **The Dance** | 2-s charge dance preceding the special |
| 13 | **The Drop** | Squat slam + shockwave pose |
| 14 | Victory / collage placement | Used in the finale cutscene |

---

## 6. Level One: *Bourbon Street, 8 AM*

### The space

Three blocks of Bourbon Street plus one side alley, bookended by soft barriers
(a parade barricade, a street-cleaning truck). Morning light: long warm shadows, wet
asphalt with screen-space puddle reflections (desktop) / cubemap puddles (mobile), dead
neon, scattered beads and last night's cups (physics props). Vertical play: balconies
reachable by stacked crates, AC units, and an unwisely parked pedicab — several collage
pieces are up high. Landmark geography: the **gutter spawn** at one end, **Lipstixx**
glowing faintly at the other.

### Objective loop (8–15 minutes)

1. Wake in the gutter (clip #1, playable immediately after).
2. Explore and fight through three blocks; **collect 8 collage pieces**:

   | Piece | From the collage |
   |---|---|
   | 1 | "REALITY" letter block |
   | 2 | "IS MERELY" |
   | 3 | "ANOTHER KIND OF" |
   | 4 | "WONDER." |
   | 5 | The crow perched on the old man's hat |
   | 6 | The flowers & songbird |
   | 7 | The pin-up lady |
   | 8 | The goldfish bowl (tiny couch included) |

   Pieces float as glowing paper scraps showing their actual crop of `collage.png`.
   Roughly: 3 in plain sight, 3 guarded by enemy clusters, 2 platforming challenges.
3. Return to **Lipstixx**. Sidewalk assembly: a short, satisfying snap-the-pieces
   minigame on a 2D overlay of the real collage.
4. Finale: Joshua steps back, victory animation, camera pulls up the full collage —
   *"Reality is merely another kind of wonder."* — morning brass sting, end card,
   collected-stats screen.

### Enemies

| Enemy | Behavior | Notes |
|---|---|---|
| **Frat Boy** (×8–10) | Wanders in packs of 2–3; charges with a shoulder-tackle; throws a wobbling beer-pong lob at range | Polo, backwards cap, croakies. Ragdolls magnificently |
| **Pirate** (×4–6) | Patrols a route; cutlass swing with a slow telegraph; blocks frontal claw hits — flank or special | Leftover from a bachelor-party booze cruise |
| **The Huntress** (troll mini-boss, ×1) | Guards piece #7 in the alley. Lurks under a balcony; before each pounce she rears back and **shrieks "I AM THE HUNTRESS, AND CHRIS IS MY PREY!"** (pre-baked audio clip — pitched, reverbed, deeply unsettling). Shriek = your dodge window | Drops piece #7 + full Groove refund |

AI: lightweight behavior trees (idle/patrol → aggro → telegraph → attack → recover),
sight cones, and a simple group-aggro cap so mobile never simulates more than ~6 active
enemies (others idle until in range).

### Joshua's health

Bow-tie integrity: 6 hits, shown as the bow tie progressively drooping in the HUD.
Restore by grabbing **beignets** stashed around the level. KO = comedic collapse back
to the gutter, pieces kept, enemies respawn on the current block.

---

## 7. Complexity & Quality Rubric — the contract

The game is judged against every gate below, with the stated **verification method**.
If a gate fails, we iterate until it passes. This section is the definition of done.

### A. Character fidelity — "Is that a bear?" (screenshot-judged, every milestone)

Scored from Playwright captures at 6 angles (front, ¾, profile, back, top, action shot).
**All 12 must pass:**

1. Protruding muzzle with visible nose plane (head is not a sphere)
2. Two distinct rounded ears reading in silhouette
3. Shoulder hump and chest mass (torso is not a capsule)
4. Plantigrade feet — visible heel contact, not pegs
5. Articulated paws with separated claws (≥4 digits)
6. Eyes with lids + blink cycle; mouth that opens
7. Fur response in the material (rim/shell or anisotropic — flat matte fails)
8. Crisp red bow tie with its own bones; waggles on landing
9. Tail nub
10. Silhouette test: solid-black render is identifiable as a bear by shape alone
11. Walk/run show weight transfer (head bob, hip sway, settle on land)
12. **No primitive shapes identifiable in the final render. Zero ovals.**

Enemies pass a 6-point version of the same test (distinct silhouette, articulated limbs,
readable costume, facial features, telegraph poses, no primitives).

### B. Animation — ≥14 skeletal clips (§5), all glTF-baked
*Verified by an asset-manifest test that enumerates clips and durations.*

### C. World density
- ≥12 unique building facades (modular kit + variation, no two adjacent identical)
- ≥40 placed props, of which **≥12 are live physics objects**
- 3 secrets (balcony stash, alley nook, one rooftop)
- Full collision coverage: a Playwright bot walks the level perimeter and logs any
  fall-through or escape. Zero allowed.

### D. Combat & AI
- 3 archetypes with *behaviorally distinct* trees (verified in a headless sim test:
  given identical stimulus, the three produce different action traces)
- Telegraphs ≥0.5 s on all enemy attacks; the Huntress' shriek audibly precedes
  every pounce
- Knockback impulse scales with Joshua's velocity (unit-tested against the physics step)
- Special: dance lasts 2.0 s ± 0.2, shockwave radius ≥8 m, ragdolls all enemies in radius

### E. Performance budgets (hard gates)
| Metric | Budget | Verification |
|---|---|---|
| Desktop fps | 60 sustained | Playwright telemetry overlay, 60-s scripted play loop |
| iPhone-12-class fps | ≥30 sustained | WebKit run with 4× CPU throttle as proxy + on-device check by you |
| Draw calls / frame | ≤120 | `engine.drawCalls` telemetry |
| Triangles in view | ≤250 k | Babylon inspector stats dump |
| Texture memory | ≤48 MB (KTX2) | Asset-manifest test |
| Total initial payload | ≤25 MB | CI bundle-size check |
| Time-to-interactive | <8 s on simulated 4G | Playwright network throttle |
| Console errors | 0 (Chromium + WebKit) | CI gate |

Mobile scaling ladder (auto-applied by device tier): resolution scale → shadow map size
→ puddle reflections → fur shell count → max active ragdolls.

### F. Physics authenticity
- Capsule rigidbody controller (slopes ≤40°, step offset, coyote time) — unit-tested
- Enemy ragdolls on special/KO (≥6 simultaneous on desktop, ≥3 mobile)
- ≥12 simulated props that react to Joshua, shockwaves, and each other
- The shockwave applies real radial impulses — props and ragdolls scatter ballistically

### G. Complete loop
Wake-up → fight → 8/8 pieces → Lipstixx assembly → finale → end card, completable in
8–15 min, no soft-locks. *Verified by a scripted Playwright full-playthrough that runs
in CI.*

### H. Controls
Keyboard+mouse and touch both fully cover: move, camera, jump, double jump, attack,
special, interact. Touch targets ≥56 px. Pause/resume works. Safari audio unlocks on
first touch (the classic iOS gotcha — explicitly tested).

---

## 8. Milestones

| | Milestone | Exit criteria (gates from §7) |
|---|---|---|
| M0 | Repo, Vite+TS+Babylon+Havok boot, CI → Pages deploy | Spinning PBR cube live on Pages; E-console, E-payload |
| M1 | Graybox: street layout, capsule-proxy controller, camera | Full traversal, C-collision bot passes |
| M2 | **Joshua v1** — modeled, rigged, textured, core clips | **Gate A scored; iterate here until 12/12 — nothing else proceeds past M2 without the bear** |
| M3 | Combat: claw chain, Groove meter, dance + Drop, ragdolls | Gates D, F |
| M4 | Enemies: frat boys, pirates, Huntress + shriek audio | Gate D full; enemy fidelity test |
| M5 | World art pass: facades, balconies, props, lighting, puddles | Gates C, E desktop |
| M6 | Collage loop: pieces, HUD, assembly minigame, finale, audio | Gate G playthrough green |
| M7 | Mobile hardening: touch UI, scaling ladder, WebKit pass | Gates E mobile, H — then **ship** |

Each milestone ends with a committed screenshot set in `qa/screenshots/<milestone>/`
plus the telemetry log, so the rubric verdicts are auditable in the repo history.

---

## 9. Repository Layout

```
wutang-arcade/
├── PLAN.md                  ← this contract
├── index.html / src/        ← TypeScript game source (Vite)
│   ├── core/                ← engine boot, loop, device tiering
│   ├── player/              ← controller, moveset, Groove meter
│   ├── combat/              ← attacks, shockwave, ragdoll mgmt
│   ├── ai/                  ← behavior trees, enemy archetypes
│   ├── level/               ← Bourbon St. assembly, pieces, secrets
│   ├── ui/                  ← HUD, touch controls, assembly minigame
│   └── audio/               ← WebAudio bus, clip player, synth SFX
├── tools/
│   ├── character/           ← bpy scripts: Joshua + enemies (model/rig/animate)
│   ├── environment/         ← bpy scripts: French Quarter kit
│   └── pipeline/            ← glTF export, KTX2 compression, manifest gen
├── assets/
│   ├── collage/collage.png  ← the real collage (committed ✓)
│   ├── models/ textures/ audio/
├── qa/
│   ├── playwright/          ← rubric tests: screenshots, fps, playthrough bot
│   └── screenshots/         ← per-milestone evidence
└── .github/workflows/       ← build, rubric CI, Pages deploy
```

---

## 10. Known risks, called now

1. **Bear quality is the long pole.** That's why it's M2 with a hard gate and why the
   pipeline is scripted Blender, not engine primitives. Budget the most iteration here.
2. **iOS Safari** quirks (audio unlock, WASM memory, texture limits): mitigated by
   WebKit in CI from M0, but the final fps verdict needs your actual phone —
   the Pages URL will be live from M0 onward so you can check every milestone.
3. **Network policy**: CDNs are blocked here, but npm and raw GitHub work — everything
   is vendored/committed; the built game has zero runtime third-party requests anyway.
4. **Huntress voice line**: will be synthesized + pitch-warped locally. If it's not
   creepy enough, you can record one and drop it in `assets/audio/` — the build picks
   it up by filename.
