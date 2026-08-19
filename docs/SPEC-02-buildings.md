# SPEC-02 — Buildings and Tuning

**This is the single source of truth for every number in the simulation.**
`src/sim/constants.ts` mirrors this file exactly. If a value changes, it changes here first.

## Global Constants

| Constant                | Value       | Note                                       |
| ----------------------- | ----------- | ------------------------------------------ |
| `SECONDS_PER_SOL`       | 60          | wall-clock seconds per sol at 1x           |
| `HOURS_PER_SOL`         | 24.66       | real Martian sol length, used for kW → kWh |
| `TICK_SECONDS`          | 0.1         | fixed timestep                             |
| `SPEEDS`                | 0, 1, 4, 16 | pause, normal, fast, very fast             |
| `TEMP_DAY`              | −20 °C      | ambient at full sun                        |
| `TEMP_NIGHT`            | −80 °C      | ambient at night                           |
| `TARGET_TEMP`           | 20 °C       | interior setpoint                          |
| `SURVIVAL_HORIZON_SOLS` | 30          | scale factor in the survival score         |
| `HISTORY_SOLS`          | 120         | sparkline ring buffer length               |

## Per-Capita Consumption

| Resource | Rate        | Source of the number                    |
| -------- | ----------- | --------------------------------------- |
| Oxygen   | 0.85 kg/sol | ISS metabolic consumption, rounded      |
| Water    | 4 L/sol     | ISS with recycling, rounded up for Mars |
| Food     | 1.8 kg/sol  | ISS daily food mass                     |

Population consumption is global — it scales with people, not with Habitat count. A Habitat
provides capacity, base power and a heat load; it does not itself eat.

## Storage Caps

| Resource | Base cap | Per Battery Bank | Per Storage Depot |
| -------- | -------- | ---------------- | ----------------- |
| Power    | 100 kWh  | +400 kWh         | —                 |
| Water    | 500 L    | —                | +2000 L           |
| Oxygen   | 100 kg   | —                | +300 kg           |
| Food     | 200 kg   | —                | +600 kg           |
| Minerals | 200 kg   | —                | +500 kg           |

Battery rate limits: `CHARGE_MAX_KW = 100` and `DISCHARGE_MAX_KW = 120` **per bank**.
Rate limits matter: they are why a single bank cannot carry a colony through the night no
matter how much energy it stores.

## The Nine Buildings

| Building      | Cost | Base power | Insulation | Produces                        | Consumes       | Tile    | Tier |
| ------------- | ---- | ---------- | ---------- | ------------------------------- | -------------- | ------- | ---- |
| Solar Array   | 20   | —          | 0          | power `60 × sun × dust` kW      | —              | flat    | —    |
| Battery Bank  | 30   | —          | 0.02       | power cap +400 kWh              | —              | flat    | —    |
| Habitat       | 60   | 5 kW       | 0.12       | pop capacity +10                | —              | flat    | 1    |
| Ice Extractor | 35   | 14 kW      | 0.03       | water 120 L/sol                 | —              | **ice** | 2    |
| Electrolyzer  | 40   | 8 kW       | 0.04       | oxygen 12 kg/sol                | water 15 L/sol | flat    | 2    |
| Greenhouse    | 50   | 10 kW      | 0.15       | food 20 kg/sol, oxygen 6 kg/sol | water 60 L/sol | flat    | 3    |
| Mine          | 45   | 12 kW      | 0.03       | minerals 30 kg/sol              | —              | **ore** | 4    |
| Storage Depot | 25   | —          | 0.05       | storage caps (above)            | —              | flat    | —    |
| Landing Pad   | —    | —          | 0          | crew (see below)                | —              | flat    | —    |

The Landing Pad is the one building the player never touches: it is issued with the colony,
cannot be placed, idled or demolished, and does not appear in the build bar. It is also
deliberately **inert** — no power draw, no heat load — so that adding it left every measured
figure in this document true.

Cost is in minerals. Demolishing refunds 50%, rounded down. Repairing a damaged building
costs 30% of its build cost.

**Insulation** is in kW/°C. Heat draw is `insulation × (TARGET_TEMP − ambientTemp)`,
so the same building costs 4.8 kW at noon and 12 kW at midnight. Insulation is why the
Greenhouse — all that glass — is the most expensive thing to keep warm.

## Load Shedding

A tier may draw on stored power only while the battery is above its reserve threshold.

| Tier | Consumers                   | Reserve threshold  |
| ---- | --------------------------- | ------------------ |
| 1    | Life support and heating    | 0% — always served |
| 2    | Ice Extractor, Electrolyzer | 15%                |
| 3    | Greenhouse                  | 35%                |
| 4    | Mine                        | 55%                |

Below its threshold a tier runs on live solar only, which at night means not at all.

This rule is not decoration; without it the simulation has a cliff. The allocator sees a
360 kW discharge limit against a 92 kW demand, serves every tier in full all evening, and
then the battery hits zero and life support fails outright with no warning. Reserving the
bottom of the battery for the tiers that keep people alive turns that cliff into the
intended sequence: the mine stops, then the greenhouse, then water and oxygen, and the
habitat still reaches sunrise.

## Starting Colony

Placed at first load so the demo never opens on an empty grid.

