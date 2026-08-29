import { describe, expect, it } from 'vitest';
import { allocateByPriority } from './allocate.ts';
import { createColony } from './colony.ts';
import {
  DISCHARGE_MAX_KW,
  HOURS_PER_SOL,
  PER_CAPITA_CONSUMPTION,
  SECONDS_PER_SOL,
  TICK_SECONDS,
} from './constants.ts';
import { computeEnvironment, heatingDemandKW, sunElevation } from './environment.ts';
import { computeSurvival } from './survival.ts';
import { resolvePower, solarOutputKW } from './power.ts';
import { computeCaps } from './resources.ts';
import { simulateTick } from './tick.ts';
import type { Building, SimState } from './types.ts';
import { RESOURCE_KINDS } from './types.ts';

const SEED = 42;

function runTicks(state: SimState, count: number, dt: number = TICK_SECONDS): SimState {
  let current = state;
  for (let i = 0; i < count; i++) current = simulateTick(current, dt);
  return current;
}

function buildingsOf(kinds: readonly Building['kind'][]): Building[] {
  return kinds.map((kind, index) => ({
    id: `b${index}`,
    kind,
    q: index,
    r: 0,
    status: 'active' as const,
  }));
}

// ---------------------------------------------------------------------------

describe('allocateByPriority', () => {
  it('serves everything when supply is sufficient', () => {
    const result = allocateByPriority(100, [
      { id: 'a', tier: 1, amount: 40 },
      { id: 'b', tier: 2, amount: 30 },
    ]);
    expect(result.efficiencyById).toEqual({ a: 1, b: 1 });
    expect(result.surplus).toBe(30);
    expect(result.shortfall).toBe(0);
    expect(result.firstStarvedTier).toBeNull();
  });

  it('starves the lowest tier first and leaves higher tiers untouched', () => {
    const result = allocateByPriority(50, [
      { id: 'life', tier: 1, amount: 40 },
      { id: 'food', tier: 3, amount: 20 },
      { id: 'mine', tier: 4, amount: 20 },
    ]);
    expect(result.efficiencyById.life).toBe(1);
    expect(result.efficiencyById.food).toBeCloseTo(0.5, 10);
    expect(result.efficiencyById.mine).toBe(0);
    expect(result.firstStarvedTier).toBe(3);
  });

  it('throttles a contested tier proportionally and equally', () => {
    const result = allocateByPriority(30, [
      { id: 'a', tier: 2, amount: 40 },
      { id: 'b', tier: 2, amount: 40 },
    ]);
    expect(result.efficiencyById.a).toBeCloseTo(0.375, 10);
    expect(result.efficiencyById.a).toBe(result.efficiencyById.b);
  });

  it('is independent of the order demands are listed in', () => {
    const demands = [
      { id: 'a', tier: 4, amount: 25 },
      { id: 'b', tier: 1, amount: 30 },
      { id: 'c', tier: 2, amount: 20 },
    ];
    const forward = allocateByPriority(60, demands);
    const reversed = allocateByPriority(60, [...demands].reverse());
    expect(forward.efficiencyById).toEqual(reversed.efficiencyById);
  });

  it('treats zero-amount demands as satisfied and handles no supply', () => {
    const result = allocateByPriority(0, [
      { id: 'idle', tier: 1, amount: 0 },
      { id: 'hungry', tier: 1, amount: 10 },
    ]);
    expect(result.efficiencyById.idle).toBe(1);
    expect(result.efficiencyById.hungry).toBe(0);
  });

  it('never grants more than was requested', () => {
    const result = allocateByPriority(1000, [{ id: 'a', tier: 1, amount: 10 }]);
    expect(result.granted).toBe(10);
    expect(result.surplus).toBe(990);
  });
});

// ---------------------------------------------------------------------------

