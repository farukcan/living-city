/**
 * `simulateTick` — one fixed step of the colony.
 *
 * Pure: it reads a SimState and returns a new one, mutating nothing. The order of the
 * stages is fixed and load-bearing (docs/SPEC-01-simulation.md):
 * environment before allocation because sunlight sets supply, events before environment
 * because a dust storm has to apply to this tick's sunlight, population last because it
 * consumes what the tick produced.
 */

import {
  HISTORY_SOLS,
  HOURS_PER_SOL,
  SECONDS_PER_SOL,
  WIN_HABITATS,
  WIN_POPULATION,
  WIN_SOLS,
} from './constants.ts';
import { computeEnvironment } from './environment.ts';
import { advanceEvents, dustFactorFrom, extraDrainFrom } from './events.ts';
import { effectivePopulation, populationCapacity, updatePopulation } from './population.ts';
import { resolvePower } from './power.ts';
import { applyFlows, computeCaps, countKind, productionPerSol, resolveWater } from './resources.ts';
import { crewArriving } from './rocket.ts';
import { computeSurvival } from './survival.ts';
import type {
  Building,
  EventNotice,
  GameOver,
  HistorySample,
  ResourceKind,
  ResourceReport,
  SimState,
  TickReport,
} from './types.ts';

/** Ring buffer capacity for hourly samples spanning `HISTORY_SOLS` sols. */
const HISTORY_SAMPLES = Math.round(HISTORY_SOLS * HOURS_PER_SOL);

/**
 * A building runs only when every constraint clears. Both inputs are run flags, so the
 * product is one too: 1 × 1 is the only way to reach 1.
 *
 * Anything not running reports 0 rather than defaulting to 1. A building absent from the
 * power allocation because it is idle or damaged is not running at full output, and every
 * consumer of this map — the inspector, the flow lines — would otherwise have to re-check
 * status to avoid drawing a wrecked mine as fully productive.
 */
function combineEfficiency(
  powerEfficiencyById: Readonly<Record<string, number>>,
  waterEfficiencyById: Readonly<Record<string, number>>,
  buildings: readonly Building[],
): Record<string, number> {
  const combined: Record<string, number> = {};
  for (const building of buildings) {
    if (building.status !== 'active') {
      combined[building.id] = 0;
      continue;
    }
    // A building with no power demand at all (a solar array) is limited only by water.
    const power = powerEfficiencyById[building.id] ?? 1;
    const water = waterEfficiencyById[building.id] ?? 1;
    combined[building.id] = power * water;
  }
  return combined;
}

/**
 * The three ways a colony ends.
 *
 * Suffocation is exact-comparable because `applyFlows` clamps stocks at zero. Depopulation
 * catches the slower endings — a colony starved below one person would otherwise keep
 * simulating an empty base forever, which is a worse ending than an ending. Victory needs
 * all three win thresholds at once, checked last so a colony that starves the same tick it
 * would have won still loses — nothing is alive to have won it.
 */
function detectGameOver(
  oxygen: number,
  population: number,
  sol: number,
  habitatCount: number,
): GameOver | null {
  if (oxygen <= 0) return { sol, cause: 'oxygen' };
  if (population < 1) return { sol, cause: 'depopulated' };
  if (sol >= WIN_SOLS && habitatCount >= WIN_HABITATS && population >= WIN_POPULATION) {
    return { sol, cause: 'victory' };
  }
  return null;
}

/**
 * Rolls the two death buckets across whatever sol boundaries this tick crossed.
 *
 * `solsElapsed` is 0 or 1 at every practical tick size. Two or more would mean the older
 * bucket has fallen entirely out of the trailing-sol window, so it is dropped rather than
 * carried forward as a toll the colony no longer owes.
 */
function rollDeaths(
  state: SimState,
  solsElapsed: number,
  deaths: number,
): { readonly deathsThisSol: number; readonly deathsPreviousSol: number } {
  if (solsElapsed === 0) {
    return {
      deathsThisSol: state.deathsThisSol + deaths,
      deathsPreviousSol: state.deathsPreviousSol,
    };
  }
  if (solsElapsed === 1) {
    return { deathsThisSol: deaths, deathsPreviousSol: state.deathsThisSol };
  }
  return { deathsThisSol: deaths, deathsPreviousSol: 0 };
}

function pushHistory(
  history: readonly HistorySample[],
  sample: HistorySample,
): readonly HistorySample[] {
  const next = [...history, sample];
  return next.length > HISTORY_SAMPLES ? next.slice(next.length - HISTORY_SAMPLES) : next;
}

