import { describe, expect, it } from 'vitest';
import { createColony } from '../sim/colony.ts';
import { GRACE_SOLS } from '../sim/constants.ts';
import { projectSnapshot } from './snapshot.ts';

const SEED = 42;

describe('projectSnapshot deprivation flags', () => {
  it('does not treat leftover timer debt as a live shortage', () => {
    const colony = createColony(SEED);
    const ui = projectSnapshot({
      ...colony,
      deprivation: { water: GRACE_SOLS.water + 1, food: GRACE_SOLS.food + 1 },
    });

    expect(ui.waterGraceLeft).toBeLessThan(0);
    expect(ui.foodGraceLeft).toBeLessThan(0);
    expect(ui.waterDeprived).toBe(false);
    expect(ui.foodDeprived).toBe(false);
  });

  it('raises the live shortage when stock is below a sol of need', () => {
    const colony = createColony(SEED);
    const ui = projectSnapshot({
      ...colony,
      stocks: { ...colony.stocks, water: 0, food: 0 },
    });

    expect(ui.waterDeprived).toBe(true);
    expect(ui.foodDeprived).toBe(true);
  });
});
