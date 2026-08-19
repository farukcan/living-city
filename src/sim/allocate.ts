/**
 * Priority allocation, shared by power and water.
 *
 * One function serves both because the problem is identical: a limited supply, consumers
 * that matter in a documented order, and a need for the result to be stable between ticks.
 * See docs/SPEC-01-simulation.md.
 */

/**
 * `share` is a float division, so a demand met exactly can land on 0.9999999999999999.
 * Without the tolerance those buildings would be declared starved and shut down.
 */
const FULL_SERVICE_EPSILON = 1e-9;

/**
 * Whether an allocated share counts as the full request.
 *
 * Production is all-or-nothing: a building served short of what it asked for produces
 * nothing rather than a fraction. The allocator still decides *who* gets power — this is
 * what turns its proportional share into the run flag the rest of the simulation reads.
 */
export function isFullyServed(share: number): boolean {
  return share >= 1 - FULL_SERVICE_EPSILON;
}

export type Demand = {
  readonly id: string;
  /** Lower tiers are served first. */
  readonly tier: number;
  /** Requested rate. Zero-amount demands are always fully satisfied. */
  readonly amount: number;
};

export type Allocation = {
  /** 0..1 per demand id: the fraction of the request that was served. */
  readonly efficiencyById: Readonly<Record<string, number>>;
  readonly granted: number;
  readonly surplus: number;
  readonly shortfall: number;
  /** Lowest tier that could not be fully served, or null when everything was met. */
  readonly firstStarvedTier: number | null;
};

/**
 * Walks tiers in ascending order, giving each all it asks for while supply lasts. The tier
 * where supply runs out is throttled proportionally — every consumer in it receives the
 * same fraction — and every tier below receives nothing.
 *
 * Proportional throttling is chosen over round-robin or first-come because it is stable
 * (no oscillation between ticks), independent of consumer ordering, and it reads correctly
 * in the UI as "the greenhouses are all running at 60%".
 */
export function allocateByPriority(available: number, demands: readonly Demand[]): Allocation {
  const efficiencyById: Record<string, number> = {};
  let remaining = Math.max(0, available);
  let granted = 0;
  let shortfall = 0;
  let firstStarvedTier: number | null = null;

  const tiers = [...new Set(demands.map((demand) => demand.tier))].sort((a, b) => a - b);

  for (const tier of tiers) {
    const inTier = demands.filter((demand) => demand.tier === tier);
    const total = inTier.reduce((sum, demand) => sum + demand.amount, 0);

    if (total <= 0) {
      for (const demand of inTier) efficiencyById[demand.id] = 1;
      continue;
    }

    const share = Math.min(1, remaining / total);
    for (const demand of inTier) {
      // A consumer that asked for nothing got everything it asked for. Handing it the
      // tier's throttle fraction would report an idle building as starved.
      efficiencyById[demand.id] = demand.amount > 0 ? share : 1;
    }

    const used = total * share;
    granted += used;
    remaining -= used;

    if (share < 1) {
      shortfall += total - used;
      firstStarvedTier ??= tier;
    }
  }

  return { efficiencyById, granted, surplus: remaining, shortfall, firstStarvedTier };
}
