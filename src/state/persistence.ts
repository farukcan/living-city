/**
 * localStorage persistence. See docs/SPEC-05-state.md.
 *
 * Terrain is never saved: it regenerates from the seed, which is the payoff of keeping
 * generation deterministic — the save file stays a couple of kilobytes no matter how large
 * the grid gets. History is not saved either; a sparkline that refills in two minutes is
 * not worth persisting 120 sols of four series to recover.
 */

import { TICK_SECONDS } from '../sim/constants.ts';
import { axialKey } from '../sim/hex.ts';
import { generateTerrain } from '../sim/terrain.ts';
import { simulateTick } from '../sim/tick.ts';
import type {
  ActiveEvent,
  Building,
  DeprivationTimers,
  GameOver,
  ResourceKind,
  SimState,
  Tile,
} from '../sim/types.ts';
import { createColony } from '../sim/colony.ts';

/**
 * The key is deliberately not versioned alongside the schema: bumping it would orphan the
 * old blob in localStorage forever, where keeping it means the first v2 save overwrites it.
 */
const STORAGE_KEY = 'living-machine.save.v1';
const SCHEMA_VERSION = 2;

export type SaveFile = {
  readonly version: number;
  readonly seed: number;
  readonly rngState: number;
  readonly sol: number;
  readonly solTime: number;
  readonly population: number;
  readonly nextBuildingId: number;
  readonly stocks: Record<ResourceKind, number>;
  readonly buildings: readonly Building[];
  readonly activeEvents: readonly ActiveEvent[];
  readonly deprivation: DeprivationTimers;
  readonly gameOver: GameOver | null;
};

/**
 * The landing schedule is absent on purpose: it is derived from `sol`, which is already
 * here, so there is nothing to drift out of sync.
 */
export function toSaveFile(sim: SimState): SaveFile {
  return {
    version: SCHEMA_VERSION,
    seed: sim.seed,
    rngState: sim.rngState,
    sol: sim.sol,
    solTime: sim.solTime,
    population: sim.population,
    nextBuildingId: sim.nextBuildingId,
    stocks: { ...sim.stocks },
    buildings: sim.buildings.map((building) => ({ ...building })),
    activeEvents: sim.activeEvents.map((event) => ({ ...event })),
    deprivation: { ...sim.deprivation },
    gameOver: sim.gameOver === null ? null : { ...sim.gameOver },
  };
}

/** Rebuilds terrain from the seed and re-marks the tiles the saved buildings occupy. */
function restoreTerrain(save: SaveFile) {
  const terrain = generateTerrain(save.seed);
  const tiles: Tile[] = [...terrain.tiles];

  for (const building of save.buildings) {
    const index = terrain.indexByKey[axialKey(building.q, building.r)];
    if (index === undefined) continue;
    const tile = tiles[index];
    if (tile) tiles[index] = { ...tile, buildingId: building.id };
  }

  return { ...terrain, tiles };
}

function isSaveFile(value: unknown): value is SaveFile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<SaveFile>;
  return (
    candidate.version === SCHEMA_VERSION &&
    typeof candidate.seed === 'number' &&
    typeof candidate.rngState === 'number' &&
    typeof candidate.sol === 'number' &&
    typeof candidate.population === 'number' &&
    typeof candidate.stocks === 'object' &&
    candidate.stocks !== null &&
    typeof candidate.deprivation === 'object' &&
    candidate.deprivation !== null &&
    Array.isArray(candidate.buildings)
  );
}

export function fromSaveFile(save: SaveFile): SimState {
  const template = createColony(save.seed);
  const restored: SimState = {
    ...template,
    rngState: save.rngState,
    sol: save.sol,
    solTime: save.solTime,
    terrain: restoreTerrain(save),
    buildings: save.buildings.map((building) => ({ ...building })),
    nextBuildingId: save.nextBuildingId,
    stocks: { ...save.stocks },
    population: save.population,
    activeEvents: save.activeEvents.map((event) => ({ ...event })),
    deprivation: { ...save.deprivation },
    notices: [],
    history: [],
    // Restored alive so the priming tick below actually runs: `simulateTick` returns
    // immediately once `gameOver` is set, which would leave the template's report in place.
    gameOver: null,
  };

  // One tick so the report matches the restored colony rather than the template's.
  const ticked = simulateTick(restored, TICK_SECONDS);
  return { ...ticked, gameOver: save.gameOver ?? ticked.gameOver };
}

export function save(sim: SimState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSaveFile(sim)));
  } catch {
    // A full or unavailable quota must never take the game down with it. Losing a save is
    // recoverable; an uncaught exception in the loop is not.
  }
}

/**
 * Loads the stored colony, or returns null when there is nothing usable.
 *
 * A version mismatch or a parse failure starts fresh rather than attempting a migration:
 * there is no migration path, and pretending otherwise would ship a class of bug that stays
 * invisible until it corrupts someone's colony.
 */
export function load(): SimState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSaveFile(parsed)) return null;
    return fromSaveFile(parsed);
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; the next save overwrites it anyway.
  }
}
