import { describe, expect, it } from 'vitest';
import { LANDING_INTERVAL_SOLS } from '../sim/rocket.ts';
import {
  ASCENT_SOLS,
  DESCENT_SOLS,
  DESCENT_START,
  ENTRY_ALTITUDE,
  REST_SOLS,
  rocketCycle,
  rocketPhase,
} from './rocketPhase.ts';

describe('rocketPhase', () => {
  it('rests on the pad with the engine off just after touchdown', () => {
    const parked = rocketPhase(0);
    expect(parked.visible).toBe(true);
    expect(parked.altitude).toBe(0);
    expect(parked.thrust).toBe(0);
  });

  it('climbs away and is out of sight before the next approach begins', () => {
    const liftOff = rocketPhase(REST_SOLS + 0.01);
    expect(liftOff.visible).toBe(true);
    expect(liftOff.altitude).toBeGreaterThan(0);
    expect(liftOff.thrust).toBeGreaterThan(0);

    expect(rocketPhase(REST_SOLS + ASCENT_SOLS + 0.01).visible).toBe(false);
    expect(rocketPhase(DESCENT_START - 0.01).visible).toBe(false);
  });

  it('drops from the entry altitude to the pad across the descent', () => {
    const entry = rocketPhase(DESCENT_START);
    expect(entry.visible).toBe(true);
    expect(entry.altitude).toBeCloseTo(ENTRY_ALTITUDE, 6);

    const touchdown = rocketPhase(DESCENT_START + DESCENT_SOLS - 1e-9);
    expect(touchdown.altitude).toBeLessThan(0.01);
  });

  it('descends monotonically, so the rocket never bobs on the way in', () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let t = DESCENT_START; t < LANDING_INTERVAL_SOLS; t += DESCENT_SOLS / 50) {
      const { altitude } = rocketPhase(t);
      expect(altitude).toBeLessThan(previous);
      previous = altitude;
    }
  });

  it('burns hardest at touchdown and eases off after lift-off', () => {
    expect(rocketPhase(LANDING_INTERVAL_SOLS - 1e-9).thrust).toBeGreaterThan(
      rocketPhase(DESCENT_START).thrust,
    );
    expect(rocketPhase(REST_SOLS + ASCENT_SOLS - 1e-9).thrust).toBeLessThan(
      rocketPhase(REST_SOLS + 1e-9).thrust,
    );
  });

  it('stays inside the sun rig’s shadow frustum at every point in the cycle', () => {
    // The directional light's ortho box is ±24; a rocket above that loses its shadow.
    for (let t = 0; t < LANDING_INTERVAL_SOLS; t += 0.01) {
      expect(rocketPhase(t).altitude).toBeLessThanOrEqual(ENTRY_ALTITUDE);
      expect(rocketPhase(t).altitude).toBeGreaterThanOrEqual(0);
    }
  });

  it('covers the whole cycle: every point is parked, climbing, hidden or descending', () => {
    for (let t = 0; t < LANDING_INTERVAL_SOLS; t += 0.005) {
      const phase = rocketPhase(t);
      expect(Number.isFinite(phase.altitude)).toBe(true);
      expect(phase.thrust).toBeGreaterThanOrEqual(0);
      expect(phase.thrust).toBeLessThanOrEqual(1);
    }
  });
});

describe('rocketCycle', () => {
  it('cycles the founding rocket on solTime alone through the whole opening sol', () => {
    expect(rocketCycle(1, 0)).toBe(0);
    expect(rocketCycle(1, 0.3)).toBe(0.3);
    expect(rocketCycle(1, 0.999)).toBeCloseTo(0.999, 6);
  });

  it('shows the founding rocket parked at the colony’s actual starting solTime', () => {
    // src/sim/colony.ts starts a fresh colony at sol 1, solTime 0.3.
    const phase = rocketPhase(rocketCycle(1, 0.3));
    expect(phase.visible).toBe(true);
    expect(phase.altitude).toBe(0);
  });

  it('lifts the founding rocket off partway through sol 1, then hides it again', () => {
    expect(rocketPhase(rocketCycle(1, REST_SOLS + 0.01)).visible).toBe(true);
    expect(rocketPhase(rocketCycle(1, REST_SOLS + ASCENT_SOLS + 0.01)).visible).toBe(false);
  });

  it('falls back to the periodic (sol + solTime) % LANDING_INTERVAL_SOLS cycle from sol 2 on', () => {
    expect(rocketCycle(2, 0.4)).toBeCloseTo(2.4, 6);
    expect(rocketCycle(8, 0.5)).toBeCloseTo(1.5, 6); // (8.5) % 7
    expect(rocketCycle(7, 0)).toBeCloseTo(0, 6); // touchdown wraps the cycle to 0
  });

  it('never shows a rocket on sol 2 through the empty-pad gap before the real landing', () => {
    for (let sol = 2; sol < LANDING_INTERVAL_SOLS; sol++) {
      for (let solTime = 0; solTime < 1; solTime += 0.05) {
        if (sol + solTime >= DESCENT_START) continue; // the real descent has begun
        expect(rocketPhase(rocketCycle(sol, solTime)).visible).toBe(false);
      }
    }
  });
});