| Building      | Count |
| ------------- | ----- |
| Solar Array   | 5     |
| Battery Bank  | 3     |
| Habitat       | 1     |
| Ice Extractor | 1     |
| Electrolyzer  | 1     |
| Greenhouse    | 1     |
| Mine          | 1     |
| Landing Pad   | 1     |

Starting population 6, minerals 150, battery 900 kWh.

## Balance, as Measured

The figures below are **measured from a two-sol headless run**, not derived on paper. An
earlier version of this document predicted the colony from closed-form arithmetic and was
wrong by 7%: averaging the day and night load ignores that dawn and dusk carry a near-night
heating bill on almost no sunlight. The effective night is about 14.8 hours, not 12.3.

```
base load      = 5 (habitat) + 14 (ice) + 8 (electrolyzer) + 10 (greenhouse) + 12 (mine)
               = 49 kW
insulation sum = 0.12 + 0.03 + 0.04 + 0.15 + 0.03 + 3×0.02 = 0.43 kW/°C
heat at noon   = 0.43 × 40  = 17 kW        → day load   ≈ 66 kW
heat at night  = 0.43 × 100 = 43 kW        → night load ≈ 92 kW

measured mean supply = 95.5 kW      (5 arrays × 60 kW peak, mean sun 1/π)
measured mean demand = 83.8 kW
battery capacity     = 100 + 3×400 = 1300 kWh
battery at sunrise   = 278 kWh (21%)
life-support deficit = 0 ticks over two sols
```

The 14% supply margin is what pays for the night, not for growth. Over a sol the colony
banks roughly 1300 kWh by noon, wastes the rest — visibly, in the HUD — and spends it all
before dawn. Crossing the 55% and 35% thresholds every night is what shuts the mine and
then the greenhouse, which is the lesson the demo exists to teach.

> **These figures predate crew deliveries and binary production, and are due a re-measure.**
> They were taken from a two-sol run, which lands entirely before the first rocket and before
> a dust storm can black the grid out. They remain accurate for the opening of a colony and
> should not be read as a steady state.

## Crew Deliveries

| Constant                | Value | Note                                     |
| ----------------------- | ----- | ---------------------------------------- |
| `LANDING_INTERVAL_SOLS` | 7     | first landing on sol 7                   |
| `CREW_PER_LANDING_STEP` | 5     | crew on landing *n* is `5n`: 5, 10, 15, … |

Landings are mandatory and unbounded. Cumulative crew is `5·n(n+1)/2`, so the colony reaches
11 by sol 7, 21 by sol 14, 36 by sol 21. Against a Habitat capacity of 10 that means the
colony is permanently over capacity from the first landing onward, and every colonist past
capacity draws **double** (see [SPEC-01](./SPEC-01-simulation.md)).

`CREW_PER_LANDING_STEP` is the highest-leverage number in the game: the ramp is quadratic in
it. It is the first dial to reach for if the difficulty needs adjusting, ahead of
`BASE_CAPS.oxygen` and the Habitat's capacity.

## Deprivation and Death

| Constant                     | Value      | Note                                          |
| ---------------------------- | ---------- | --------------------------------------------- |
| `GRACE_SOLS.water`           | 3          | sols without water before deaths begin        |
| `GRACE_SOLS.food`            | 7          | sols without food before deaths begin         |
| `DEPRIVATION_RECOVERY_RATE`  | 0.25       | relief unwinds the clock at a quarter rate    |
| `DEATH_RAMP_SOLS`            | 5          | sols past the deadline where the rate caps    |
| `DEATH_ACCELERATION`         | 3          | added to the rate multiplier per sol overrun  |
| `DEATH_RATE_PER_SOL`         | 0.02       | rate at the moment a grace period expires     |
| `MIN_VIABLE_POPULATION`      | 0          | floor; below one colonist the colony ends     |

Oxygen appears nowhere here on purpose: it has no grace period at all. Reaching zero is an
immediate loss. Relief stops deaths immediately; the leftover clock is debt against the
next drought (see [SPEC-01](./SPEC-01-simulation.md)).

## Placement Rules

1. The kind must be buildable. The Landing Pad is not.
2. The tile must exist and be unoccupied.
3. The tile must not be too steep (see [SPEC-03](./SPEC-03-world.md)).
4. Ice Extractor requires an `ice` deposit; Mine requires an `ore` deposit.
5. Minerals in stock must cover the cost.

Rule 1 is enforced at the user-action boundary rather than inside `checkPlacement`, because
the starting colony routes its own buildings — the pad included — through that same check.
The same flag also refuses demolishing or idling a pad, and hides both buttons in the
inspector.

Failures surface as a red ghost plus a reason string in the HUD — never a silent no-op.

## Building States

| State     | Produces           | Consumes  | Appearance                           |
| --------- | ------------------ | --------- | ------------------------------------ |
| `active`  | at full rate or 0  | yes       | full colour, emissive at night       |
| `idle`    | no                 | no        | desaturated, no emissive             |
| `damaged` | no                 | heat only | dark, tilted, sparking accent colour |

An `active` building still produces nothing unless it was served its full power and water
request — production is all-or-nothing, so the HUD reports Running or Stopped rather than a
percentage.

A damaged building still needs heating: the meteor hole does not stop the colony paying to
keep the building from freezing. Repair costs 30% of build cost.
