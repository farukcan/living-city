/**
 * Storage caps, the water allocation pass, and applying flows to stocks.
 * See docs/SPEC-01-simulation.md.
 */

import { allocateByPriority, isFullyServed } from './allocate.ts';
import type { Demand } from './allocate.ts';
import { BASE_CAPS, definitionOf, PER_CAPITA_CONSUMPTION } from './constants.ts';
import type { Building, BuildingKind, ResourceKind, ResourceReport } from './types.ts';
import { RESOURCE_KINDS } from './types.ts';

/** Population is a water consumer like any other, and it outranks every building. */
export const POPULATION_DEMAND_ID = 'population';
const POPULATION_TIER = 1;

export function countKind(buildings: readonly Building[], kind: BuildingKind): number {
  return buildings.reduce((total, building) => (building.kind === kind ? total + 1 : total), 0);
}

/**
 * Storage capacity from the base allowance plus every standing building. Capacity does not
 * depend on status: an idled depot is still a warehouse.
 */
export function computeCaps(
  buildings: readonly Building[],
): Readonly<Record<ResourceKind, number>> {
  const caps: Record<ResourceKind, number> = { ...BASE_CAPS };
  for (const building of buildings) {
    const bonus = definitionOf(building.kind).capacityBonus;
    for (const resource of RESOURCE_KINDS) {
      caps[resource] += bonus[resource] ?? 0;
    }
  }
  return caps;
}

/**
 * Per-sol output of a resource. Efficiency is a run flag, so this counts only the buildings
 * that are fully powered — a partly-fed extractor contributes nothing.
 */
export function productionPerSol(
  buildings: readonly Building[],
  efficiencyById: Readonly<Record<string, number>>,
  resource: ResourceKind,
): number {
  let total = 0;
  for (const building of buildings) {
    if (building.status !== 'active') continue;
    const produced = definitionOf(building.kind).produces[resource] ?? 0;
    if (produced > 0) total += produced * (efficiencyById[building.id] ?? 0);
  }
  return total;
}

export type WaterAllocation = {
  /** A run flag per building id, exactly 0 or 1, relative to the power-gated request. */
  readonly efficiencyById: Readonly<Record<string, number>>;
};

/**
 * Water runs through the same allocator as power, after it, because a stopped electrolyzer
 * asks for no water at all. The colonists are entered as a tier-1 demand so that no building
 * can drink ahead of them, even though their share is not returned — a shortfall reaches
 * them as a stock that hits zero.
 *
 * The two passes are not iterated to a fixed point: a building stopped here still had power
 * reserved for it upstream, and that power is counted as waste rather than reallocated. One
 * pass is accurate to a few percent at these scales and cannot fail to converge. Documented
 * rather than hidden.
 */
export function resolveWater(params: {
  readonly buildings: readonly Building[];
  readonly powerEfficiencyById: Readonly<Record<string, number>>;
  readonly effectivePopulation: number;
  readonly waterStock: number;
  readonly waterProductionPerSol: number;
  readonly dtSol: number;
}): WaterAllocation {
  const demands: Demand[] = [];

  const populationDemand = params.effectivePopulation * PER_CAPITA_CONSUMPTION.water;
  demands.push({ id: POPULATION_DEMAND_ID, tier: POPULATION_TIER, amount: populationDemand });

  for (const building of params.buildings) {
    if (building.status !== 'active') continue;
    const definition = definitionOf(building.kind);
    const requested = definition.consumes.water ?? 0;
    if (requested <= 0) continue;
    demands.push({
      id: building.id,
      tier: definition.tier,
      amount: requested * (params.powerEfficiencyById[building.id] ?? 0),
    });
  }

  // Stock can be drained within the tick, so it converts into an available rate.
  const availablePerSol = params.waterProductionPerSol + params.waterStock / params.dtSol;
  const allocation = allocateByPriority(availablePerSol, demands);

  // Colonists are dropped rather than binarised: they drink whatever reaches them, and a
  // shortfall shows up as a stock that runs down, not as a stopped building.
  const efficiencyById: Record<string, number> = {};
  for (const [id, share] of Object.entries(allocation.efficiencyById)) {
    if (id === POPULATION_DEMAND_ID) continue;
    efficiencyById[id] = isFullyServed(share) ? 1 : 0;
  }

  return { efficiencyById };
}

const EMPTY_REPORT: ResourceReport = {
  stock: 0,
  cap: 0,
  production: 0,
  consumption: 0,
  net: 0,
  wasted: 0,
};

export type FlowResult = {
  readonly stocks: Readonly<Record<ResourceKind, number>>;
  readonly reports: Readonly<Record<ResourceKind, ResourceReport>>;
};

/**
 * Applies one tick of production and consumption to the stored resources.
 *
 * Power is not computed here — it is a rate with a battery behind it, resolved in
 * power.ts — but its already-finished report is passed in so this function can return a
 * complete set rather than a partial one the caller has to widen.
 */
export function applyFlows(params: {
  readonly buildings: readonly Building[];
  readonly efficiencyById: Readonly<Record<string, number>>;
  readonly stocks: Readonly<Record<ResourceKind, number>>;
  readonly caps: Readonly<Record<ResourceKind, number>>;
  /** Colonists above habitat capacity are counted twice; see `effectivePopulation`. */
  readonly effectivePopulation: number;
  readonly extraDrainPerSol: Readonly<Partial<Record<ResourceKind, number>>>;
  readonly powerReport: ResourceReport;
  readonly dtSol: number;
}): FlowResult {
  const stocks: Record<ResourceKind, number> = { ...params.stocks };
  const reports: Record<ResourceKind, ResourceReport> = {
    power: params.powerReport,
    oxygen: EMPTY_REPORT,
    water: EMPTY_REPORT,
    food: EMPTY_REPORT,
    minerals: EMPTY_REPORT,
  };

  for (const resource of RESOURCE_KINDS) {
    if (resource === 'power') continue;

    let production = 0;
    let consumption = 0;

    for (const building of params.buildings) {
      if (building.status !== 'active') continue;
      const definition = definitionOf(building.kind);
      const efficiency = params.efficiencyById[building.id] ?? 0;
      production += (definition.produces[resource] ?? 0) * efficiency;
      consumption += (definition.consumes[resource] ?? 0) * efficiency;
    }

    if (resource === 'oxygen' || resource === 'water' || resource === 'food') {
      consumption += params.effectivePopulation * PER_CAPITA_CONSUMPTION[resource];
    }
    consumption += params.extraDrainPerSol[resource] ?? 0;

    const stock = params.stocks[resource];
    const cap = params.caps[resource];
    const unclamped = stock + (production - consumption) * params.dtSol;
    const clamped = Math.min(cap, Math.max(0, unclamped));

    stocks[resource] = clamped;
    reports[resource] = {
      stock: clamped,
      cap,
      production,
      consumption,
      net: production - consumption,
      // Only overflow counts as waste. Demand that went unmet is a shortage, and it shows
      // up as a falling stock and a dying population instead.
      wasted: unclamped > cap ? (unclamped - cap) / params.dtSol : 0,
    };
  }

  return { stocks, reports };
}
