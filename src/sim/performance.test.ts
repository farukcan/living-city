import { describe, expect, it } from 'vitest';
import { createColony } from './colony.ts';
import { TICK_SECONDS } from './constants.ts';
import { addBuilding, checkPlacement } from './placement.ts';
import { simulateTick } from './tick.ts';
import type { BuildingKind, SimState } from './types.ts';

/**
 * Simulation cost, measured rather than assumed.
 *
 * The claim in PRD.md is that a 10 Hz tick over a couple of hundred buildings is cheap
 * enough to keep on the main thread. These tests hold that claim to a number so that a
 * future change which makes the tick quadratic fails here instead of in someone's frame
 * rate.
 *
 * The thresholds are deliberately loose — CI machines are slow and shared — but they are
 * orders of magnitude away from a real regression.
 */

const ROTATION: readonly BuildingKind[] = [
  'solarArray',
  'batteryBank',
  'greenhouse',
  'storageDepot',
  'habitat',
  'electrolyzer',
];

/** Fills the map with buildings, ignoring cost so the count is what is being measured. */
function colonyWithBuildings(target: number): SimState {
  let state: SimState = {
    ...createColony(42),
    stocks: { ...createColony(42).stocks, minerals: 1_000_000 },
  };

  let rotation = 0;
  for (const tile of state.terrain.tiles) {
    if (state.buildings.length >= target) break;
    if (tile.steep || tile.buildingId !== null) continue;
    const kind = ROTATION[rotation % ROTATION.length] ?? 'solarArray';
    rotation++;
    if (checkPlacement(state, kind, tile.q, tile.r).ok) {
      state = addBuilding(state, kind, tile.q, tile.r);
    }
  }
  return state;
}

function measureTickMs(state: SimState, ticks: number): number {
  let current = state;
  const started = performance.now();
  for (let i = 0; i < ticks; i++) current = simulateTick(current, TICK_SECONDS);
  const elapsed = performance.now() - started;
  // Touch the result so the loop cannot be optimised away entirely.
  expect(current.sol).toBeGreaterThan(0);
  return elapsed / ticks;
}

describe('simulation performance', () => {
  it('fills the map for the benchmark', () => {
    expect(colonyWithBuildings(150).buildings.length).toBeGreaterThan(100);
  });

  it('ticks a large colony in well under one frame', () => {
    const perTickMs = measureTickMs(colonyWithBuildings(150), 600);
    // 16x speed runs 160 ticks a second; at 1 ms each that is 16% of a core. The real
    // measurement is far below this, but the ceiling is what matters for the claim.
    expect(perTickMs).toBeLessThan(1);
  });

  it('scales roughly linearly with building count, not quadratically', () => {
    const small = measureTickMs(colonyWithBuildings(30), 400);
    const large = measureTickMs(colonyWithBuildings(150), 400);

    // Five times the buildings must not cost anything like twenty-five times the work.
    // A generous ceiling: this test is here to catch an accidental O(n²), not to police
    // constant factors on a noisy machine.
    expect(large).toBeLessThan(Math.max(small * 12, 0.5));
  });
});
