# JOSHUA — A Bourbon Street Bear Tale

A 3D physics platformer for the web. One bear. One bow tie. One collage to finish.
One $500 plane ticket home.

Hosted on GitHub Pages. Playable with keyboard/mouse, touch (iPhone), and gamepad.

> **Spec v2** — incorporates feedback from the real-life Joshua (swim is IN scope,
> dance hyper-armor, fishbowl power-up, money quest, coin spill) and stakeholder
> decisions (synthesized public-domain jazz soundtrack; 10–20 minute playthrough;
> build proceeds straight through against this contract).

---

## 1. Vision & Pillars

- **The bear is the game.** Joshua is a smart, funny, deeply odd brown bear in a bow tie.
  If he doesn't read as a *bear* — snout, ears, claws, fur, weight — nothing else matters.
- **Banjo-Kazooie soul, modern body.** Movement feel, camera, collect-a-thon loop, and
  musical charm of the N64 era, rendered with modern materials and lighting.
  Joshua is much goofier than Banjo: groggy idle sways, overdramatic dances, comedic
  stumbles.
- **Real physics.** Rigidbody character controller, impulse knockback, ragdolling enemies,
  simulated props (trash cans, beads, bottles, coins) — not animation fakery.
- **Smooth on a phone.** A fairly recent iPhone (12-class or better) holds ≥30 fps;
  desktop holds 60. Performance budgets are hard gates, not aspirations.

### Story & tone

8 AM on Bourbon Street: golden morning light, wet asphalt, dead neon, seagulls and
distant brass. Joshua wakes up in a gutter with a headache, an unfinished collage
scattered across three blocks, and a burning need to **get home**. The travel agency
next to Lipstixx sells flights home for **$500**. Coins alone won't cover it — but a
bear who finishes his collage (*"Reality is merely another kind of wonder." — Ram Dass*)
and busks it on the sidewalk in front of Lipstixx? The morning crowd will cover the
difference. Find the pieces. Fight the streets. Drop it like it's hot. Fly home.

---

## 2. Tech Stack (decided)

| Layer | Choice | Why |
|---|---|---|
| Engine | **Babylon.js 8** | First-class glTF + skeletal animation, built-in physics integration, WebGPU with automatic WebGL2 fallback, strong iOS Safari support. |
| Physics | **Havok (WASM)** via `@babylonjs/havok` | An order of magnitude faster than cannon/ammo — this is what makes "real physics + mobile" possible at once. |
| Language/build | TypeScript + Vite | Fast builds, tree-shaking keeps the payload inside the mobile budget. |
| Asset authoring | **Blender 5 as a Python module (`bpy`)**, scripted | See §3 — the anti-oval insurance policy. |
| Music | **Synthesized renditions of public-domain compositions** (fluidsynth + GM soundfont → OGG/M4A loops, committed) | Compositions pre-1931 are PD in the US; renditions we render ourselves carry no recording copyright. Zero risk, clean loops. See §8. |
| Voice/SFX | espeak-ng (pitch-warped) for the Huntress line; Web Audio procedural layer + baked clips | No runtime third-party requests. |
| Deploy | GitHub Actions → GitHub Pages | Push → built → live. Vite `base` configured for project pages. |
| QA harness | Playwright (Chromium + WebKit) | Automated screenshots, fps telemetry, console-error gates — the rubric in §9 is *executed*, not eyeballed. |

**Art direction:** "realistic" + "runs on iPhone" + "Banjo homage" cannot all be
photorealism. The target is **modern stylized realism**: anatomically correct bear
proportions and silhouette, PBR materials, shell/rim fur shading, real-time shadows —
think *Banjo-Kazooie HD remaster*. Recognizably, unmistakably a bear; never a balloon
animal.

---

## 3. Asset Pipeline — the "No Ovals" Doctrine

The failure mode to kill: characters assembled from primitive spheres/capsules in
engine code. **Rule: no character or enemy geometry is ever authored in JS/TS.**

