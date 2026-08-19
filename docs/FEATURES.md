# Feature Catalogue

Every feature has an acceptance criterion. "Done" means the criterion has been verified —
by a test where the row says (test), by hand otherwise.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

All 29 features shipped. Where the implementation diverged from the original wording, the
row below describes what was actually built, not what was first planned.

## Core Simulation

| ID   | Feature                   | Acceptance criterion                                                                                                                             | Status |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| F-01 | Fixed-timestep loop       | Simulation advances in 0.1 s steps regardless of frame rate; speeds 1x / 4x / 16x / pause; `simulateTick` is pure and returns a new state (test) | [x]    |
| F-02 | Stock-and-flow resources  | 6 resources with stock, cap and net flow; production above cap is reported as `wasted` rather than silently dropped                              | [x]    |
| F-03 | Priority power allocation | 4 tiers; on deficit the lowest tier is starved first, then the next; the Inspector shows which buildings are Running and which are Stopped (test) | [x]    |
| F-04 | Battery buffering         | Surplus charges, deficit discharges, both rate-limited; capacity scales with Battery Bank count (test)                                           | [x]    |
| F-05 | Heating load              | Each enclosed building draws `insulation × (target − ambient)` kW; night demand is roughly 2.5x day demand (test)                                | [x]    |
| F-06 | Population dynamics       | No organic growth — crew arrives only by rocket; colonists above habitat capacity consume double; fractional internally, integer in the UI (test) | [x]    |
| F-07 | Survival score            | 0..100 heuristic combining each resource's days-of-supply and the energy deficit penalty; monotonic in the obvious direction (test)              | [x]    |
| F-08 | Deterministic RNG         | mulberry32 seeded from state; identical seed reproduces the identical event sequence (test)                                                      | [x]    |
| F-09 | Resource history          | Ring buffer of the last 120 sols feeding the sparkline; fixed memory footprint                                                                   | [x]    |

## World and Placement

| ID   | Feature            | Acceptance criterion                                                                                                                                | Status |
| ---- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| F-10 | Hex grid           | Axial coordinates, radius 8 → 217 tiles; neighbour and pixel conversions are correct (test)                                                         | [x]    |
| F-11 | Procedural terrain | Own value-noise implementation drives elevation plus ice and ore deposits; identical seed reproduces identical terrain (test)                       | [x]    |
| F-12 | Building placement | Ghost preview follows the cursor, invalid tiles read red; Ice Extractor requires ice, Mine requires ore, everything else requires empty flat ground | [x]    |
| F-13 | Demolish           | Refunds 50% of the mineral cost; the simulation rebalances on the next tick                                                                         | [x]    |
| F-14 | Idle toggle        | An idled building neither produces nor consumes and renders visibly dimmed                                                                          | [x]    |
| F-15 | Repair             | A meteor-damaged building produces nothing until repaired for minerals                                                                              | [x]    |

## Rendering

| ID   | Feature                      | Acceptance criterion                                                                                                                                                                                                                                                                                                                                                                                                                             | Status |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| F-16 | Procedural building geometry | All 9 types built from code-composed primitives; the repository contains zero model files                                                                                                                                                                                                                                                                                                                                                        | [x]    |
| F-17 | Instanced rendering          | One InstancedMesh for terrain, one per building type, so draw calls stay bounded regardless of colony size; instance matrices are rewritten only on structural change, never per frame. **Frame rate is not asserted** — the e2e browser renders through SwiftShader, where an fps figure would measure the software rasteriser rather than the app. Simulation cost is measured instead: 0.116 ms/tick at 197 buildings (`performance.test.ts`) | [x]    |
| F-18 | Day/night and moving sun     | Sun elevation drives solar output, shadow direction and sky colour; windows turn emissive at night                                                                                                                                                                                                                                                                                                                                               | [x]    |
| F-19 | Resource flow lines          | Animated links from producers to consumers; brightness tracks actual throughput and dims under shortage                                                                                                                                                                                                                                                                                                                                          | [x]    |
| F-20 | RTS camera                   | Orbit, pan and zoom with clamped polar angle and target area                                                                                                                                                                                                                                                                                                                                                                                     | [x]    |

## UI and Persistence

| ID   | Feature                      | Acceptance criterion                                                                                                                                                    | Status |
| ---- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| F-21 | HUD                          | Top bar shows stocks, net flows, sol counter and speed control; bottom build bar; left inspector; bottom-right sparkline                                                | [x]    |
| F-22 | SVG sparkline                | Dependency-free, 4 resource trends, no stutter at 16x                                                                                                                   | [x]    |
| F-23 | Event notifications          | Toast on trigger plus a persistent badge while an event is active                                                                                                       | [x]    |
| F-24 | localStorage persistence     | Autosaves; reload restores the colony; a schema-version mismatch starts clean instead of crashing                                                                       | [x]    |
| F-25 | Starting colony and tooltips | First load presents a running colony plus a dismissible orientation card; hovering a building shows its production, consumption and current efficiency in a corner card | [x]    |
| F-26 | Frame profiler overlay       | F3 toggles 30 s graphs of fps, draw calls and JS heap, reading the live renderer (test); windows the probe did not measure break the line instead of plotting zero      | [x]    |

## Pressure

| ID   | Feature                   | Acceptance criterion                                                                                                                                                                                          | Status |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| F-27 | Binary production and grid outage | Every run flag is exactly 0 or 1 — a partly-served building produces nothing (test); with the battery empty and solar short of demand, every producer stops regardless of tier, behind a blinking banner and a red screen vignette | [x]    |
| F-28 | Deprivation deaths and game over  | Water grants 3 sols and food 7 before deaths begin, counted from the moment stock falls below a sol of need and unwound only slowly on relief; deaths and the HUD warnings stop as soon as stock recovers, leftover clock is debt against the next drought; deaths accelerate the longer a shortage lasts; zero oxygen ends the colony immediately, with a restart screen (test) | [x]    |
| F-29 | Rocket crew deliveries            | A pre-built Landing Pad the player cannot build, idle or demolish receives a vertically descending rocket every 7 sols carrying 5, 10, 15 … colonists; a countdown names the next arrival, and colonists past habitat capacity draw double (test) | [x]    |

## Deliberately Excluded (v1)

Colonist AI · pathfinding · tech tree · audio · custom GLSL · particle systems ·
multiple colony sites · backend · sharing links. Recorded here so that their absence
reads as a decision rather than an omission.
