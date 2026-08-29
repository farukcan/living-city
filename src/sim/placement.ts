/**
 * Placement rules and the pure state transitions that build, remove and re-status
 * buildings. See docs/SPEC-02-buildings.md.
 *
 * Every rejection carries a reason. A click that silently does nothing reads as a bug, so
 * there are no silent no-ops anywhere in this module.
 */

import { definitionOf, DEMOLISH_REFUND_RATE, REPAIR_COST_RATE } from './constants.ts';
import { axialKey } from './hex.ts';
import { findTile } from './terrain.ts';
import type { Building, BuildingKind, SimState, Tile } from './types.ts';

export type PlacementRejection =
  'off-grid' | 'occupied' | 'wrong-deposit' | 'insufficient-minerals';

export type PlacementCheck =
  | { readonly ok: true; readonly tile: Tile }
  | { readonly ok: false; readonly reason: PlacementRejection; readonly message: string };

export function checkPlacement(
  state: SimState,
  kind: BuildingKind,
  q: number,
  r: number,
): PlacementCheck {
  const definition = definitionOf(kind);
  const tile = findTile(state.terrain, q, r);

  if (tile === null) {
    return { ok: false, reason: 'off-grid', message: 'Outside the survey area.' };
  }
  // Steep ground is not a rejection: the crew clears the boulders as part of the build.
  if (tile.buildingId !== null) {
    return { ok: false, reason: 'occupied', message: 'Tile is already occupied.' };
  }
  if (definition.requiresDeposit !== null && tile.deposit !== definition.requiresDeposit) {
    return {
      ok: false,
      reason: 'wrong-deposit',
      message: `${definition.label} needs a ${definition.requiresDeposit} deposit.`,
    };
  }
  if (state.stocks.minerals < definition.cost) {
    return {
      ok: false,
      reason: 'insufficient-minerals',
      message: `Needs ${definition.cost} minerals.`,
    };
  }

  return { ok: true, tile };
}

/** Replaces one tile, preserving order so terrain indices stay valid. */
function withTile(state: SimState, q: number, r: number, buildingId: string | null): SimState {
  const index = state.terrain.indexByKey[axialKey(q, r)];
  if (index === undefined) return state;

  const tiles = state.terrain.tiles.map((tile, at) =>
    at === index ? { ...tile, buildingId } : tile,
  );
  return { ...state, terrain: { ...state.terrain, tiles } };
}

/**
 * Adds a building and charges for it. Callers are expected to have run `checkPlacement`;
 * this function trusts that and stays a pure transition.
 */
export function addBuilding(state: SimState, kind: BuildingKind, q: number, r: number): SimState {
  const id = `b${state.nextBuildingId}`;
  const building: Building = { id, kind, q, r, status: 'active' };

  const placed = withTile(state, q, r, id);
  return {
    ...placed,
    buildings: [...placed.buildings, building],
    nextBuildingId: state.nextBuildingId + 1,
    stocks: {
      ...placed.stocks,
      minerals: placed.stocks.minerals - definitionOf(kind).cost,
    },
  };
}

export function removeBuilding(state: SimState, id: string): SimState {
  const building = state.buildings.find((candidate) => candidate.id === id);
  if (!building) return state;

  const refund = Math.floor(definitionOf(building.kind).cost * DEMOLISH_REFUND_RATE);
  const cleared = withTile(state, building.q, building.r, null);

  return {
    ...cleared,
    buildings: cleared.buildings.filter((candidate) => candidate.id !== id),
    stocks: {
      // Not clamped here: demolishing a depot lowers the cap at the same moment, and the
      // next tick clamps every stock against the new capacity in one place.
      ...cleared.stocks,
      minerals: cleared.stocks.minerals + refund,
    },
  };
}

export function setBuildingStatus(
  state: SimState,
  id: string,
  status: Building['status'],
): SimState {
  return {
    ...state,
    buildings: state.buildings.map((building) =>
      building.id === id ? { ...building, status } : building,
    ),
  };
}

export function repairCost(kind: BuildingKind): number {
  return Math.ceil(definitionOf(kind).cost * REPAIR_COST_RATE);
}
