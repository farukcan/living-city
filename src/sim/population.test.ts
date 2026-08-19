import { describe, expect, it } from 'vitest';
import {
  DEATH_RAMP_SOLS,
  DEPRIVATION_RECOVERY_RATE,
  GRACE_SOLS,
  PER_CAPITA_CONSUMPTION,
} from './constants.ts';
import { effectivePopulation, updatePopulation } from './population.ts';
import type { DeprivationTimers, ResourceKind } from './types.ts';

const POPULATION = 10;
const DT_SOL = 0.01;

/** Everything in surplus unless a test says otherwise. */
function stocksWith(overrides: Partial<Record<ResourceKind, number>>) {
  return { power: 500, oxygen: 500, water: 5000, food: 500, minerals: 500, ...overrides };
}

function step(params: {
  stocks: Readonly<Record<ResourceKind, number>>;
  deprivation: DeprivationTimers;
  population?: number;
  lifeSupportDeficit?: boolean;
}) {
  const population = params.population ?? POPULATION;
  return updatePopulation({
    population,
    effectivePopulation: population,
    stocks: params.stocks,
    deprivation: params.deprivation,
    lifeSupportDeficit: params.lifeSupportDeficit ?? false,
    dtSol: DT_SOL,
  });
}

/** Advances `sols` of deprivation from a clean start, one DT_SOL at a time. */
function deprive(stocks: Readonly<Record<ResourceKind, number>>, sols: number) {
  let result = { population: POPULATION, deprivation: { water: 0, food: 0 } as DeprivationTimers };
  for (let elapsed = 0; elapsed < sols; elapsed += DT_SOL) {
    result = step({ stocks, deprivation: result.deprivation, population: result.population });
  }
  return result;
}

describe('effectivePopulation', () => {
  it('leaves a housed colony alone', () => {
    expect(effectivePopulation(8, 10)).toBe(8);
    expect(effectivePopulation(10, 10)).toBe(10);
  });

  it('counts colonists above capacity twice', () => {
    expect(effectivePopulation(14, 10)).toBe(18);
    expect(effectivePopulation(20, 0)).toBe(40);
  });
});

describe('deprivation timers', () => {
  it('starts counting when the stock falls below a single sol of need, not at zero', () => {
    const need = POPULATION * PER_CAPITA_CONSUMPTION.water;
    const short = step({
      stocks: stocksWith({ water: need * 0.9 }),
      deprivation: { water: 0, food: 0 },
    });
    expect(short.deprivation.water).toBeCloseTo(DT_SOL, 9);

    const comfortable = step({
      stocks: stocksWith({ water: need * 1.1 }),
      deprivation: { water: 0, food: 0 },
    });
    expect(comfortable.deprivation.water).toBe(0);
  });

  it('unwinds slowly on relief rather than resetting', () => {
    const deprived = deprive(stocksWith({ water: 0 }), 2);
    expect(deprived.deprivation.water).toBeCloseTo(2, 6);

    let recovered = deprived;
    for (let elapsed = 0; elapsed < 2; elapsed += DT_SOL) {
      recovered = step({ stocks: stocksWith({}), deprivation: recovered.deprivation });
    }
    // Two sols of relief undo half a sol of debt at a quarter rate, leaving one and a half.
    expect(recovered.deprivation.water).toBeCloseTo(2 - 2 * DEPRIVATION_RECOVERY_RATE, 6);
  });

  it('clamps so a long drought cannot make the next one instantly fatal', () => {
    const ceiling = GRACE_SOLS.water + DEATH_RAMP_SOLS;
    const forever = deprive(stocksWith({ water: 0 }), ceiling + 20);
    expect(forever.deprivation.water).toBeCloseTo(ceiling, 6);
  });

  it('runs water and food on independent clocks', () => {
    const both = deprive(stocksWith({ water: 0, food: 0 }), 2);
    expect(both.deprivation.water).toBeCloseTo(2, 6);
    expect(both.deprivation.food).toBeCloseTo(2, 6);
  });
});

describe('death', () => {
  it('kills nobody while the grace period holds', () => {
    const inside = deprive(stocksWith({ water: 0 }), GRACE_SOLS.water - 0.1);
    expect(inside.population).toBe(POPULATION);
  });

  it('starts killing once the grace period expires', () => {
    const past = deprive(stocksWith({ water: 0 }), GRACE_SOLS.water + 0.5);
    expect(past.population).toBeLessThan(POPULATION);
  });

  it('accelerates: each sol past the deadline costs more than the last', () => {
    const stocks = stocksWith({ water: 0 });
    const atDeadline = deprive(stocks, GRACE_SOLS.water);

    let first = atDeadline;
    for (let elapsed = 0; elapsed < 1; elapsed += DT_SOL) {
      first = step({ stocks, deprivation: first.deprivation, population: first.population });
    }
    let second = first;
    for (let elapsed = 0; elapsed < 1; elapsed += DT_SOL) {
      second = step({ stocks, deprivation: second.deprivation, population: second.population });
    }

    const firstSolLoss = atDeadline.population - first.population;
    const secondSolLoss = first.population - second.population;
    expect(secondSolLoss).toBeGreaterThan(firstSolLoss);
  });

  it('stacks water and food, so losing both is worse than losing either', () => {
    const past = GRACE_SOLS.food + 1;
    const thirsty = deprive(stocksWith({ water: 0 }), past).population;
    const bothGone = deprive(stocksWith({ water: 0, food: 0 }), past).population;
    expect(bothGone).toBeLessThan(thirsty);
  });

  it('kills for a life-support deficit with no grace period at all', () => {
    const result = step({
      stocks: stocksWith({}),
      deprivation: { water: 0, food: 0 },
      lifeSupportDeficit: true,
    });
    expect(result.population).toBeLessThan(POPULATION);
  });

  it('never drives the population below zero', () => {
    let result = { population: POPULATION, deprivation: { water: 0, food: 0 } as DeprivationTimers };
    const stocks = stocksWith({ water: 0, food: 0 });
    for (let i = 0; i < 5000; i++) {
      result = step({
        stocks,
        deprivation: result.deprivation,
        population: result.population,
        lifeSupportDeficit: true,
      });
      expect(result.population).toBeGreaterThanOrEqual(0);
    }
  });
});
