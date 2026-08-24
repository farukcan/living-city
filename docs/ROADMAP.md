# Roadmap

Seven working days. Days 1-4 are the core; days 5-7 are polish. Feature IDs refer to
[FEATURES.md](./FEATURES.md).

**If time runs short, cut in this order:** Playwright smoke test (day 7) → repair
mechanic (F-15) → flow lines (F-19). Do not cut the power allocator or the day/night
cycle; they are the demo.

---

## Day 0 — Documentation

- [x] `PRD.md` — product, scope, architecture, resource loop
- [x] `docs/FEATURES.md` — F-01..F-25 with acceptance criteria
- [x] `docs/ROADMAP.md` — this file
- [x] `docs/SPEC-01-simulation.md`
- [x] `docs/SPEC-02-buildings.md`
- [x] `docs/SPEC-03-world.md`
- [x] `docs/SPEC-04-rendering.md`
- [x] `docs/SPEC-05-state.md`
- [x] `docs/SPEC-06-events.md`

**Verify:** every tuning number has exactly one home — simulation balance in SPEC-02,
world generation in SPEC-03, event rates in SPEC-06. No number is restated elsewhere.

---

## Day 1 — Scaffold and World → F-10, F-11, F-17, F-20

- [x] Vite + TypeScript (strict) + React 19 + R3F + Tailwind + ESLint + Prettier
      (drei was used on day 1 and dropped on day 7 — see that entry)
