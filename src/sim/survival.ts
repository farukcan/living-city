/**
 * The survival score: a 0..100 read on how close the colony is to failing.
 *
 * Deliberately a heuristic rather than a Monte Carlo projection — it has to update every
 * tick without a worker, and a number that lags the player's action teaches nothing.
 * See docs/SPEC-01-simulation.md.
 */

import { LIFE_CRITICAL, SURVIVAL_CAP_SOLS, SURVIVAL_HORIZON_SOLS } from './constants.ts';
import { daysOfSupply } from './population.ts';
import type { PowerReport, ResourceKind, ResourceReport } from './types.ts';

export type SurvivalResult = {
  readonly score: number;
  /** Sols of supply for the scarcest life-critical resource. */
  readonly worstDaysLeft: number;
};

export function computeSurvival(
  reports: Readonly<Record<ResourceKind, ResourceReport>>,
  power: PowerReport,
  population: number,
): SurvivalResult {
  if (population <= 0) return { score: 0, worstDaysLeft: 0 };

  let worstDaysLeft = Number.POSITIVE_INFINITY;
  for (const resource of LIFE_CRITICAL) {
    worstDaysLeft = Math.min(worstDaysLeft, daysOfSupply(reports[resource]));
  }

  // Saturating curve over a capped horizon: a surplus colony scores high but never a
  // clean 100, because one meteor away from disaster is not the same as safe.
  const horizon = Math.min(worstDaysLeft, SURVIVAL_CAP_SOLS);
  const base = 100 * (1 - Math.exp(-horizon / SURVIVAL_HORIZON_SOLS));

  const deficitRatio = power.demandKW > 0 ? Math.min(1, power.supplyKW / power.demandKW) : 1;
  const energyPenalty = 0.5 + 0.5 * deficitRatio;
  const lifeSupportPenalty = power.lifeSupportDeficit ? 0.4 : 1;

  return {
    score: Math.max(0, Math.min(100, base * energyPenalty * lifeSupportPenalty)),
    worstDaysLeft: Number.isFinite(worstDaysLeft) ? worstDaysLeft : Number.POSITIVE_INFINITY,
  };
}
