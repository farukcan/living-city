/**
 * The power system: solar supply, tiered demand, battery buffering.
 *
 * The battery is not a tier. It is extra supply on a deficit and a sink for what survives
 * every tier on a surplus, both rate-limited (docs/SPEC-01-simulation.md).
 *
 * What leaves here is a run flag, not an efficiency: the allocator still shares power out
 * proportionally, but a building served short of its full request produces nothing. A shed
 * building's allocated power is burned rather than handed back — the grid spent it and made
 * nothing, which is the intended punishment for letting the battery run dry.
 */

import { allocateByPriority, isFullyServed } from './allocate.ts';
import type { Demand } from './allocate.ts';
import { CHARGE_MAX_KW, definitionOf, DISCHARGE_MAX_KW } from './constants.ts';
import { heatingDemandKW } from './environment.ts';
import type { Building, Environment, PowerReport } from './types.ts';

/** Heat demands are appended to tier 1: freezing kills as surely as suffocating. */
const HEAT_TIER = 1;

/** Suffix that distinguishes a building's heating demand from its operating demand. */
const HEAT_SUFFIX = ':heat';

/** Guards the outage predicate against float noise in the summed demand. */
const OUTAGE_EPSILON_KW = 1e-6;

/**
 * Load shedding: the battery charge fraction a tier needs before it may draw stored power
 * at all. Below its threshold a tier runs on live solar only, which at night means not
 * at all.
 *
 * Without this the allocator sees a 240 kW discharge limit, serves every tier in full, and
 * the colony coasts through the evening at full production until the battery hits zero and
 * life support fails outright. Reserving the bottom of the battery for the tiers that keep
 * people alive is what turns a cliff into the intended sequence: the mine stops, then the
 * greenhouse, then water and oxygen, and the habitat still makes it to sunrise.
 */
const BATTERY_RESERVE_BY_TIER: Readonly<Record<number, number>> = {
  0: 0,
  1: 0,
  2: 0.15,
  3: 0.35,
  4: 0.55,
};

function reserveThreshold(tier: number): number {
  return BATTERY_RESERVE_BY_TIER[tier] ?? 0;
}

export type PowerInputs = {
  readonly buildings: readonly Building[];
  readonly environment: Environment;
  readonly batteryStock: number;
  readonly batteryCap: number;
  readonly batteryBanks: number;
  readonly dtHours: number;
};

export type PowerResult = {
  /** Operating efficiency 0..1 per building id. Idle buildings are absent. */
  readonly efficiencyById: Readonly<Record<string, number>>;
  readonly batteryStock: number;
  readonly report: PowerReport;
};

export function solarOutputKW(buildings: readonly Building[], environment: Environment): number {
  let total = 0;
  for (const building of buildings) {
    if (building.status !== 'active') continue;
    total += definitionOf(building.kind).solarPeakKW;
  }
  return total * environment.sunIntensity * environment.dustFactor;
}

/**
 * Idle buildings draw nothing at all. Damaged buildings still draw heat — a hole in the
 * roof does not stop the colony paying to keep the structure from freezing — but produce
 * nothing, so they have no operating demand.
 */
function collectDemands(
  buildings: readonly Building[],
  environment: Environment,
): { demands: Demand[]; heatDemandKW: number } {
  const demands: Demand[] = [];
  let heatDemandKW = 0;

  for (const building of buildings) {
    if (building.status === 'idle') continue;
    const definition = definitionOf(building.kind);

    const heat = heatingDemandKW(definition.insulation, environment.ambientTemp);
    if (heat > 0) {
      demands.push({ id: `${building.id}${HEAT_SUFFIX}`, tier: HEAT_TIER, amount: heat });
      heatDemandKW += heat;
    }

    if (building.status === 'active' && definition.basePowerKW > 0) {
      demands.push({
        id: building.id,
        tier: definition.tier,
        amount: definition.basePowerKW,
      });
    }
  }

  return { demands, heatDemandKW };
}

export function resolvePower(inputs: PowerInputs): PowerResult {
  const { buildings, environment, batteryStock, batteryCap, batteryBanks, dtHours } = inputs;

  const supplyKW = solarOutputKW(buildings, environment);
  const { demands, heatDemandKW } = collectDemands(buildings, environment);
  const demandKW = demands.reduce((sum, demand) => sum + demand.amount, 0);

  // A grid with no stored reserve and not enough live generation collapses rather than
  // browning out. `batteryStock` is the stock entering the tick, so the outage is declared
  // on the tick after the battery empties — the alternative is a self-referential predicate,
  // and one tick is 0.1 s.
  const outage = batteryStock <= 0 && supplyKW + OUTAGE_EPSILON_KW < demandKW;

  // What the battery could deliver this tick: whichever of stored energy and the rate
  // limit runs out first. dtHours is never zero — the loop uses a fixed timestep.
  const dischargeCapKW = Math.min(batteryStock / dtHours, DISCHARGE_MAX_KW * batteryBanks);

  // Split the demands by whether the battery's current charge clears their reserve
  // threshold, then allocate twice: tiers with battery access first, and the shed tiers
  // afterwards against whatever live solar the first pass did not consume.
  const batteryFraction = batteryCap > 0 ? batteryStock / batteryCap : 0;
  const withBattery = demands.filter((demand) => batteryFraction >= reserveThreshold(demand.tier));
  const shed = demands.filter((demand) => batteryFraction < reserveThreshold(demand.tier));

  const primary = allocateByPriority(supplyKW + dischargeCapKW, withBattery);
  const batteryDischargeKW = Math.max(0, primary.granted - supplyKW);
  const solarLeftKW = Math.max(0, supplyKW - primary.granted);
  const secondary = allocateByPriority(solarLeftKW, shed);

  const allocation = {
    efficiencyById: { ...primary.efficiencyById, ...secondary.efficiencyById },
    granted: primary.granted + secondary.granted,
    // Only the first pass can starve life support; the shed tiers are all above tier 1.
    firstStarvedTier: primary.firstStarvedTier ?? secondary.firstStarvedTier,
  };

  const unusedSolarKW = Math.max(0, solarLeftKW - secondary.granted);
  const batteryChargeKW = Math.min(
    unusedSolarKW,
    CHARGE_MAX_KW * batteryBanks,
    Math.max(0, batteryCap - batteryStock) / dtHours,
  );

  // Heat demands never reach this map: they are not production, and partial heating still
  // has to starve tier 1 so `lifeSupportDeficit` can see it.
  const efficiencyById: Record<string, number> = {};
  for (const [id, share] of Object.entries(allocation.efficiencyById)) {
    if (id.endsWith(HEAT_SUFFIX)) continue;
    // The outage override is what stops the ice extractor even when the tier order could
    // still have fed it from live solar: a collapsed grid stops everything.
    efficiencyById[id] = outage || !isFullyServed(share) ? 0 : 1;
  }

  return {
    efficiencyById,
    batteryStock: Math.max(
      0,
      Math.min(batteryCap, batteryStock + (batteryChargeKW - batteryDischargeKW) * dtHours),
    ),
    report: {
      supplyKW,
      demandKW,
      heatDemandKW,
      batteryChargeKW,
      batteryDischargeKW,
      // Reported rather than hidden: seeing wasted power at noon is exactly the signal
      // that the colony needs another battery bank.
      wastedKW: unusedSolarKW - batteryChargeKW,
      lifeSupportDeficit: allocation.firstStarvedTier !== null && allocation.firstStarvedTier <= 1,
      outage,
    },
  };
}
