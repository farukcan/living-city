/**
 * Population dynamics. See docs/SPEC-01-simulation.md.
 *
 * Fractional internally so the count is smooth at any speed; rounded only for display.
 * Nobody arrives on their own — crew comes by rocket and nothing else. What happens here is
 * the other half: how long a colony survives without water or food, and how fast it dies
 * once that runs out.
 */

import {
  definitionOf,
  DEATH_ACCELERATION,
  DEATH_RAMP_SOLS,
  DEATH_RATE_PER_SOL,
  DEPRIVATION_RECOVERY_RATE,
  GRACE_SOLS,
  MIN_VIABLE_POPULATION,
  PER_CAPITA_CONSUMPTION,
} from './constants.ts';
import type {
  Building,
  DeprivationTimers,
  GraceResource,
  ResourceKind,
  ResourceReport,
} from './types.ts';
import { GRACE_RESOURCES } from './types.ts';

export function populationCapacity(buildings: readonly Building[]): number {
  let capacity = 0;
  for (const building of buildings) {
    // A damaged habitat still holds air; only an idled one is evacuated.
    if (building.status === 'idle') continue;
    capacity += definitionOf(building.kind).populationCapacity;
  }
  return capacity;
}

/**
 * Colonists above habitat capacity live rough and cost double.
 *
 * Only the overflow is doubled: capacity 10 with a population of 14 draws as 18. Rockets
 * land whether or not there is housing, so this is the pressure that makes the next habitat
 * urgent rather than optional.
 */
export function effectivePopulation(population: number, capacity: number): number {
  return population + Math.max(0, population - capacity);
}

/** Sols of supply left at the current net drain. Infinite while in surplus. */
export function daysOfSupply(report: ResourceReport): number {
  const drain = report.consumption - report.production;
  if (drain <= 0) return Number.POSITIVE_INFINITY;
  return report.stock / drain;
}

/**
 * Sols of deprivation past which the timer stops climbing.
 *
 * Bounding the timer bounds the death rate, which is what keeps the arithmetic below from
 * ever going negative, and stops a colony that survived a long drought from being erased
 * instantly by the next one.
 */
function timerCeiling(resource: GraceResource): number {
  return GRACE_SOLS[resource] + DEATH_RAMP_SOLS;
}

/** True when stock is below a single sol of need — the clock starts here, not at zero. */
export function isDeprived(stock: number, effectivePop: number, resource: GraceResource): boolean {
  return stock < effectivePop * PER_CAPITA_CONSUMPTION[resource];
}

/**
 * The deprivation clock starts when the stock falls below what the colonists need for a
 * single sol, not when it hits zero: by the time the tank is empty the rationing has already
 * been going on for a while.
 */
function advanceTimer(timer: number, resource: GraceResource, deprived: boolean, dtSol: number) {
  if (deprived) return Math.min(timer + dtSol, timerCeiling(resource));
  return Math.max(0, timer - dtSol * DEPRIVATION_RECOVERY_RATE);
}

/**
 * Fraction of the population lost per sol to one resource.
 *
 * Zero until the grace period expires, then linear in how far past it the colony is. Linear
 * in the rate compounds into something much steeper in the population itself, which is what
 * makes a late rescue feel late: 2 %/sol at the deadline, 32 %/sol five sols after it.
 */
function deathRate(timer: number, resource: GraceResource): number {
  const overrun = Math.max(0, timer - GRACE_SOLS[resource]);
  if (overrun <= 0) return 0;
  return DEATH_RATE_PER_SOL * (1 + overrun * DEATH_ACCELERATION);
}

export type PopulationInputs = {
  readonly population: number;
  readonly effectivePopulation: number;
  /** Post-flow stocks, so the supply-drop reward is already counted. */
  readonly stocks: Readonly<Record<ResourceKind, number>>;
  readonly deprivation: DeprivationTimers;
  readonly lifeSupportDeficit: boolean;
  readonly dtSol: number;
};

export type PopulationResult = {
  readonly population: number;
  readonly deprivation: DeprivationTimers;
};

/**
 * Advances the deprivation clocks and applies whatever deaths they have earned.
 *
 * Water and food run independent clocks and their rates add, because a colony out of both
 * is in worse trouble than one out of either. Losing life support contributes a flat rate
 * with no grace period at all: there is no rationing your way through a habitat that has
 * stopped heating itself.
 *
 * Oxygen is absent on purpose — running out of it is handled as an immediate loss in
 * `simulateTick`, not as a rate.
 */
export function updatePopulation(inputs: PopulationInputs): PopulationResult {
  const { population, stocks, lifeSupportDeficit, dtSol } = inputs;

  const deprivation: Record<GraceResource, number> = { ...inputs.deprivation };
  let ratePerSol = lifeSupportDeficit ? DEATH_RATE_PER_SOL : 0;

  for (const resource of GRACE_RESOURCES) {
    const deprived = isDeprived(stocks[resource], inputs.effectivePopulation, resource);
    const timer = advanceTimer(deprivation[resource], resource, deprived, dtSol);
    deprivation[resource] = timer;
    // Debt on the clock shortens the next drought; it does not keep killing after relief.
    if (deprived) ratePerSol += deathRate(timer, resource);
  }

  if (ratePerSol <= 0) return { population, deprivation };

  const survivors = population * (1 - ratePerSol * dtSol);
  return { population: Math.max(MIN_VIABLE_POPULATION, survivors), deprivation };
}