describe('environment', () => {
  it('puts the sun up between 0.25 and 0.75 of the sol', () => {
    expect(sunElevation(0.25)).toBeCloseTo(0, 10);
    expect(sunElevation(0.5)).toBeCloseTo(1, 10);
    expect(sunElevation(0.75)).toBeCloseTo(0, 10);
    expect(computeEnvironment(0, 1).sunIntensity).toBe(0);
    expect(computeEnvironment(0.5, 1).sunIntensity).toBeCloseTo(1, 10);
  });

  it('is coldest at midnight and warmest at noon', () => {
    expect(computeEnvironment(0, 1).ambientTemp).toBeCloseTo(-80, 10);
    expect(computeEnvironment(0.5, 1).ambientTemp).toBeCloseTo(-20, 10);
  });

  it('makes heating demand rise at night by the documented ratio', () => {
    const noon = heatingDemandKW(0.12, computeEnvironment(0.5, 1).ambientTemp);
    const midnight = heatingDemandKW(0.12, computeEnvironment(0, 1).ambientTemp);
    expect(midnight / noon).toBeCloseTo(100 / 40, 6);
  });

  it('applies dust as a multiplier on solar output only', () => {
    const buildings = buildingsOf(['solarArray']);
    const clear = solarOutputKW(buildings, computeEnvironment(0.5, 1));
    const storm = solarOutputKW(buildings, computeEnvironment(0.5, 0.3));
    expect(storm).toBeCloseTo(clear * 0.3, 6);
  });
});

// ---------------------------------------------------------------------------

describe('power', () => {
  const dtHours = (TICK_SECONDS / SECONDS_PER_SOL) * HOURS_PER_SOL;

  it('charges the battery from surplus and discharges it on deficit', () => {
    const buildings = buildingsOf(['solarArray', 'batteryBank', 'habitat']);
    const caps = computeCaps(buildings);

    const noon = resolvePower({
      buildings,
      environment: computeEnvironment(0.5, 1),
      batteryStock: 100,
      batteryCap: caps.power,
      batteryBanks: 1,
      dtHours,
    });
    expect(noon.report.batteryChargeKW).toBeGreaterThan(0);
    expect(noon.batteryStock).toBeGreaterThan(100);

    const midnight = resolvePower({
      buildings,
      environment: computeEnvironment(0, 1),
      batteryStock: 100,
      batteryCap: caps.power,
      batteryBanks: 1,
      dtHours,
    });
    expect(midnight.report.supplyKW).toBe(0);
    expect(midnight.report.batteryDischargeKW).toBeGreaterThan(0);
    expect(midnight.batteryStock).toBeLessThan(100);
  });

  it('conserves energy: supply equals what was used, charged or wasted', () => {
    const buildings = buildingsOf(['solarArray', 'solarArray', 'batteryBank', 'habitat', 'mine']);
    const result = resolvePower({
      buildings,
      environment: computeEnvironment(0.5, 1),
      batteryStock: 50,
      batteryCap: computeCaps(buildings).power,
      batteryBanks: 1,
      dtHours,
    });
    const consumed = result.report.demandKW - result.report.batteryDischargeKW;
    expect(result.report.supplyKW).toBeCloseTo(
      consumed + result.report.batteryChargeKW + result.report.wastedKW,
      6,
    );
  });

  it('respects the battery discharge rate limit', () => {
    const buildings = buildingsOf(['batteryBank', 'habitat', 'mine', 'greenhouse']);
    const result = resolvePower({
      buildings,
      environment: computeEnvironment(0, 1),
      batteryStock: 100_000,
      batteryCap: 100_000,
      batteryBanks: 1,
      dtHours,
    });
    expect(result.report.batteryDischargeKW).toBeLessThanOrEqual(DISCHARGE_MAX_KW + 1e-9);
  });

  it('shuts the mine down before the habitat when power runs short', () => {
    const buildings = buildingsOf(['habitat', 'mine']);
    const result = resolvePower({
      buildings,
      environment: computeEnvironment(0, 1),
      batteryStock: 0,
      batteryCap: 0,
      batteryBanks: 0,
      dtHours,
    });
    const mine = buildings[1];
    expect(mine).toBeDefined();
    expect(result.efficiencyById[mine?.id ?? '']).toBe(0);
    expect(result.report.lifeSupportDeficit).toBe(true);
  });

  it('declares an outage only when the battery is empty and the sun cannot cover demand', () => {
    const buildings = buildingsOf(['solarArray', 'habitat', 'iceExtractor']);
    const night = resolvePower({
      buildings,
      environment: computeEnvironment(0, 1),
      batteryStock: 0,
      batteryCap: 400,
      batteryBanks: 1,
      dtHours,
    });
    expect(night.report.outage).toBe(true);

    const noon = resolvePower({
      buildings,
      environment: computeEnvironment(0.5, 1),
      batteryStock: 0,
      batteryCap: 400,
      batteryBanks: 1,
      dtHours,
    });
    expect(noon.report.outage).toBe(false);
  });

  it('stops every producer during an outage, tier order notwithstanding', () => {
    // One panel, and enough demand that it cannot cover the lot. Without the outage rule the
    // tier order would still have fed the extractor from live solar.
    const buildings = buildingsOf(['solarArray', 'habitat', 'iceExtractor', 'greenhouse', 'mine']);
    const result = resolvePower({
      buildings,
      environment: computeEnvironment(0.24, 1),
      batteryStock: 0,
      batteryCap: 400,
      batteryBanks: 1,
      dtHours,
    });

    expect(result.report.outage).toBe(true);
    for (const building of buildings) {
      if (building.kind === 'solarArray') continue;
      expect(result.efficiencyById[building.id], building.kind).toBe(0);
    }
  });

  it('reports zero output for buildings that are not running', () => {
    const colony = createColony(SEED);
    const target = colony.buildings[0];
    expect(target).toBeDefined();
    const idled = simulateTick(
      {
        ...colony,
        buildings: colony.buildings.map((building) =>
          building.id === target?.id ? { ...building, status: 'idle' as const } : building,
        ),
      },
      TICK_SECONDS,
    );
    expect(idled.report.efficiencyById[target?.id ?? '']).toBe(0);
  });

  it('ignores idle buildings entirely but keeps heating damaged ones', () => {
    const environment = computeEnvironment(0, 1);
    const idle = resolvePower({
      buildings: [{ id: 'x', kind: 'habitat', q: 0, r: 0, status: 'idle' }],
      environment,
      batteryStock: 1000,
      batteryCap: 1000,
      batteryBanks: 1,
      dtHours,
    });
    expect(idle.report.demandKW).toBe(0);

    const damaged = resolvePower({
      buildings: [{ id: 'x', kind: 'habitat', q: 0, r: 0, status: 'damaged' }],
      environment,
      batteryStock: 1000,
      batteryCap: 1000,
      batteryBanks: 1,
      dtHours,
    });
    expect(damaged.report.heatDemandKW).toBeGreaterThan(0);
    expect(damaged.report.demandKW).toBe(damaged.report.heatDemandKW);
  });
});