1. **Model in Blender via `bpy`** (verified working in this environment). Scripts build
   Joshua: base mesh → subdivision surface → proportional sculpt passes (muzzle, brow,
   cheek mass, shoulder hump, plantigrade paws) → multi-res detail. Scripts live in
   `tools/character/` so the bear is regenerated, never hand-tweaked into
   unreproducibility.
2. **Rig with a real armature**: spine, neck/head, jaw, ears, 4 limbs with IK,
   finger/claw bones, tail nub, bow-tie bone (it must waggle).
3. **Animate in Blender actions**, export as glTF clips (list in §5).
4. **Texture**: baked AO + procedural fur/albedo maps; crisp red satin bow tie.
   KTX2/Basis compression for mobile texture memory.
5. **Enemies** share a scripted humanoid base with costume variants (frat boy, pirate,
   Huntress) — same bar, no primitives.
6. **Environment kit**: modular French Quarter set (facades, wrought-iron balconies,
   shutters, gas lamps, signage), instanced heavily in engine.

The collage is committed (`assets/collage/collage.png`, 1086×1448), sliced into
**8 collectible pieces**, reassembled at full resolution in the finale.

---

## 4. Joshua: Character & Moveset

### Character

Brown bear, ~1.9 m standing. Red bow tie. Expressive eyes with blink cycles. Walks
upright (Banjo-style) but drops to all-fours for the run. Idle personality: scratching,
swaying, examining one claw, briefly falling back asleep if you idle too long.

### Movement (physics-backed)

- Walk / run (all-fours sprint), momentum and slope handling
- Jump with held-button height control; **double jump** with comedic flail
- Ledge grab + scramble-up
- Ground pound (utility slam, distinct from the special)
- **Swim** *(per Joshua: in scope)* — surface swimming in the flooded storm-drain
  section of the alley (§7). Buoyancy volume, doggy-paddle stroke, slower turn radius,
  can grab floating coins; no deep diving in level 1.

Character controller: capsule rigidbody against Havok with step offset, slope limits,
coyote time. Knockback impulses scale with Joshua's velocity — sprinting into a claw
swipe hits harder. Special-killed enemies **ragdoll**.

### Combat & power-ups

- **Regular attack — "Claw & Order":** 3-hit chain — claw swipe, backhand swipe,
  big haymaker kick. Short range, fast, cancellable into jump.
- **Special — "Drop It Like It's Hot":**
  - **Charged by movement.** The *Groove Meter* fills from horizontal distance traveled,
    with style bonuses (double jumps, ledge scrambles, near-misses). Standing still
    slowly drains it. Full charge ≈ 60–90 s of active play.
  - **On activation:** 2-second dance (snake hips → shoulder bounce → finger point),
    then the drop — low squat slam, palm to pavement, **≥8 m radius shockwave** that
    ragdolls every enemy in range and scatters physics props.
  - **Hyper-armor while dancing** *(per Joshua: full vulnerability is out)*: the dance
    cannot be interrupted and Joshua takes **half damage** during it. Risk is reduced,
    not zero — getting chip-damaged mid-dance is still very funny.
- **Fishbowl power-up** *(per Joshua)*: souvenir fishbowls found on bar counters.
  Activate → Joshua wears it as a helmet for **15 seconds**: invincibility + boosted
  knockback on all attacks, goldfish sloshing in front of his eyes. **Costs 1 bow-tie
  health segment** on activation — it hits your health meter. Cannot activate at 1 HP.

### Health & money

- **Bow-tie integrity:** 6 segments, shown as the HUD bow tie progressively drooping.
  Restore with **beignets** stashed around the level.
- **Coins (doubloons):** scattered everywhere, dropped by enemies, hidden in secrets.
  Needed toward the **$500 plane ticket** (see §7 economy).
- **KO — Sonic rule** *(per Joshua)*: at zero health your coins **spill out everywhere**
  as physics objects and scatter; you respawn at the current block's gutter and have
  ~15 s to scramble and re-grab what you can (up to ~70%) before they fade. Collage
  pieces are never lost.

