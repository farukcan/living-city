import { describe, expect, it } from 'vitest';
import { createColony } from './colony.ts';
import { SECONDS_PER_SOL, TICK_SECONDS } from './constants.ts';
import { computeEnvironment } from './environment.ts';
import {
  advanceEvents,
  DUST_STORM_SOLAR_FACTOR,
  GRACE_PERIOD_SOLS,
  MEAN_EVENT_INTERVAL_SOLS,
  dustFactorFrom,
  extraDrainFrom,
} from './events.ts';
import { solarOutputKW } from './power.ts';
import { simulateTick } from './tick.ts';
import type { EventKind, SimState } from './types.ts';

const TICKS_PER_SOL = SECONDS_PER_SOL / TICK_SECONDS;

/**
 * Keeps a colony alive for as long as a test needs to watch the event stream.
 *
 * Rockets land every seven sols and each one is larger than the last, so an untended colony
 * ends well before the hundreds of sols these tests sample over — and a finished simulation
 * returns the same state forever, which would freeze the event stream mid-run.
 */
function topUp(state: SimState): SimState {
  return { ...state, stocks: { ...state.stocks, oxygen: 1e9, water: 1e9, food: 1e9 } };
}

function runSols(state: SimState, sols: number): SimState {
  let current = state;
  for (let i = 0; i < sols * TICKS_PER_SOL; i++) {
    current = topUp(simulateTick(current, TICK_SECONDS));
  }
  return current;
}

/**
 * Collects every random event that fires over a run, with the sol it fired on.
 *
 * `crewArrival` shares the notice channel but is scheduled, not rolled — counting it would
 * put a landing every seven sols into the event rate.
 */
function collectEvents(seed: number, sols: number): { kind: EventKind; sol: number }[] {
  let state = createColony(seed);
  const fired: { kind: EventKind; sol: number }[] = [];
  for (let i = 0; i < sols * TICKS_PER_SOL; i++) {
    state = topUp(simulateTick(state, TICK_SECONDS));
    for (const notice of state.notices) {
      if (notice.started && notice.kind !== 'crewArrival') {
        fired.push({ kind: notice.kind, sol: notice.sol });
      }
    }
  }
  return fired;
}

describe('event effects', () => {
  it('cuts solar output to 30% during a dust storm', () => {
    const buildings = [
      { id: 'a', kind: 'solarArray' as const, q: 0, r: 0, status: 'active' as const },
    ];
    const clear = solarOutputKW(buildings, computeEnvironment(0.5, dustFactorFrom([])));
    const storm = solarOutputKW(
      buildings,
      computeEnvironment(0.5, dustFactorFrom([{ kind: 'dustStorm', solsRemaining: 2 }])),
    );
    expect(storm).toBeCloseTo(clear * DUST_STORM_SOLAR_FACTOR, 6);
  });

  it('adds an oxygen drain only while a leak is open', () => {
    expect(extraDrainFrom([])).toEqual({});
    expect(extraDrainFrom([{ kind: 'oxygenLeak', solsRemaining: 1 }]).oxygen).toBe(8);
  });

  it('expires durational events and emits an ending notice', () => {
    const outcome = advanceEvents({
      activeEvents: [{ kind: 'dustStorm', solsRemaining: 0.001 }],
      buildings: [],
      rngState: 1,
      sol: 20,
      dtSol: 0.01,
    });
    expect(outcome.activeEvents).toHaveLength(0);
    expect(outcome.notices).toContainEqual({ kind: 'dustStorm', sol: 20, started: false });
  });

  it('never starts a second event of a kind already running', () => {
    // dtSol equal to the mean interval makes a draw near-certain every call. The storm is
    // given a duration far longer than that so it cannot expire and free the slot.
    let rngState = 99;
    let maxConcurrentStorms = 0;
    for (let i = 0; i < 400; i++) {
      const outcome = advanceEvents({
        activeEvents: [{ kind: 'dustStorm', solsRemaining: 5000 }],
        buildings: [],
        rngState,
        sol: 50,
        dtSol: MEAN_EVENT_INTERVAL_SOLS,
      });
      rngState = outcome.rngState;
      maxConcurrentStorms = Math.max(
        maxConcurrentStorms,
        outcome.activeEvents.filter((event) => event.kind === 'dustStorm').length,
      );
    }
    expect(maxConcurrentStorms).toBe(1);
  });

  it('treats a meteor with nothing to hit as a no-op rather than a crash', () => {
    let rngState = 7;
    for (let i = 0; i < 200; i++) {
      const outcome = advanceEvents({
        activeEvents: [],
        buildings: [],
        rngState,
        sol: 50,
        dtSol: MEAN_EVENT_INTERVAL_SOLS,
      });
      expect(outcome.damagedBuildingId).toBeNull();
      rngState = outcome.rngState;
    }
  });
});

describe('event scheduling', () => {
  it('fires nothing during the grace period', () => {
    const fired = collectEvents(42, GRACE_PERIOD_SOLS - 1);
    expect(fired).toHaveLength(0);
  });

  it('is deterministic: the same seed replays the same events', () => {
    expect(collectEvents(1234, 60)).toEqual(collectEvents(1234, 60));
  });

  it('produces different event streams for different seeds', () => {
    const a = collectEvents(1, 80);
    const b = collectEvents(2, 80);
    expect(a).not.toEqual(b);
  });

  it('averages roughly one event per MEAN_EVENT_INTERVAL_SOLS', () => {
    // Averaged over several seeds: a single 200-sol run is too small a sample to pin down.
    let total = 0;
    const seeds = [1, 2, 3, 4, 5];
    const sols = 200;
    for (const seed of seeds) total += collectEvents(seed, sols).length;

    const observed = (seeds.length * (sols - GRACE_PERIOD_SOLS)) / total;
    expect(observed).toBeGreaterThan(MEAN_EVENT_INTERVAL_SOLS * 0.6);
    expect(observed).toBeLessThan(MEAN_EVENT_INTERVAL_SOLS * 1.6);
  }, 15000);

  it('eventually fires every kind of event', () => {
    const kinds = new Set<EventKind>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const event of collectEvents(seed, 200)) kinds.add(event.kind);
    }
    expect([...kinds].sort()).toEqual(['dustStorm', 'meteorStrike', 'oxygenLeak', 'supplyDrop']);
  }, 15000);
});

describe('events inside the simulation', () => {
  it('damages a building when a meteor strikes, and stops its production', () => {
    let state = createColony(42);
    let struck = false;
    for (let i = 0; i < 400 * TICKS_PER_SOL && !struck; i++) {
      state = topUp(simulateTick(state, TICK_SECONDS));
      struck = state.buildings.some((building) => building.status === 'damaged');
    }
    expect(struck).toBe(true);

    const damaged = state.buildings.find((building) => building.status === 'damaged');
    expect(damaged).toBeDefined();
    // Anything not running reports zero output, per SPEC-01.
    expect(state.report.efficiencyById[damaged?.id ?? '']).toBe(0);
  });

  it('keeps the colony deterministic across a long run with events', () => {
    expect(runSols(createColony(7), 40)).toEqual(runSols(createColony(7), 40));
  });

  it('advances the rng state so replays cannot diverge silently', () => {
    const start = createColony(3);
    const later = runSols(start, 30);
    expect(later.rngState).not.toBe(start.rngState);
  });
});
