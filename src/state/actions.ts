/**
 * User actions. See docs/SPEC-05-state.md.
 *
 * Each one validates against SimState, then applies a pure transition from sim/placement.
 * A rejection sets a notice the HUD displays; there are no silent no-ops, because a click
 * that does nothing without saying why reads as a bug.
 */

import { definitionOf } from '../sim/constants.ts';
import {
  addBuilding,
  checkPlacement,
  removeBuilding,
  repairCost,
  setBuildingStatus,
} from '../sim/placement.ts';
import { createColony } from '../sim/colony.ts';
import type { BuildingKind } from '../sim/types.ts';
import { clearSave } from './persistence.ts';
import { useStore } from './store.ts';

function findBuilding(id: string) {
  return useStore.getState().sim.buildings.find((building) => building.id === id) ?? null;
}

/**
 * Fixtures the colony is issued cannot be placed, idled or demolished.
 *
 * The guard lives here rather than in `checkPlacement` because the starting colony routes
 * its own buildings through that function — blocking it there would need a bypass flag, and
 * the user-action boundary is where "the player may not do this" belongs anyway.
 */
function rejectFixture(kind: BuildingKind): boolean {
  const definition = definitionOf(kind);
  if (definition.buildable) return false;
  useStore.getState().setNotice(`The ${definition.label} is part of the colony and cannot change.`);
  return true;
}

export function placeBuilding(kind: BuildingKind, q: number, r: number): boolean {
  if (rejectFixture(kind)) return false;

  const store = useStore.getState();
  const check = checkPlacement(store.sim, kind, q, r);

  if (!check.ok) {
    store.setNotice(check.message);
    return false;
  }

  store.setSim(addBuilding(store.sim, kind, q, r));
  store.setNotice(null);
  return true;
}

export function demolishBuilding(id: string): boolean {
  const store = useStore.getState();
  const building = findBuilding(id);
  if (!building) return false;
  if (rejectFixture(building.kind)) return false;

  store.setSim(removeBuilding(store.sim, id));
  store.selectBuilding(null);
  return true;
}

export function toggleIdle(id: string): boolean {
  const store = useStore.getState();
  const building = findBuilding(id);
  if (!building) return false;
  if (rejectFixture(building.kind)) return false;

  if (building.status === 'damaged') {
    store.setNotice('Repair it before bringing it back online.');
    return false;
  }

  store.setSim(setBuildingStatus(store.sim, id, building.status === 'active' ? 'idle' : 'active'));
  return true;
}

export function repairBuilding(id: string): boolean {
  const store = useStore.getState();
  const building = findBuilding(id);
  if (!building) return false;

  if (building.status !== 'damaged') return false;

  const cost = repairCost(building.kind);
  if (store.sim.stocks.minerals < cost) {
    store.setNotice(`Repairing the ${definitionOf(building.kind).label} needs ${cost} minerals.`);
    return false;
  }

  const repaired = setBuildingStatus(store.sim, id, 'active');
  store.setSim({
    ...repaired,
    stocks: { ...repaired.stocks, minerals: repaired.stocks.minerals - cost },
  });
  return true;
}

export function newColony(seed: number): void {
  const store = useStore.getState();
  store.setSim(createColony(seed));
  store.selectBuilding(null);
  store.setBuildMode(null);
  store.setNotice(null);
  store.publishSnapshot();
}

/**
 * Discards the stored colony and starts over. Speed is forced back to 1 because the two
 * places this is reachable from — the HUD button and the game-over screen — can both be
 * sitting on a colony whose loop has stopped.
 */
export function restartColony(seed: number): void {
  clearSave();
  newColony(seed);
  useStore.getState().setSpeed(1);
}
