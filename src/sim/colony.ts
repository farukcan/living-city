/**
 * Colony creation: a seed in, a running colony out.
 *
 * The starting layout is resolved from the terrain rather than hard-coded, because where
 * the ice and ore landed is a property of the seed (docs/SPEC-02-buildings.md).
 */

import {
  definitionOf,
  STARTING_BUILDINGS,
  STARTING_POPULATION,
  STARTING_STOCKS,
  TICK_SECONDS,
} from './constants.ts';
import { hexDistance } from './hex.ts';
import { addBuilding, checkPlacement } from './placement.ts';
import { generateTerrain } from './terrain.ts';
import { simulateTick } from './tick.ts';
import type { BuildingKind, DepositKind, SimState, TickReport, Tile } from './types.ts';

const ORIGIN = { q: 0, r: 0 };

/** A neutral report so SimState is never partially formed; the first tick replaces it. */
const EMPTY_REPORT: TickReport = {
  environment: { sunIntensity: 0, ambientTemp: 0, dustFactor: 1 },
  resources: {
    power: { stock: 0, cap: 0, production: 0, consumption: 0, net: 0, wasted: 0 },
    oxygen: { stock: 0, cap: 0, production: 0, consumption: 0, net: 0, wasted: 0 },
    water: { stock: 0, cap: 0, production: 0, consumption: 0, net: 0, wasted: 0 },
    food: { stock: 0, cap: 0, production: 0, consumption: 0, net: 0, wasted: 0 },
    minerals: { stock: 0, cap: 0, production: 0, consumption: 0, net: 0, wasted: 0 },
  },
  power: {
    supplyKW: 0,
    demandKW: 0,
    heatDemandKW: 0,
    batteryChargeKW: 0,
    batteryDischargeKW: 0,
    wastedKW: 0,
    lifeSupportDeficit: false,
    outage: false,
  },
  efficiencyById: {},
  populationCapacity: 0,
  survivalScore: 0,
  worstDaysLeft: 0,
};

/** Free tiles nearest the origin first, so the starting colony forms a compact cluster. */
function candidateTiles(state: SimState, deposit: DepositKind | null): Tile[] {
  return state.terrain.tiles
    .filter(
      (tile) =>
        tile.buildable &&
        tile.buildingId === null &&
        (deposit === null ? tile.deposit === 'none' : tile.deposit === deposit),
    )
    .sort((a, b) => hexDistance(a, ORIGIN) - hexDistance(b, ORIGIN));
}

function placeStartingBuilding(state: SimState, kind: BuildingKind): SimState {
  const definition = definitionOf(kind);
  for (const tile of candidateTiles(state, definition.requiresDeposit)) {
    if (checkPlacement(state, kind, tile.q, tile.r).ok) {
      return addBuilding(state, kind, tile.q, tile.r);
    }
  }
  // Reaching here means the terrain generator's deposit guarantee failed, which is a bug
  // in world generation rather than a situation the player can create.
  throw new Error(`No valid tile for the starting ${definition.label}`);
}

/**
 * The starting buildings are a gift, not a purchase, but they still go through the normal
 * placement path so that the layout obeys exactly the same rules the player does. Funding
 * the account first and setting the real balance afterwards keeps that path unmodified.
 */
const STARTING_CONSTRUCTION_BUDGET = 100_000;

export function createColony(seed: number): SimState {
  const bare: SimState = {
    seed,
    rngState: seed,
    solTime: 0.3, // Just after sunrise: the demo opens with the sun coming up.
    sol: 1,
    terrain: generateTerrain(seed),
    buildings: [],
    nextBuildingId: 1,
    stocks: { ...STARTING_STOCKS, minerals: STARTING_CONSTRUCTION_BUDGET },
    population: STARTING_POPULATION,
    deprivation: { water: 0, food: 0 },
    gameOver: null,
    activeEvents: [],
    notices: [],
    history: [],
    report: EMPTY_REPORT,
  };

  let state = bare;
  for (const [kind, count] of STARTING_BUILDINGS) {
    for (let placed = 0; placed < count; placed++) {
      state = placeStartingBuilding(state, kind);
    }
  }
  state = { ...state, stocks: { ...state.stocks, minerals: STARTING_STOCKS.minerals } };

  // One tick so the report is populated before anything renders.
  return simulateTick(state, TICK_SECONDS);
}
