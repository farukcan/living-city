import { describe, expect, it } from 'vitest';
import { createColony } from '../sim/colony.ts';
import type { SimState } from '../sim/types.ts';
import { fromSaveFile, toSaveFile } from './persistence.ts';

const SEED = 42;

describe('save round-trip', () => {
  it('carries the deprivation clocks across, so relief is not a free reset', () => {
    const colony = createColony(SEED);
    const deprived: SimState = { ...colony, deprivation: { water: 2.4, food: 5.1 } };

    const restored = fromSaveFile(toSaveFile(deprived));

    // One priming tick runs on load, which nudges the clocks by a tick's worth at most.
    expect(restored.deprivation.water).toBeCloseTo(2.4, 1);
    expect(restored.deprivation.food).toBeCloseTo(5.1, 1);
  });

  it('keeps a finished colony finished', () => {
    const colony = createColony(SEED);
    const dead: SimState = { ...colony, gameOver: { sol: 12, cause: 'oxygen' } };

    const restored = fromSaveFile(toSaveFile(dead));

    expect(restored.gameOver).toEqual({ sol: 12, cause: 'oxygen' });
  });

  /**
   * The priming tick in `fromSaveFile` returns early once `gameOver` is set, so restoring
   * the ending before that tick would leave the template colony's report on screen under
   * the game-over card.
   */
  it('builds a dead colony a report from its own buildings, not the template default', () => {
    const colony = createColony(SEED);
    const dead: SimState = {
      ...colony,
      buildings: [],
      gameOver: { sol: 12, cause: 'oxygen' },
    };

    const restored = fromSaveFile(toSaveFile(dead));

    expect(restored.buildings).toHaveLength(0);
    expect(restored.report.populationCapacity).toBe(0);
    expect(restored.report.power.supplyKW).toBe(0);
  });

  it('preserves the landing schedule through `sol` alone', () => {
    const colony = createColony(SEED);
    const later: SimState = { ...colony, sol: 13 };

    const restored = fromSaveFile(toSaveFile(later));

    expect(restored.sol).toBe(13);
  });
});