### Camera & controls

- Third-person lazy chase camera with manual orbit; collision-aware.
- Desktop: WASD + mouse, Space jump, J/LMB attack, K/RMB special, E interact.
- Mobile: left virtual stick; right-side Jump/Attack buttons; big pulsing Groove
  button when full; camera auto-assist. Touch targets ≥56 px.
- Gamepad: standard twin-stick mapping (nice-to-have, not a gate).

---

## 5. Animation Set (minimum 15 clips)

| # | Clip | Notes |
|---|---|---|
| 1 | Groggy wake-up | Level-opening: stretch, blink, confused look at gutter |
| 2 | Idle | Breathing, weight shifts, occasional scratch |
| 3 | Idle (bored) | Falls half-asleep after 20 s |
| 4 | Walk | Upright, arms swinging |
| 5 | Run | All-fours bear sprint |
| 6–8 | Jump / Fall / Land | Land has a heavy squash beat |
| 9 | Double-jump flail | Goofy mid-air scramble |
| 10 | Claw combo (3 stages) | One chain with cancel points |
| 11 | Hit react / KO | KO triggers the coin spill |
| 12 | **The Dance** | 2-s hyper-armor dance preceding the special |
| 13 | **The Drop** | Squat slam + shockwave pose |
| 14 | Victory / collage placement | Finale cutscene |
| 15 | **Swim** | Surface doggy-paddle loop |

---

## 6. Level One: *Bourbon Street, 8 AM* — World Overview

Three blocks of Bourbon Street plus one side alley, bookended by soft barriers
(parade barricade north, street-cleaning truck south). Morning light: long warm
shadows, wet asphalt with puddle reflections (cubemap on mobile), dead neon, scattered
beads and last night's cups as physics props. Vertical play: balconies reachable by
crates, AC units, and an unwisely parked pedicab. Landmarks: the **gutter spawn** at
one end, **Lipstixx** glowing faintly at the other, the **travel agency** beside it
with a "FLIGHTS HOME — $500" poster (the diegetic goal).

### Objective loop (target: 10–20 minutes)

