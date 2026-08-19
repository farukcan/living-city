/**
 * Event scheduling and effects. See docs/SPEC-06-events.md.
 *
 * Events exist to make the colony's fragility visible. A perfectly tuned colony that runs
 * forever proves nothing; a colony that survives a dust storm proves the allocator works.
 *
 * Every draw goes through the seeded RNG threaded on SimState, so a given seed reproduces
 * the same weather, the same meteors and the same close calls.
 */

import { nextIndex, nextRandom } from './rng.ts';
import type { RngState } from './rng.ts';
import type { ActiveEvent, Building, EventKind, EventNotice, ResourceKind } from './types.ts';

/** Solar output multiplier while a dust storm is overhead. */
export const DUST_STORM_SOLAR_FACTOR = 0.3;
/** Extra oxygen lost per sol while a leak is open, in kg. */
export const OXYGEN_LEAK_DRAIN_PER_SOL = 8;
export const CLEAR_SKY_DUST_FACTOR = 1;

export const MEAN_EVENT_INTERVAL_SOLS = 12;
/** No events before this sol: a meteor at sol 2 teaches nothing but frustration. */
export const GRACE_PERIOD_SOLS = 8;

const DUST_STORM_MIN_SOLS = 2;
const DUST_STORM_MAX_SOLS = 4;
const OXYGEN_LEAK_MIN_SOLS = 1;
const OXYGEN_LEAK_MAX_SOLS = 2;

export const SUPPLY_DROP_REWARD: Readonly<Partial<Record<ResourceKind, number>>> = {
  minerals: 80,
  food: 40,
};

/** Cumulative weights, summing to 1. Three of the four are hostile, by design. */
const EVENT_WEIGHTS: readonly (readonly [EventKind, number])[] = [
  ['dustStorm', 0.35],
  ['meteorStrike', 0.6],
  ['oxygenLeak', 0.8],
  ['supplyDrop', 1],
] as const;

export function dustFactorFrom(activeEvents: readonly ActiveEvent[]): number {
  const storming = activeEvents.some((event) => event.kind === 'dustStorm');
  return storming ? DUST_STORM_SOLAR_FACTOR : CLEAR_SKY_DUST_FACTOR;
}

export function extraDrainFrom(
  activeEvents: readonly ActiveEvent[],
): Readonly<Partial<Record<ResourceKind, number>>> {
  const leaking = activeEvents.some((event) => event.kind === 'oxygenLeak');
  return leaking ? { oxygen: OXYGEN_LEAK_DRAIN_PER_SOL } : {};
}

export type EventOutcome = {
  readonly activeEvents: readonly ActiveEvent[];
  readonly notices: readonly EventNotice[];
  readonly rngState: RngState;
  /** Id of a building struck by a meteor this tick, if any. */
  readonly damagedBuildingId: string | null;
  readonly reward: Readonly<Partial<Record<ResourceKind, number>>>;
};

/** Ages durational events and emits a notice for each one that ends this tick. */
function expire(
  activeEvents: readonly ActiveEvent[],
  dtSol: number,
  sol: number,
): { readonly remaining: ActiveEvent[]; readonly notices: EventNotice[] } {
  const remaining: ActiveEvent[] = [];
  const notices: EventNotice[] = [];

  for (const event of activeEvents) {
    const solsRemaining = event.solsRemaining - dtSol;
    if (solsRemaining > 0) remaining.push({ kind: event.kind, solsRemaining });
    else notices.push({ kind: event.kind, sol, started: false });
  }

  return { remaining, notices };
}

function pickKind(roll: number): EventKind {
  for (const [kind, threshold] of EVENT_WEIGHTS) {
    if (roll < threshold) return kind;
  }
  return 'supplyDrop';
}

export type EventInputs = {
  readonly activeEvents: readonly ActiveEvent[];
  readonly buildings: readonly Building[];
  readonly rngState: RngState;
  readonly sol: number;
  readonly dtSol: number;
};

/**
 * Advances active events and rolls for a new one.
 *
 * The roll is a per-tick Poisson-style draw rather than a countdown: memoryless, so the
 * interval distribution stays correct at any speed multiplier and does not depend on tick
 * size.
 */
export function advanceEvents(inputs: EventInputs): EventOutcome {
  const { remaining, notices } = expire(inputs.activeEvents, inputs.dtSol, inputs.sol);

  let rngState = inputs.rngState;
  let damagedBuildingId: string | null = null;
  let reward: Readonly<Partial<Record<ResourceKind, number>>> = {};
  const activeEvents = [...remaining];

  if (inputs.sol < GRACE_PERIOD_SOLS) {
    return { activeEvents, notices, rngState, damagedBuildingId, reward };
  }

  const trigger = nextRandom(rngState);
  rngState = trigger.state;
  if (trigger.value >= inputs.dtSol / MEAN_EVENT_INTERVAL_SOLS) {
    return { activeEvents, notices, rngState, damagedBuildingId, reward };
  }

  const selection = nextRandom(rngState);
  rngState = selection.state;
  const kind = pickKind(selection.value);

  // One event of a kind at a time. The draw is discarded rather than retried so the RNG
  // stream stays aligned with the seed.
  if (kind === 'dustStorm' || kind === 'oxygenLeak') {
    if (activeEvents.some((event) => event.kind === kind)) {
      return { activeEvents, notices, rngState, damagedBuildingId, reward };
    }
    const isStorm = kind === 'dustStorm';
    const duration = nextRandom(rngState);
    rngState = duration.state;
    const min = isStorm ? DUST_STORM_MIN_SOLS : OXYGEN_LEAK_MIN_SOLS;
    const max = isStorm ? DUST_STORM_MAX_SOLS : OXYGEN_LEAK_MAX_SOLS;
    activeEvents.push({ kind, solsRemaining: min + duration.value * (max - min) });
    return {
      activeEvents,
      notices: [...notices, { kind, sol: inputs.sol, started: true }],
      rngState,
      damagedBuildingId,
      reward,
    };
  }

  if (kind === 'meteorStrike') {
    const targets = inputs.buildings.filter((building) => building.status === 'active');
    const pick = nextIndex(rngState, targets.length);
    rngState = pick.state;
    // A strike with nothing to hit is a no-op, not a crash and not a retry.
    if (pick.value < 0) {
      return { activeEvents, notices, rngState, damagedBuildingId, reward };
    }
    damagedBuildingId = targets[pick.value]?.id ?? null;
  } else {
    reward = SUPPLY_DROP_REWARD;
  }

  return {
    activeEvents,
    notices: [...notices, { kind, sol: inputs.sol, started: true }],
    rngState,
    damagedBuildingId,
    reward,
  };
}
