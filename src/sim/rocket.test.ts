import { describe, expect, it } from 'vitest';
import { createColony } from './colony.ts';
import { SECONDS_PER_SOL, TICK_SECONDS } from './constants.ts';
import {
  crewArriving,
  crewForLanding,
  landingsBySol,
  LANDING_INTERVAL_SOLS,
  nextLandingCrew,
  solsUntilLanding,
} from './rocket.ts';
import { simulateTick } from './tick.ts';
import type { SimState } from './types.ts';

const SEED = 42;
const TICKS_PER_SOL = SECONDS_PER_SOL / TICK_SECONDS;

/**
 * Keeps the colony fed so the schedule, not starvation, is what these tests measure.
 *
 * Deaths are not suppressed — a dust storm past the event grace period can still black the
 * grid out and cost life support — which is why the arrival tests below measure the jump
 * across a landing boundary rather than an absolute head count.
 */
function topUp(state: SimState): SimState {
  return { ...state, stocks: { ...state.stocks, oxygen: 1e9, water: 1e9, food: 1e9 } };
}

function wellStocked(): SimState {
  return topUp(createColony(SEED));
}

function runTicks(state: SimState, count: number): SimState {
  let current = state;
  for (let i = 0; i < count; i++) current = topUp(simulateTick(current, TICK_SECONDS));
  return current;
}

/** Ticks until `sol` changes, returning the head count on either side of the boundary. */
function crossNextSolBoundary(state: SimState): {
  readonly state: SimState;
  readonly delivered: number;
  readonly sol: number;
} {
  let current = state;
  for (let i = 0; i < TICKS_PER_SOL * 2; i++) {
    const before = current.population;
    const next = topUp(simulateTick(current, TICK_SECONDS));
    if (next.sol !== current.sol) {
      return { state: next, delivered: next.population - before, sol: next.sol };
    }
    current = next;
  }
  throw new Error('No sol boundary was crossed');
}

/** Runs up to the tick before `sol` becomes `target`. */
function runToSolEve(target: number): SimState {
  let state = wellStocked();
  while (state.sol < target - 1) state = runTicks(state, 1);
  while (state.sol === target - 1) {
    const next = runTicks(state, 1);
    if (next.sol === target) return state;
    state = next;
  }
  return state;
}

describe('landing schedule', () => {
  it('counts landings by whole intervals', () => {
    expect(landingsBySol(6)).toBe(0);
    expect(landingsBySol(7)).toBe(1);
    expect(landingsBySol(13)).toBe(1);
    expect(landingsBySol(14)).toBe(2);
  });

  it('adds five more colonists to every landing, without bound', () => {
    expect([1, 2, 3, 4].map(crewForLanding)).toEqual([5, 10, 15, 20]);
    expect(crewForLanding(100)).toBe(500);
  });

  it('delivers only on the tick that crosses a boundary', () => {
    expect(crewArriving(6, 7)).toBe(5);
    expect(crewArriving(7, 7)).toBe(0);
    expect(crewArriving(13, 14)).toBe(10);
  });

  it('sums the landings a long step skipped over', () => {
    expect(crewArriving(6, 14)).toBe(15);
  });

  it('counts down inside one interval and names the next crew', () => {
    const early = solsUntilLanding(3, 0.2);
    const later = solsUntilLanding(3, 0.8);
    expect(later).toBeLessThan(early);
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThanOrEqual(LANDING_INTERVAL_SOLS);
    expect(nextLandingCrew(3)).toBe(5);
    expect(nextLandingCrew(7)).toBe(10);
  });
});

describe('crew arriving in the simulation', () => {
  it('issues every colony a landing pad it cannot have built', () => {
    const colony = createColony(SEED);
    const pads = colony.buildings.filter((building) => building.kind === 'rocketPad');
    expect(pads).toHaveLength(1);
  });

  it('delivers five colonists on the sol-7 boundary and ten on the sol-14 one', () => {
    const first = crossNextSolBoundary(runToSolEve(7));
    expect(first.sol).toBe(7);
    expect(first.delivered).toBeCloseTo(5, 6);

    const second = crossNextSolBoundary(runToSolEve(14));
    expect(second.sol).toBe(14);
    expect(second.delivered).toBeCloseTo(10, 6);
  });

  it('delivers nothing on a sol that is not a landing', () => {
    const quiet = crossNextSolBoundary(runToSolEve(6));
    expect(quiet.sol).toBe(6);
    expect(quiet.delivered).toBeLessThanOrEqual(0);
  });

  it('announces the landing so the HUD can toast it', () => {
    const landed = crossNextSolBoundary(runToSolEve(7));
    expect(landed.state.notices.some((notice) => notice.kind === 'crewArrival')).toBe(true);
  });
});