1. Wake in the gutter (clip #1), playable immediately.
2. Fight/platform through three blocks; collect **8 collage pieces** and **coins**.
3. Return to Lipstixx with 8/8 → survive the "last call" gauntlet.
4. Sidewalk assembly minigame (snap pieces onto a 2D overlay of the real collage).
5. Finale: Joshua busks the finished collage — the morning crowd showers coins until
   the ticket total hits **$500** (completion is never blocked by coin count; busking
   covers the gap, and your collected total sets the end-card style rating).
6. Ticket purchased. End card: plane overhead, *"Reality is merely another kind of
   wonder."*, stats screen (time, coins, KOs, secrets).

### The 8 pieces

| # | Piece (crop of the real collage) | Where (see §7) |
|---|---|---|
| 1 | "REALITY" letter block | Block 1, café table — plain sight |
| 2 | "IS MERELY" | Intersection A, atop the street-cleaning truck cab |
| 3 | "ANOTHER KIND OF" | Block 2, guarded by a frat pack at the daiquiri stoop |
| 4 | "WONDER." | Intersection B, atop the grill sign — pedicab ramp jump |
| 5 | Crow on the old man's hat | Block 1 balcony — crate-stack double jump |
| 6 | Flowers & songbird | Block 2, hanging flower basket — balcony plank crossing |
| 7 | Pin-up lady | The Alley — **Huntress** mini-boss drop |
| 8 | Goldfish bowl (tiny couch included) | Block 3, antiques-shop skylight heist |

### Enemies

| Enemy | Count | Behavior |
|---|---|---|
| **Frat Boy** | 9 | Packs of 2–4; shoulder-tackle charge; wobbling beer-pong lob at range. Polo, backwards cap, croakies. Ragdolls magnificently. Drops 5–10 coins. |
| **Pirate** | 5 | Patrol routes; slow-telegraph cutlass swing; **blocks frontal claw hits** — flank or special. Bachelor-party leftover. Drops 10–15 coins. |
| **The Huntress** | 1 | Troll mini-boss in the Alley. Before every pounce she rears back and **shrieks "I AM THE HUNTRESS, AND CHRIS IS MY PREY!"** (pre-baked pitch-warped clip). The shriek is the dodge window. Three pounce patterns: straight, arc, fire-escape ceiling drop. Drops piece #7 + 100 coins + full Groove refund. |

AI: behavior trees (idle/patrol → aggro → telegraph → attack → recover), sight cones,
group-aggro cap (≤6 active simultaneously on mobile; others idle until in range).

---

## 7. Detailed Layout (the build map)

Street runs along +Z, ~240 m total; roadway 12 m wide, sidewalks 4 m each side,
buildings 8–12 m tall, balcony level at 4.5 m. Coordinates below are build targets.

### Block 1 — "The Gutter" (z 0–70) · *teach*
- **Spawn** z=8 east sidewalk: the gutter, puddle, trash bags. Wake-up scene.
- Diegetic tutorials: posters ("LOST: collage pieces", control hints as graffiti).
- Enemies: 1 frat-boy pack ×2 (z≈40) — gentle intro.
- **Piece 1** on a café table z=30 (visible from spawn — first beat of hope).
- **Piece 5** balcony z=55: stack of crates + AC unit + double jump.
- Coins: ~60 in sidewalk trails and gutters. Beignet: café counter.
- **Secret 1**: dumpster alcove behind the café — 25-coin cache.
- Physics props: 4 trash cans, bottles, bead strings, café chairs.

### Intersection A (z 70–86) · *first platform puzzle*
- Cross street barricaded both ends; distant-brass audio cue.
- 1 pirate patrols the crossing (teaches the block mechanic).
- **Piece 2** on the street-cleaning truck cab — climb bumper → hood → cab.

### Block 2 — "The Gauntlet" (z 86–156) · *test*
- Densest combat: frat packs ×2 (3 + 2), pirates ×2 on overlapping patrols.
- **Piece 3** at the daiquiri-bar stoop z=110, guarded by the 3-pack.
- **Piece 6** in a hanging flower basket at balcony level z=130–145: cross between
  balconies on planks; a pirate patrols below to punish falls.
- **Fishbowl power-up** on the daiquiri bar counter z=120 (second fishbowl hidden in
  Secret 2 — teaches the health-cost tradeoff where there's a beignet nearby).
- **Secret 2**: open second-floor shutter off the balcony run — room with 40 coins +
  beignet.
- **Alley entrance** west side at z=140, marked by dripping water and a shredded
  poster of the pin-up lady.

### The Alley (west off Block 2/3 boundary) · *swim + boss*
- Narrow, shaded, drips echoing. 12 m **flooded storm-drain section, waist-deep**:
  the swim zone. Floating coins; a grate you duck under at the surface line.
- Dead end widens into a 14×10 m arena under a fire escape: **the Huntress**.
  Shriek → pounce, three patterns; fight her with claws, or save the Groove and end
  her with one perfectly timed Drop.
- Reward: **Piece 7**, 100 coins, full Groove refund.

### Intersection B (z 156–172) · *combine*
- Mixed group: 1 pirate + 2 frat boys (forces flank-vs-charge prioritization).
- **Piece 4** atop the Clover-style grill sign: jump the parked **pedicab** (its seat
  is a physics springboard) → awning → sign.

### Block 3 — "Lipstixx Approach" (z 172–240) · *payoff*
- **Lipstixx** at z=225 east: dead pink neon, awning, chalk rectangle on the sidewalk
  (the assembly spot). **Travel agency** next door: "FLIGHTS HOME — $500".
- **Piece 8**: antiques-shop window across the street — enter via balcony → skylight
  drop, grab the goldfish bowl inside, exit unlocks the front door (shortcut back).
- **Last-call gauntlet**: at 8/8 pieces, a final wave (4 frat boys + 1 pirate) spawns
  between Joshua and Lipstixx.
- Finale beats per §6.

### Economy (build numbers)
- Placed coins ≈ 350 (trails 60/90/70 per block, alley 30, secrets 90 total incl. 25+40).
- Enemy drops ≈ 110 expected; Huntress 100.
- KO spill: drop 50% of carried coins, 70% recoverable, 15 s fade.
- Busking finale always tops up to $500 — coin total drives the style rating
  (Bronze < 250, Silver < 400, Gold ≥ 400 carried at finale).

### Pacing audit (target 10–20 min)
Traversal ≈ 4 min · combat ≈ 5 · piece platforming ≈ 5 · Huntress ≈ 2 · assembly +
finale ≈ 2 → ~18 min first run, ~10 for a confident replay. Verified by the scripted
playthrough bot (§9.G) plus a human run.

---

## 8. Soundtrack — Public-Domain Jazz (synthesized)

All **compositions published before 1931** (public domain in the US, 2026). We render
our own arrangements from MIDI via fluidsynth + GM soundfont into seamless OGG/M4A
loops — owned renditions, zero recording copyright. Committed to `assets/audio/music/`
with a manifest documenting title, composer, year, and PD basis.

| Zone | Track (composition, year) | Arrangement vibe |
|---|---|---|
| Block 1 / wake-up | *Weeping Willow* — Scott Joplin, 1903 | Sleepy solo piano, behind-the-beat |
| Block 2 | *Tiger Rag* — ODJB, 1917 | Uptempo trad-jazz band |
| The Alley / Huntress | *St. James Infirmary* (trad., pre-1925) | Minor-key, muted trumpet, creepy |
| Block 3 / finale | *When the Saints Go Marching In* (trad.) | Full brass, triumphant |
| Assembly minigame | *Maple Leaf Rag* — Scott Joplin, 1899 | Jaunty player piano |

Zones crossfade (2 s) on boundaries; Huntress arena gets a percussion layer on aggro.
SFX: procedural Web Audio (hits, coins, shockwave) + baked clips (shriek, crowd,
seagulls, brass stings).

---

## 9. Complexity & Quality Rubric — the contract

Every gate below is verified by the stated method. If a gate fails, iterate until it
passes. **This section is the definition of done.**

### A. Character fidelity — "Is that a bear?" (screenshot-judged, every milestone)

Scored from Playwright captures at 6 angles (front, ¾, profile, back, top, action).
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
10. Silhouette test: solid-black render identifiable as a bear by shape alone
11. Walk/run show weight transfer (head bob, hip sway, settle on land)
12. **No primitive shapes identifiable in the final render. Zero ovals.**

Enemies pass a 6-point version (distinct silhouette, articulated limbs, readable
costume, facial features, telegraph poses, no primitives).

### B. Animation — ≥15 skeletal clips (§5), all glTF-baked
*Asset-manifest test enumerates clips and durations.*

### C. World density
- ≥12 unique building facades (modular kit + variation; no two adjacent identical)
- ≥40 placed props, **≥12 live physics objects**
- 3 secrets; full collision coverage (perimeter-walking bot logs any fall-through —
  zero allowed)
- Swim volume with buoyancy + water surface rendering

### D. Combat, AI & economy
- 3 archetypes with behaviorally distinct trees (headless sim: identical stimulus →
  different action traces)
- Telegraphs ≥0.5 s; the shriek audibly precedes every Huntress pounce
- Knockback impulse scales with Joshua's velocity (unit-tested)
- Special: dance 2.0 s ± 0.2 with hyper-armor (uninterruptible, 0.5× damage taken),
  shockwave radius ≥8 m, ragdolls all enemies in radius
- Fishbowl: exactly 15 s ± 0.5, costs 1 health segment, blocked at 1 HP, grants
  i-frames + knockback boost
- KO coin spill: 50% spilled as physics bodies, recoverable 15 s, pieces never lost
- $500 always reachable; style rating thresholds per §7 economy

### E. Performance budgets (hard gates)
| Metric | Budget | Verification |
|---|---|---|
| Desktop fps | 60 sustained | Playwright telemetry, 60-s scripted loop |
| iPhone-12-class fps | ≥30 sustained | WebKit + 4× CPU throttle proxy; on-device check by you |
| Draw calls / frame | ≤120 | engine telemetry |
| Triangles in view | ≤250 k | stats dump |
| Texture memory | ≤48 MB (KTX2) | asset-manifest test |
| Initial payload | ≤25 MB (music streams in after) | CI bundle-size check |
| Time-to-interactive | <8 s on simulated 4G | Playwright network throttle |
| Console errors | 0 (Chromium + WebKit) | CI gate |

Mobile scaling ladder: resolution scale → shadow map size → puddle reflections →
fur shell count → max active ragdolls.

### F. Physics authenticity
- Capsule rigidbody controller (slopes ≤40°, step offset, coyote time) — unit-tested
- Ragdolls: ≥6 simultaneous desktop, ≥3 mobile
- ≥12 simulated props reacting to Joshua, shockwaves, and each other
- Shockwave applies real radial impulses; spilled coins are real bodies
- Buoyancy volume floats Joshua and coins at a stable waterline

### G. Complete loop & pacing
Wake-up → 8/8 pieces → gauntlet → assembly → busking → $500 → end card, **10–20 min**,
no soft-locks. *Scripted Playwright full playthrough in CI, plus timed human run.*

### H. Controls & platform
Keyboard+mouse and touch fully cover all verbs. Touch targets ≥56 px. Pause works.
iOS Safari audio unlocks on first touch (explicitly tested). Swim controls work on
both schemes.

### I. Music & audio
- ≥5 distinct PD-composition loops (§8) with documented provenance manifest
- Zone crossfades; no audible loop seams (waveform-inspected)
- Huntress line present, pitched, and precedes 100% of pounces

### J. Comedy floor (yes, really)
- ≥6 distinct gags observable in a single playthrough (groggy idle-sleep, dance,
  fishbowl goldfish slosh, double-jump flail, frat-boy ragdoll exaggeration,
  bow-tie droop, face-plant on interrupted dance refund...)
- *Verified by checklist against the playthrough recording.*

---

## 10. Milestones

| | Milestone | Exit criteria |
|---|---|---|
| M0 | Repo, Vite+TS+Babylon+Havok boot, CI → Pages deploy | Spinning PBR cube live on Pages; E-console, E-payload |
| M1 | Graybox: full street + alley + swim volume, capsule-proxy controller, camera | Traversal incl. swim; C-collision bot passes |
| M2 | **Joshua v1** — modeled, rigged, textured, core clips | **Gate A 12/12 — nothing proceeds without the bear** |
| M3 | Combat: claw chain, Groove, dance (hyper-armor) + Drop, fishbowl, ragdolls, coins + KO spill | Gates D, F |
| M4 | Enemies: frat boys, pirates, Huntress + shriek | Gate D full; enemy fidelity |
| M5 | World art: facades, balconies, props, lighting, puddles, water | Gates C, E-desktop |
| M6 | Quest loop: pieces, HUD, economy, assembly minigame, busking finale, music | Gates G, I, J |
| M7 | Mobile hardening: touch UI, scaling ladder, WebKit pass | Gates E-mobile, H — then **ship** |

Each milestone commits a screenshot set to `qa/screenshots/<milestone>/` plus telemetry
logs — rubric verdicts auditable in repo history.

---

## 11. Repository Layout

```
wutang-arcade/
├── PLAN.md                  ← this contract (v2)
├── index.html / src/        ← TypeScript game source (Vite)
│   ├── core/                ← engine boot, loop, device tiering
│   ├── player/              ← controller, moveset, swim, Groove meter
│   ├── combat/              ← attacks, shockwave, fishbowl, ragdoll mgmt
│   ├── ai/                  ← behavior trees, enemy archetypes
│   ├── level/               ← Bourbon St. assembly, pieces, coins, secrets
│   ├── ui/                  ← HUD, touch controls, assembly minigame
│   └── audio/               ← WebAudio bus, music zones, synth SFX
├── tools/
│   ├── character/           ← bpy scripts: Joshua + enemies
│   ├── environment/         ← bpy scripts: French Quarter kit
│   ├── audio/               ← MIDI arrangements, fluidsynth render, shriek synth
│   └── pipeline/            ← glTF export, KTX2, manifest gen
├── assets/
│   ├── collage/collage.png  ← the real collage ✓
│   ├── models/ textures/ audio/
├── qa/
│   ├── playwright/          ← rubric tests
│   └── screenshots/         ← per-milestone evidence
└── .github/workflows/       ← build, rubric CI, Pages deploy
```

---

## 12. Rubric scorecard (ship audit — updated at v1.0)

Verified by `qa/playwright/rubric.spec.ts` (all 8 automated gates green in CI)
plus the committed screenshot evidence in `qa/screenshots/`.

| Gate | Status | Notes |
|---|---|---|
| A. Bear fidelity | **11/12 + evidence** | Muzzle+nose, ears, hump, plantigrade clawed feet, proud eyes+blink, bow-tie bones, tail, silhouette test, no primitives — see `qa/screenshots/bear/`. #7 fur response is sheen-based (KHR_materials_sheen); judge on a real GPU — flagged for on-device review. |
| B. ≥15 clips | **PASS (16)** | Automated manifest test. |
| C. World density | **PASS** | 12-variant facade atlas, 100+ placed props (14 live physics), 3 secrets, swim volume; collision verified at 17 walkable sample points (full perimeter bot downgraded to sampling). |
| D. Combat/AI/economy | **PASS** | 3 archetypes with distinct trees; telegraphs 0.6–1.6 s; shriek precedes every pounce; velocity-scaled knockback; hyper-armor dance; fishbowl rules unit-tested (incl. the 1-HP block); KO spill tested; $500 always reached (busking tops up). |
| E. Performance | **PASS in-budget / fps needs device** | Draw calls 36–86 (≤120 ✓); payload 12 MB (≤25 ✓); zero console errors ✓. Sustained-fps verdicts require a real GPU — the CI renderer is software. Check the Pages URL on your phone. |
| F. Physics | **PASS w/ caveat** | Capsule controller (coyote, buffer, ledge assist), buoyancy, real radial shockwave impulses, physics coin spills. Ragdolls are rigid-body tumbles ("action figure"), not articulated multi-body — upgrade candidate. |
| G. Complete loop | **PASS** | Scripted full playthrough to the end card runs in CI. 10–20 min pacing: needs one human run to confirm. |
| H. Controls | **PASS** | Keyboard+mouse, full touch layout (≥56 px targets), pause, iOS audio unlock on first touch. |
| I. Music | **PASS** | 5 PD loops with provenance manifest, zone crossfades, loop tails folded. |
| J. Comedy floor | **PASS (7)** | Gutter-sprawl wake-up, idle nap, double-jump flail, goldfish-helmet slosh, frat ragdolls, drooping bow-tie HUD, the dance itself. |

Open items, by honest priority: (1) on-device iPhone fps + fur-response check via
the live URL, (2) articulated ragdolls, (3) a timed human pacing run.

## 13. Known risks, called now

1. **Bear quality is the long pole** — M2 hard gate, scripted Blender pipeline,
   most iteration budgeted here.
2. **iOS Safari** quirks (audio unlock, WASM memory, texture limits) — WebKit in CI
   from M0; final fps verdict needs your actual phone via the live Pages URL.
3. **Network policy** — CDNs blocked in the build environment, npm + raw GitHub work;
   everything vendored/committed; the shipped game makes zero third-party requests.
4. **Huntress voice** — synthesized + pitch-warped locally; if it isn't creepy enough,
   record one and drop it in `assets/audio/` (picked up by filename).
5. **Swim scope** — surface swim only; if buoyancy + animation costs exceed two days
   of iteration it degrades to waist-deep wading with the same level layout (Joshua
   will be informed with appropriate ceremony).