- [x] Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`
- [x] `src/sim/hex.ts` — axial coordinates, neighbours, pixel conversion + tests
- [x] `src/sim/rng.ts`, `src/sim/noise.ts` — seeded RNG and value noise + tests
- [x] `src/sim/terrain.ts` — elevation, slope, ice/ore deposits + tests
- [x] `src/render/Terrain.tsx` — instanced hex ground, elevation-based colour, outcrops
- [x] `src/render/CameraRig.tsx` — clamped orbit / pan / zoom
- [x] Hover highlight via raycast → instanceId
- [x] Playwright harness, pulled forward from day 7 to serve as the visual check
- [x] `README.md`

**Verify:** ✅ 34 unit tests and 2 e2e tests pass; the screenshot shows tessellated Mars
terrain with distinguishable ice, ore and unbuildable tiles.

**Learned:** the screenshot caught three defects the unit tests could not — hexes rendered
pointy-top against a flat-top layout, a single oversized ice field, and ore tinted too
close to the terrain's own shading. Visual verification is not optional for this project;
every rendering day ends with a screenshot read.

---

## Day 2 — Simulation Core → F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-09

- [x] `src/sim/types.ts`, `src/sim/constants.ts` (mirrors SPEC-02 exactly)
- [x] `src/sim/environment.ts` — sol time → sun intensity, ambient temperature, dust
- [x] `src/sim/allocate.ts` — the priority allocator, shared by power and water
- [x] `src/sim/power.ts` — tiers, battery, load shedding
- [x] `src/sim/resources.ts` — caps, water pass, stock-flow, waste reporting
- [x] `src/sim/population.ts`, `src/sim/survival.ts`
- [x] `src/sim/placement.ts`, `src/sim/colony.ts` — rules and a seeded starting colony
- [x] `src/sim/tick.ts` — `simulateTick(state, dt): SimState`
- [x] 33 tests: determinism, purity, energy conservation, throttle order, cap overflow

**Verify:** ✅ 67 tests pass; a 2000-tick run produces no NaN, no negative stock and no
stock above its cap; the starting colony runs a full sol with zero life-support deficit.

**Learned:** two balance defects only a measured run could show.

1. The allocator had a **cliff**: with a 360 kW discharge limit against a 92 kW demand it
   served every tier in full all evening, then the battery hit zero and life support failed
   with no warning. Fixed with per-tier battery reserve thresholds (load shedding), which
   is also what makes the intended "the mine stops at night" lesson actually happen.
2. The paper balance in SPEC-02 was **7% optimistic**. Averaging day and night load ignores
   that dawn and dusk carry a near-night heating bill on almost no sunlight; the effective
   night is 14.8 hours, not 12.3. The spec now records measured figures, not derived ones.

---

## Day 3 — Buildings → F-12, F-13, F-14, F-16, F-17

- [x] `src/render/geometry/buildingGeometry.ts` — 8 procedural builders, vertex-coloured
- [x] `src/render/Buildings.tsx` — InstancedMesh per type, idle/damaged tints
- [x] `src/render/PlacementGhost.tsx` — valid/invalid preview using the real rules
- [x] `src/state/store.ts`, `loop.ts`, `snapshot.ts`, `actions.ts` — pulled forward from
      day 4, because placement needs somewhere to put the click
- [x] `src/ui/TopBar.tsx`, `src/ui/BuildBar.tsx`
- [x] Placement rules (ice / ore / occupied / affordability) wired end to end
- [x] Three interaction e2e tests

**Verify:** ✅ 5 e2e tests pass — the loop advances and pauses, a Solar Array costs exactly
20 minerals, and an invalid tile always states a reason.

**Learned:** three defects, all found by end-to-end tests rather than by unit tests.

1. **Build mode was cancelled by a stray click on a building.** Buildings swallowed the
   click as a selection, so the next click did nothing and the player had no idea why. They
   now let the click fall through to the tile, which answers "already occupied".
2. **Actions taken while paused did not appear in the HUD.** The snapshot read stocks from
   the tick report, which only rebuilds when the simulation steps. Stocks and caps now come
   from live state; only rates come from the report.
3. A test that regex-scraped a HUD tile happily parsed the flow rate as the stock. Stock
   values now carry their own `data-testid` — tests read one number, not a sentence.

---

## Day 4 — HUD → F-07, F-09, F-21, F-22

- [x] `src/state/store.ts`, `loop.ts`, `snapshot.ts` (delivered on day 3)
- [x] `src/ui/TopBar.tsx` — stocks, net flows, sol clock, speed control
- [x] `src/ui/BuildBar.tsx` — 8 buildings, costs, unaffordable dimmed
- [x] `src/ui/InspectorPanel.tsx` — flows, efficiency bar, idle / repair / demolish
- [x] `src/ui/Sparkline.tsx` — dependency-free SVG over the history ring buffer
- [x] Escape clears placement, then selection

**Verify:** ✅ 7 e2e tests pass, including opening the inspector on a building and idling
it. Reference screenshot in `test-results/interface.png`.

**Learned:** re-render pressure is controlled by _quantising selectors_, not by memoisation.
The inspector subscribes to `Math.round(efficiency * 100)` and the placement ghost to
`Math.floor(minerals)`, so both re-render a few times a second instead of at tick rate,
while still reading live values through `getState()`. Sparklines normalise to each series'
observed range rather than to zero — a reserve oscillating between 380 and 420 litres is a
flat line otherwise, which hides the only thing the panel is for.

---

## Day 5 — Atmosphere → F-18, F-19

- [x] `src/render/SunLight.tsx` — light arcing across the sol, warm at the horizon
- [x] Sky, fog and ambient fill lerped by sun intensity; reddened and thickened by dust
- [x] Emissive buildings after dark, driven by the simulation's own sun intensity
- [x] `src/render/FlowLines.tsx` — animated producer → consumer dots
      (superseded by `Pipelines.tsx` in the visual pass)
- [x] `e2e/visual.spec.ts` — asserts night is darker than day but still legible

**Verify:** ✅ Night reads as night (mean brightness under 70% of day, above the black
floor), the mine's flow stops entirely after dark, and shadows lengthen toward dusk.
References in `test-results/day.png` and `night.png`.

**Learned:** a saturated blue night fill multiplied against rust terrain produces black.
Light colour has to be chosen against the palette it lands on, not in isolation — the fix
was a near-neutral fill with only a hint of blue. Likewise emissive at 0.55 flattened the
buildings into featureless silhouettes; 0.3 glows without erasing the facets that make each
type recognisable.

**Note:** flow lines visualise the allocation, not a network. The simulation has no
transmission topology (see SPEC-01), and the code says so where someone might assume
otherwise.

---

## Day 6 — Events and Persistence → F-08, F-15, F-23, F-24

- [x] `src/sim/events.ts` — dust storm, meteor, oxygen leak, supply drop, all seeded
- [x] Meteor damage wired through the tick; repair already existed in the inspector
- [x] `src/ui/EventToast.tsx` — queued toasts plus a persistent badge
- [x] `src/state/persistence.ts` — autosave every 5 sols and on tab hide, schema guard
- [x] "New colony" button
- [x] 13 event tests, 2 persistence e2e tests

**Verify:** ✅ 83 unit and 10 e2e tests pass. A fixed seed replays an identical event
stream; a reload restores the colony; a fresh colony resets to sol 1.

**Learned:** the "New colony" button hands an arbitrary seed to `createColony`, and the
deposit guarantee could not actually honour it. Lowering the noise threshold does not help
a seed whose terrain is uniformly high, because ice also requires low ground — so some
seeds threw "no valid tile" and crashed the app on a button press. The guarantee now falls
back to assigning the best free tiles outright, and a 60-seed sweep test enforces it.

The same sweep caught a second, subtler thing: `efficiencyById` defaulted absent buildings
to 1, so an idled or meteor-struck building reported 100% output. SPEC-01 said zero; the
code now agrees, and every consumer of that map is spared a status re-check.

---

## Day 7 — Polish and Deploy

- [x] Simulation performance measured and pinned by `src/sim/performance.test.ts`
- [x] Dropped `@react-three/drei`; OrbitControls wrapped directly from `three/examples`
- [x] Three.js split into its own chunk via Rolldown's `advancedChunks`
- [x] Flow-lines toggle in the HUD (the store had the flag, the UI had no switch)
- [x] Hover card showing a building's flows without clicking (finishes F-25)
- [x] Onboarding card, dismissed by the first real interaction
- [x] "Best on desktop" notice on small screens
- [x] `.github/workflows/deploy.yml` — verify, then build with the Pages base path
- [x] Docs reconciled with shipped behaviour

**Verify:** ✅ 86 unit tests, 10 e2e tests, clean typecheck and lint. Production build
serves correctly under the `/living-mars-machine/` base path.

**Measured tick cost** (2000 ticks per row, after warm-up):

| Buildings | ms / tick | Share of one core at 16× |
| --------- | --------- | ------------------------ |
| 13        | 0.011     | 1.7%                     |
| 50        | 0.030     | 4.8%                     |
| 100       | 0.057     | 9.2%                     |
| 197       | 0.116     | 18.6%                    |

Linear in building count, and comfortably inside a frame — which retires the open question
from PRD.md about whether the simulation needs a Web Worker. It does not.

**Learned:** dropping drei saved nothing measurable (314.9 → 314.7 kB gzip; it was already
tree-shaken). It was kept for the smaller dependency surface, not for the bundle — worth
recording so nobody repeats the experiment expecting a win. The real weight is Three.js
itself, now cached as its own chunk.

Two acceptance criteria were rewritten rather than met as written: F-17 claimed "200
buildings hold 60 fps", which cannot be honestly measured in a headless SwiftShader browser
— it now asserts bounded draw calls plus the simulation figures above. F-25 claimed a hover
tooltip that did not exist; the hover card was built rather than the claim quietly dropped.

---

## Visual Pass — after the first playable build

The seven-day build produced a correct simulation behind a scene that read as a board game:
flat hex discs, blank-sided buildings, no horizon. This pass rebuilt the look without
touching `src/sim/`, which is the payoff of the isolation the architecture was built around
— none of the 86 simulation tests needed changing.

- [x] **V1 — Atmosphere.** Gradient sky dome (shader, re-tinted per frame), fogged hills,
      ground plane meeting the grid at tile-top height, lower camera to frame the horizon
- [x] **V2 — Terrain.** Chunky tiles, hashed per-tile colour variation, boulders, pebble
      scatter, ice and ore split into their own materials
- [x] **V3 — Buildings.** All eight rebuilt: geodesic habitat dome, celled solar arrays,
      glazed greenhouse with crops inside, lattice drill mast. Emissive mask attribute so
      windows light themselves at night through one material
- [x] **V4 — Pipework and post-FX.** Steel pipes between producers and consumers with
      glowing packets riding them; N8AO, bloom and vignette
- [x] **V5 — Iconography.** Hand-drawn SVG icon set: resources, status, an astronaut helmet
      for the crew readout, and building icons that mirror their 3D silhouettes

**Verify:** ✅ 86 unit tests and 10 e2e tests still pass, typecheck and lint clean, build
serves under the Pages base path. References in `docs/interface.png` and `docs/night.png`.

**Learned:**

1. **Scene-level context beats object-level detail.** The single biggest improvement was not
   better buildings — it was a sky, a horizon and ground continuing past the grid. Detailed
   models in a void still look like a void.
2. **Light colour has to be chosen against the palette it lands on.** A saturated blue night
   fill multiplied against rust terrain produced black terrain. Near-neutral fixed it.
3. **Metalness with no environment map is a black hole.** Ore at 0.55 metalness rendered as
   a void in the map.
4. **Two things the player must distinguish cannot differ only in lightness.** Ore and ice
   were both greys and merged visually; ore went warm and matte, ice cool and smooth.
5. **Building scale has a geometric ceiling**, not an aesthetic one: √3 hex width against a
   1.32-unit array caps the instance scale near 1.2, past which neighbours overlap.
6. **`mergeGeometries` demands identical attribute sets.** The hand-built geodesic shell had
   no UVs and silently failed the merge until UVs were stripped from every part.
7. **Post-processing changed the e2e timing.** Under a software renderer the extra passes
   slowed frames enough that a throttled HUD snapshot arrived after a fixed wait, so a pause
   assertion started failing. The test now polls until the clock settles rather than
   sleeping a fixed interval — it was measuring frame rate, not the simulation.
