/**
 * The 4 Hz projection of simulation state that the HUD reads.
 *
 * Flat primitives only, so Zustand's default equality check is cheap and a component that
 * selects one number re-renders only when that number changes. See docs/SPEC-05-state.md.
 */

import { GRACE_SOLS } from '../sim/constants.ts';
import { computeCaps } from '../sim/resources.ts';
import { nextLandingCrew, solsUntilLanding } from '../sim/rocket.ts';
import type {
  ActiveEvent,
  GameOver,
  HistorySample,
  ResourceKind,
  SimState,
} from '../sim/types.ts';
import { RESOURCE_KINDS } from '../sim/types.ts';

/** Sols of oxygen left below which the warning stops being advisory. */
const OXYGEN_CRITICAL_SOLS = 1;

export type ResourceSnapshot = {
  readonly stock: number;
  readonly cap: number;
  readonly net: number;
  readonly production: number;
  readonly consumption: number;
  readonly wasted: number;
  /** Sols of supply left, or Infinity while in surplus. */
  readonly daysLeft: number;
};

export type UiSnapshot = {
  readonly sol: number;
  readonly solTime: number;
  readonly sunIntensity: number;
  readonly ambientTemp: number;
  readonly population: number;
  readonly populationCapacity: number;
  readonly survivalScore: number;
  readonly worstDaysLeft: number;
  readonly lifeSupportDeficit: boolean;
  /** The grid has collapsed: nothing is producing anything. */
  readonly outage: boolean;
  /** Under a sol of air left. Oxygen kills instantly, so this is the only warning there is. */
  readonly oxygenCritical: boolean;
  readonly powerSupplyKW: number;
  readonly powerDemandKW: number;
  readonly heatDemandKW: number;
  readonly wastedKW: number;
  readonly buildingCount: number;
  /**
   * Sols of grace left before deaths begin; negative once they have. Two flat numbers rather
   * than the timers object, which is a fresh allocation every tick and would re-render every
   * subscriber four times a second regardless of whether anything changed.
   */
  readonly waterGraceLeft: number;
  readonly foodGraceLeft: number;
  /** Colonists with no habitat bunk. Each one draws double.  */
  readonly overflowPopulation: number;
  readonly solsUntilLanding: number;
  readonly nextLandingCrew: number;
  /** Safe to pass by reference: it changes at most once per colony. */
  readonly gameOver: GameOver | null;
  readonly resources: Readonly<Record<ResourceKind, ResourceSnapshot>>;
  readonly activeEvents: readonly ActiveEvent[];
  readonly history: readonly HistorySample[];
};

function emptyResource(): ResourceSnapshot {
  return {
    stock: 0,
    cap: 0,
    net: 0,
    production: 0,
    consumption: 0,
    wasted: 0,
    daysLeft: Number.POSITIVE_INFINITY,
  };
}

export function emptySnapshot(): UiSnapshot {
  return {
    sol: 0,
    solTime: 0,
    sunIntensity: 0,
    ambientTemp: 0,
    population: 0,
    populationCapacity: 0,
    survivalScore: 0,
    worstDaysLeft: 0,
    lifeSupportDeficit: false,
    outage: false,
    oxygenCritical: false,
    powerSupplyKW: 0,
    powerDemandKW: 0,
    heatDemandKW: 0,
    wastedKW: 0,
    buildingCount: 0,
    waterGraceLeft: GRACE_SOLS.water,
    foodGraceLeft: GRACE_SOLS.food,
    overflowPopulation: 0,
    solsUntilLanding: 0,
    nextLandingCrew: 0,
    gameOver: null,
    resources: {
      power: emptyResource(),
      oxygen: emptyResource(),
      water: emptyResource(),
      food: emptyResource(),
      minerals: emptyResource(),
    },
    activeEvents: [],
    history: [],
  };
}

export function projectSnapshot(sim: SimState): UiSnapshot {
  const { report } = sim;

  // Stocks and caps come from live state, not from the tick report. The report is only
  // rebuilt when the simulation steps, so reading it here would leave the HUD stale after
  // any action taken while paused — placing a building would visibly cost nothing.
  const caps = computeCaps(sim.buildings);

  const resources = {} as Record<ResourceKind, ResourceSnapshot>;
  for (const kind of RESOURCE_KINDS) {
    const resource = report.resources[kind];
    const drain = resource.consumption - resource.production;
    resources[kind] = {
      stock: sim.stocks[kind],
      cap: caps[kind],
      net: resource.net,
      production: resource.production,
      consumption: resource.consumption,
      wasted: resource.wasted,
      daysLeft: drain > 0 ? sim.stocks[kind] / drain : Number.POSITIVE_INFINITY,
    };
  }

  return {
    sol: sim.sol,
    solTime: sim.solTime,
    sunIntensity: report.environment.sunIntensity,
    ambientTemp: report.environment.ambientTemp,
    population: sim.population,
    populationCapacity: report.populationCapacity,
    survivalScore: report.survivalScore,
    worstDaysLeft: report.worstDaysLeft,
    lifeSupportDeficit: report.power.lifeSupportDeficit,
    outage: report.power.outage,
    oxygenCritical: resources.oxygen.daysLeft < OXYGEN_CRITICAL_SOLS,
    powerSupplyKW: report.power.supplyKW,
    powerDemandKW: report.power.demandKW,
    heatDemandKW: report.power.heatDemandKW,
    wastedKW: report.power.wastedKW,
    buildingCount: sim.buildings.length,
    waterGraceLeft: GRACE_SOLS.water - sim.deprivation.water,
    foodGraceLeft: GRACE_SOLS.food - sim.deprivation.food,
    overflowPopulation: Math.max(0, sim.population - report.populationCapacity),
    solsUntilLanding: solsUntilLanding(sim.sol, sim.solTime),
    nextLandingCrew: nextLandingCrew(sim.sol),
    gameOver: sim.gameOver,
    resources,
    activeEvents: sim.activeEvents,
    history: sim.history,
  };
}
