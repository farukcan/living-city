import { describe, expect, it } from 'vitest';
import { createColony } from './colony.ts';
import { TICK_SECONDS } from './constants.ts';
import { simulateTick } from './tick.ts';
import type { SimState } from './types.ts';

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
});
