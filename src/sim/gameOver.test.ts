import { describe, expect, it } from 'vitest';
import { createColony } from './colony.ts';
import { TICK_SECONDS, WIN_HABITATS, WIN_POPULATION, WIN_SOLS } from './constants.ts';
import { simulateTick } from './tick.ts';
import type { Building, SimState } from './types.ts';

const SEED = 42;

/** A colony with no air and nothing left to make any. */
function airless(): SimState {
  const colony = createColony(SEED);
  return {
    ...colony,
    buildings: [],
    stocks: { power: 0, oxygen: 0, water: 500, food: 200, minerals: 0 },
  };
}

/** Enough habitats and battery banks to clear the win thresholds without a resource death. */
function thrivingColony(habitatCount: number, population: number): SimState {
  const habitats: Building[] = Array.from({ length: habitatCount }, (_, i) => ({
    id: `h${i}`,
    kind: 'habitat' as const,
    q: i,
    r: 0,
    status: 'active' as const,
  }));
  // Two battery banks give the habitats' tier-1 demand enough discharge capacity that the
  // colony does not take a life-support death mid-tick and shave population under threshold.
  const batteries: Building[] = [
    { id: 'bb0', kind: 'batteryBank' as const, q: 100, r: 0, status: 'active' as const },
    { id: 'bb1', kind: 'batteryBank' as const, q: 101, r: 0, status: 'active' as const },
  ];

  const colony = createColony(SEED);
  return {
    ...colony,
    sol: WIN_SOLS,
    buildings: [...habitats, ...batteries],
    population,
    stocks: { power: 100, oxygen: 1e6, water: 1e6, food: 1e6, minerals: 0 },
  };
}

describe('game over', () => {
  it('ends the colony the moment the oxygen stock reaches zero', () => {
    const dead = simulateTick(airless(), TICK_SECONDS);
    expect(dead.gameOver).not.toBeNull();
    expect(dead.gameOver?.cause).toBe('oxygen');
    expect(dead.gameOver?.sol).toBe(dead.sol);
  });

  it('stops the simulation dead — the same state comes back out', () => {
    const dead = simulateTick(airless(), TICK_SECONDS);
    expect(simulateTick(dead, TICK_SECONDS)).toBe(dead);
  });

  it('freezes the clock, so a finished run cannot keep accruing sols', () => {
    let state = simulateTick(airless(), TICK_SECONDS);
    const { sol, solTime } = state;
    for (let i = 0; i < 500; i++) state = simulateTick(state, TICK_SECONDS);
    expect(state.sol).toBe(sol);
    expect(state.solTime).toBe(solTime);
  });

  it('ends a colony that starved down to nobody, rather than simulating an empty base', () => {
    // Air aplenty, but no water or food and no way to make either.
    const colony = createColony(SEED);
    let state: SimState = {
      ...colony,
      buildings: [],
      stocks: { power: 0, oxygen: 1e9, water: 0, food: 0, minerals: 0 },
    };
    for (let i = 0; i < 100_000 && state.gameOver === null; i++) {
      state = simulateTick(state, TICK_SECONDS);
    }
    expect(state.gameOver?.cause).toBe('depopulated');
    expect(state.population).toBeLessThan(1);
  });

  it('leaves a healthy colony alone', () => {
    const colony = createColony(SEED);
    expect(colony.gameOver).toBeNull();
  });

  it('declares victory once sols survived, habitats built and population all clear their thresholds', () => {
    const state = thrivingColony(WIN_HABITATS, WIN_POPULATION);
    const ticked = simulateTick(state, TICK_SECONDS);
    expect(ticked.gameOver).not.toBeNull();
    expect(ticked.gameOver?.cause).toBe('victory');
    expect(ticked.gameOver?.sol).toBe(WIN_SOLS);
  });

  it('does not declare victory while any one threshold is short', () => {
    const shortOnHabitats = simulateTick(
      thrivingColony(WIN_HABITATS - 1, WIN_POPULATION),
      TICK_SECONDS,
    );
    expect(shortOnHabitats.gameOver).toBeNull();

    const shortOnPopulation = simulateTick(
      thrivingColony(WIN_HABITATS, WIN_POPULATION - 1),
      TICK_SECONDS,
    );
    expect(shortOnPopulation.gameOver).toBeNull();

    const shortOnSols = simulateTick(
      { ...thrivingColony(WIN_HABITATS, WIN_POPULATION), sol: WIN_SOLS - 1 },
      TICK_SECONDS,
    );
    expect(shortOnSols.gameOver).toBeNull();
  });
});