// ---------------------------------------------------------------------------

describe('storage caps', () => {
  it('adds a battery bank to the power cap and a depot to the rest', () => {
    const bare = computeCaps([]);
    const withBank = computeCaps(buildingsOf(['batteryBank']));
    const withDepot = computeCaps(buildingsOf(['storageDepot']));
    expect(withBank.power).toBe(bare.power + 400);
    expect(withDepot.water).toBe(bare.water + 2000);
    expect(withDepot.power).toBe(bare.power);
  });

  it('counts capacity from idle buildings too — a warehouse is still a warehouse', () => {
    const idleDepot: Building[] = [{ id: 'd', kind: 'storageDepot', q: 0, r: 0, status: 'idle' }];
    expect(computeCaps(idleDepot).water).toBe(computeCaps([]).water + 2000);
  });
});

// ---------------------------------------------------------------------------

describe('simulateTick', () => {
  it('does not mutate the state it is given', () => {
    const colony = createColony(SEED);
    const snapshot = structuredClone(colony);
    simulateTick(colony, TICK_SECONDS);
    expect(colony).toEqual(snapshot);
  });

  it('is deterministic across identical runs', () => {
    const a = runTicks(createColony(SEED), 1000);
    const b = runTicks(createColony(SEED), 1000);
    expect(a).toEqual(b);
  });

  it('diverges for different seeds', () => {
    const a = runTicks(createColony(1), 200);
    const b = runTicks(createColony(2), 200);
    expect(a.terrain.tiles).not.toEqual(b.terrain.tiles);
  });

  it('advances the clock and rolls over sols', () => {
    const colony = createColony(SEED);
    const ticksPerSol = SECONDS_PER_SOL / TICK_SECONDS;
    const later = runTicks(colony, ticksPerSol);
    expect(later.sol).toBe(colony.sol + 1);
    expect(later.solTime).toBeCloseTo(colony.solTime, 6);
  });

  it('keeps every stock finite, non-negative and under its cap', () => {
    let state = createColony(SEED);
    for (let i = 0; i < 2000; i++) {
      state = simulateTick(state, TICK_SECONDS);
      for (const resource of RESOURCE_KINDS) {
        const stock = state.stocks[resource];
        expect(Number.isFinite(stock)).toBe(true);
        expect(stock).toBeGreaterThanOrEqual(0);
        expect(stock).toBeLessThanOrEqual(state.report.resources[resource].cap + 1e-6);
      }
      expect(Number.isFinite(state.population)).toBe(true);
      expect(state.population).toBeGreaterThanOrEqual(0);
    }
  });

  it('survives an entire sol of the starting colony without losing life support', () => {
    const ticksPerSol = SECONDS_PER_SOL / TICK_SECONDS;
    let state = createColony(SEED);
    let deficitTicks = 0;
    for (let i = 0; i < ticksPerSol; i++) {
      state = simulateTick(state, TICK_SECONDS);
      if (state.report.power.lifeSupportDeficit) deficitTicks++;
    }
    expect(deficitTicks).toBe(0);
    expect(state.population).toBeGreaterThanOrEqual(1);
  });

  it('stops the mine at night while life support stays fully served', () => {
    const ticksPerSol = SECONDS_PER_SOL / TICK_SECONDS;
    let state = createColony(SEED);
    const mine = state.buildings.find((building) => building.kind === 'mine');
    const habitat = state.buildings.find((building) => building.kind === 'habitat');
    expect(mine).toBeDefined();
    expect(habitat).toBeDefined();

    let minMineEfficiency = 1;
    for (let i = 0; i < ticksPerSol * 2; i++) {
      state = simulateTick(state, TICK_SECONDS);
      minMineEfficiency = Math.min(
        minMineEfficiency,
        state.report.efficiencyById[mine?.id ?? ''] ?? 1,
      );
    }
    // Not merely reduced: production is all-or-nothing, so a shed tier is exactly zero.
    expect(minMineEfficiency).toBe(0);
    expect(state.report.efficiencyById[habitat?.id ?? '']).toBe(1);
  });

  it('reports a run flag of exactly 0 or 1 for every building, every tick', () => {
    let state = createColony(SEED);
    for (let i = 0; i < 2000; i++) {
      state = simulateTick(state, TICK_SECONDS);
      for (const [id, efficiency] of Object.entries(state.report.efficiencyById)) {
        expect([0, 1], `${id} at tick ${i}`).toContain(efficiency);
      }
    }
  });

  it('records history once per hour, bounded by the ring buffer', () => {
    const ticksPerSol = SECONDS_PER_SOL / TICK_SECONDS;
    const before = createColony(SEED);
    const hourBefore = Math.floor((before.sol + before.solTime) * HOURS_PER_SOL);
    const state = runTicks(before, ticksPerSol * 3);
    const hourAfter = Math.floor((state.sol + state.solTime) * HOURS_PER_SOL);
    expect(state.history).toHaveLength(hourAfter - hourBefore);
    expect(state.history.at(-1)?.sol).toBe(state.sol);
  });

  it('reports wasted power rather than silently dropping it', () => {
    let state = createColony(SEED);
    // A colony with far more panels than storage must waste power at midday.
    for (let i = 0; i < 6; i++) {
      const free = state.terrain.tiles.find(
        (tile) => !tile.steep && tile.buildingId === null && tile.deposit === 'none',
      );
      if (!free) break;
      state = {
        ...state,
        stocks: { ...state.stocks, minerals: 1000 },
      };
      state = simulateTick(
        {
          ...state,
          buildings: [
            ...state.buildings,
            { id: `extra${i}`, kind: 'solarArray', q: free.q, r: free.r, status: 'active' },
          ],
          terrain: {
            ...state.terrain,
            tiles: state.terrain.tiles.map((tile) =>
              tile.q === free.q && tile.r === free.r ? { ...tile, buildingId: `extra${i}` } : tile,
            ),
          },
        },
        TICK_SECONDS,
      );
    }
    const noon = simulateTick({ ...state, solTime: 0.5 }, TICK_SECONDS);
    expect(noon.report.power.wastedKW).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

describe('population', () => {
  it('ends the colony the moment oxygen hits zero', () => {
    const suffocated = runTicks(
      {
        ...createColony(SEED),
        stocks: { power: 0, oxygen: 0, water: 0, food: 0, minerals: 0 },
        buildings: [],
      },
      1,
    );
    expect(suffocated.gameOver?.cause).toBe('oxygen');
    expect(suffocated.population).toBeGreaterThanOrEqual(0);
  });

  it('never grows on its own, however well stocked', () => {
    const stocked = runTicks(
      {
        ...createColony(SEED),
        stocks: { power: 900, oxygen: 100, water: 2500, food: 200, minerals: 150 },
      },
      // Short of the sol-7 landing, so any increase here would have to be organic growth.
      600,
    );
    expect(stocked.gameOver).toBeNull();
    expect(stocked.population).toBe(6);
  });

  it('consumes per capita, so more people drain oxygen faster', () => {
    const colony = createColony(SEED);
    // Both figures sit inside the single habitat's capacity of ten, so no overflow is in play.
    const small = simulateTick({ ...colony, population: 4 }, TICK_SECONDS);
    const large = simulateTick({ ...colony, population: 9 }, TICK_SECONDS);
    const delta =
      large.report.resources.oxygen.consumption - small.report.resources.oxygen.consumption;
    expect(delta).toBeCloseTo(5 * PER_CAPITA_CONSUMPTION.oxygen, 6);
  });

  it('charges colonists above habitat capacity twice over', () => {
    const colony = createColony(SEED);
    const capacity = colony.report.populationCapacity;
    expect(capacity).toBe(10);

    // Ten housed plus four sleeping rough draws as eighteen.
    const crowded = simulateTick({ ...colony, population: 14 }, TICK_SECONDS);
    expect(crowded.report.resources.oxygen.consumption).toBeCloseTo(
      18 * PER_CAPITA_CONSUMPTION.oxygen,
      6,
    );
  });

  it('tallies deaths into the current sol and leaves a survivor colony at zero', () => {
    const colony = createColony(SEED);
    expect(colony.deathsThisSol).toBe(0);

    const starving = runTicks(
      {
        ...colony,
        stocks: { ...colony.stocks, water: 0, food: 0 },
        // Both grace periods already spent, so the very next tick kills rather than warns.
        deprivation: { water: 99, food: 99 },
      },
      10,
    );

    expect(starving.deathsThisSol).toBeGreaterThan(0);
    expect(starving.deathsThisSol).toBeCloseTo(colony.population - starving.population, 6);
    expect(starving.deathsPreviousSol).toBe(0);

    const fed = runTicks(colony, 10);
    expect(fed.deathsThisSol).toBe(0);
  });

  it("rolls the sol's toll into the previous bucket at the boundary", () => {
    const colony = createColony(SEED);
    const carried = 3.5;
    const atMidnight: SimState = {
      ...colony,
      stocks: { ...colony.stocks, water: 0, food: 0 },
      deprivation: { water: 99, food: 99 },
      // Just short of midnight, so the short step below crosses exactly one boundary.
      solTime: 0.999,
      deathsThisSol: carried,
      deathsPreviousSol: 1,
    };

    const rolled = simulateTick(atMidnight, SECONDS_PER_SOL * 0.002);

    expect(rolled.sol).toBe(atMidnight.sol + 1);
    expect(rolled.deathsPreviousSol).toBe(carried);
    // The new sol starts its own tally, and two thousandths of one cannot match a full sol's.
    expect(rolled.deathsThisSol).toBeGreaterThan(0);
    expect(rolled.deathsThisSol).toBeLessThan(carried);
  });

  // A landing lands survivors, not resurrections: counting the net change would report a
  // sol that killed three and delivered four as a sol with no casualties at all.
  it('counts deaths separately from an arriving crew', () => {
    const colony = createColony(SEED);
    const dying: SimState = {
      ...colony,
      stocks: { ...colony.stocks, water: 0, food: 0 },
      deprivation: { water: 99, food: 99 },
      // Sol 6 just short of midnight: the next step crosses into the sol-7 landing.
      sol: 6,
      solTime: 0.999,
    };

    const landed = simulateTick(dying, SECONDS_PER_SOL * 0.002);
    expect(landed.population).toBeGreaterThan(dying.population);
    expect(landed.deathsThisSol + landed.deathsPreviousSol).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

describe('survival score', () => {
  const report = (stock: number, production: number, consumption: number) => ({
    stock,
    cap: 1000,
    production,
    consumption,
    net: production - consumption,
    wasted: 0,
  });

  const healthyPower = {
    supplyKW: 100,
    demandKW: 50,
    heatDemandKW: 10,
    batteryChargeKW: 50,
    batteryDischargeKW: 0,
    wastedKW: 0,
    lifeSupportDeficit: false,
    outage: false,
  };

  it('scores a stocked, surplus colony high but never a clean 100', () => {
    const resources = {
      power: report(500, 100, 50),
      oxygen: report(500, 20, 5),
      water: report(500, 200, 100),
      food: report(500, 30, 10),
      minerals: report(500, 30, 0),
    };
    const result = computeSurvival(resources, healthyPower, 6);
    expect(result.score).toBeGreaterThan(90);
    expect(result.score).toBeLessThan(100);
  });

  it('falls as the scarcest resource runs down', () => {
    const build = (foodStock: number) => ({
      power: report(500, 100, 50),
      oxygen: report(500, 20, 5),
      water: report(500, 200, 100),
      food: report(foodStock, 0, 10),
      minerals: report(500, 30, 0),
    });
    const rich = computeSurvival(build(300), healthyPower, 6).score;
    const poor = computeSurvival(build(20), healthyPower, 6).score;
    expect(poor).toBeLessThan(rich);
  });

  it('penalises a life-support deficit hard', () => {
    const resources = {
      power: report(500, 100, 50),
      oxygen: report(500, 20, 5),
      water: report(500, 200, 100),
      food: report(500, 30, 10),
      minerals: report(500, 30, 0),
    };
    const healthy = computeSurvival(resources, healthyPower, 6).score;
    const failing = computeSurvival(
      resources,
      { ...healthyPower, lifeSupportDeficit: true, supplyKW: 10 },
      6,
    ).score;
    expect(failing).toBeLessThan(healthy * 0.5);
  });

  it('is zero for an empty colony', () => {
    const resources = {
      power: report(0, 0, 0),
      oxygen: report(0, 0, 0),
      water: report(0, 0, 0),
      food: report(0, 0, 0),
      minerals: report(0, 0, 0),
    };
    expect(computeSurvival(resources, healthyPower, 0).score).toBe(0);
  });
});

describe('createColony across seeds', () => {
  /**
   * The "New colony" button passes an arbitrary seed straight into createColony, so a
   * single seed that cannot host the starting layout is a crash on a button press.
   */
  it('builds a viable starting colony for a wide sweep of seeds', () => {
    for (let seed = -200; seed <= 200; seed += 11) {
      const colony = createColony(seed);
      expect(colony.buildings.length, `seed ${seed}`).toBe(14);
      expect(colony.population).toBeGreaterThan(0);
      // createColony runs one tick to populate the report, so the mine has already
      // produced a sliver of a sol's output by the time this is read.
      expect(colony.stocks.minerals).toBeCloseTo(150, 0);
      expect(colony.report.power.lifeSupportDeficit).toBe(false);
    }
  });
});