export function simulateTick(state: SimState, dtSeconds: number): SimState {
  // A colony that has ended stays ended. Returning the same object rather than a copy so
  // the store sees an unchanged reference and nothing downstream churns.
  if (state.gameOver !== null) return state;

  const dtSol = dtSeconds / SECONDS_PER_SOL;
  const dtHours = dtSol * HOURS_PER_SOL;

  // 1. Advance the clock up front: the landing schedule needs to know which sol boundary
  //    this tick crosses. Events still see the old sol, so their grace period and notice
  //    numbering are unchanged.
  const rawSolTime = state.solTime + dtSol;
  const solsElapsed = Math.floor(rawSolTime);
  const sol = state.sol + solsElapsed;
  const solTime = rawSolTime - solsElapsed;

  // 2. Events age and roll next, so a storm starting now dims this same tick's sunlight
  //    and a meteor landing now takes its target offline before power is allocated.
  const events = advanceEvents({
    activeEvents: state.activeEvents,
    buildings: state.buildings,
    rngState: state.rngState,
    sol: state.sol,
    dtSol,
  });
  const environment = computeEnvironment(state.solTime, dustFactorFrom(events.activeEvents));

  const buildings =
    events.damagedBuildingId === null
      ? state.buildings
      : state.buildings.map((building) =>
          building.id === events.damagedBuildingId
            ? { ...building, status: 'damaged' as const }
            : building,
        );

  // 3. Capacities depend only on which buildings stand.
  const caps = computeCaps(buildings);
  const batteryBanks = countKind(buildings, 'batteryBank');
  const capacity = populationCapacity(buildings);

  // Everything charged this tick is charged against the effective head count, so the
  // overflow penalty reaches water allocation and the deprivation thresholds alike.
  const effective = effectivePopulation(state.population, capacity);

  // 4. Power, then water, in that order: a stopped pump asks for no water at all.
  const power = resolvePower({
    buildings,
    environment,
    batteryStock: state.stocks.power,
    batteryCap: caps.power,
    batteryBanks,
    dtHours,
  });

  const water = resolveWater({
    buildings,
    powerEfficiencyById: power.efficiencyById,
    effectivePopulation: effective,
    waterStock: state.stocks.water,
    waterProductionPerSol: productionPerSol(buildings, power.efficiencyById, 'water'),
    dtSol,
  });

  const efficiencyById = combineEfficiency(power.efficiencyById, water.efficiencyById, buildings);

  // 5. Apply the flows. Power is already resolved; its report is folded in here.
  const powerReport: ResourceReport = {
    stock: power.batteryStock,
    cap: caps.power,
    production: power.report.supplyKW,
    consumption: power.report.demandKW,
    net: power.report.supplyKW - power.report.demandKW,
    wasted: power.report.wastedKW,
  };

  const flows = applyFlows({
    buildings,
    efficiencyById,
    stocks: state.stocks,
    caps,
    effectivePopulation: effective,
    extraDrainPerSol: extraDrainFrom(events.activeEvents),
    powerReport,
    dtSol,
  });

  // A supply drop is added after the flows so it cannot be spent within the same tick it
  // arrives, and it is clamped like everything else — a drop into a full depot is wasted.
  const stocks = { ...flows.stocks, power: power.batteryStock };
  for (const [resource, amount] of Object.entries(events.reward)) {
    const kind = resource as ResourceKind;
    stocks[kind] = Math.min(caps[kind], stocks[kind] + amount);
  }

  // 6. People live or die by what is left, and only then does the rocket unload — a crew
  //    landing into a famine should not be killed by the tick it touches down in.
  const survivors = updatePopulation({
    population: state.population,
    effectivePopulation: effective,
    stocks,
    deprivation: state.deprivation,
    lifeSupportDeficit: power.report.lifeSupportDeficit,
    dtSol,
  });

  // Measured before the crew unloads, so a landing never masks the sol's casualties.
  const deaths = rollDeaths(
    state,
    solsElapsed,
    Math.max(0, state.population - survivors.population),
  );

  const arriving = crewArriving(state.sol, sol);
  const population = survivors.population + arriving;

  // 7. Oxygen has no grace period: there is nothing to ration when there is nothing to
  //    breathe. Everything else drains through the deprivation timers instead.
  const gameOver = detectGameOver(stocks.oxygen, population, sol, countKind(buildings, 'habitat'));

  const survival = computeSurvival(flows.reports, power.report, population);

  const notices: readonly EventNotice[] =
    arriving > 0
      ? [...events.notices, { kind: 'crewArrival' as const, sol, started: true }]
      : events.notices;

  // Sampled hourly rather than per-sol so the sparkline stays smooth: a sol is 24.66 hours,
  // and boundaries are compared as absolute hours rather than counted per tick since dtHours
  // is always far smaller than one hour, so at most one boundary is ever crossed per tick.
  const hourBefore = Math.floor((state.sol + state.solTime) * HOURS_PER_SOL);
  const hourAfter = Math.floor((sol + solTime) * HOURS_PER_SOL);

  const history =
    hourAfter > hourBefore
      ? pushHistory(state.history, {
          sol,
          power: stocks.power,
          oxygen: stocks.oxygen,
          water: stocks.water,
          food: stocks.food,
          population,
          survivalScore: survival.score,
        })
      : state.history;

  const report: TickReport = {
    environment,
    resources: flows.reports,
    power: power.report,
    efficiencyById,
    populationCapacity: capacity,
    survivalScore: survival.score,
    worstDaysLeft: survival.worstDaysLeft,
  };

  return {
    ...state,
    solTime,
    sol,
    buildings,
    rngState: events.rngState,
    stocks,
    population,
    deprivation: survivors.deprivation,
    deathsThisSol: deaths.deathsThisSol,
    deathsPreviousSol: deaths.deathsPreviousSol,
    gameOver,
    activeEvents: events.activeEvents,
    notices,
    history,
    report,
  };
}
