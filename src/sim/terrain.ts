/**
 * Procedural terrain generation.
 *
 * Deterministic in the seed: the same seed always produces the same field, which is why
 * terrain is regenerated on load rather than saved. See docs/SPEC-03-world.md.
 */

import { axialKey, hexField, hexToWorld, neighborsOf } from './hex.ts';
import type { AxialKey } from './hex.ts';
import { DEFAULT_FBM, fbm2d } from './noise.ts';
import type { DepositKind, TerrainField, Tile } from './types.ts';

export const GRID_RADIUS = 10;
export const HEX_SIZE = 1;
export const MAX_ELEVATION = 0.6;
export const NOISE_SCALE = 0.18;
export const SLOPE_LIMIT = 0.25;

/**
 * Deposits sample at a higher frequency than elevation. At the elevation scale a single
 * noise feature spans a third of the map, which produces one enormous ice field instead of
 * the several small ones the placement rules are interesting with.
 */
const DEPOSIT_NOISE_SCALE = 0.55;

/**
 * Deposits are the only hard placement constraint in the game, so a field without enough
 * of them is unplayable. The generator retries with a relaxed threshold rather than
 * rejecting the seed, which keeps every seed valid.
 */
const MIN_DEPOSITS_PER_KIND = 4;
const DEPOSIT_RETRY_LIMIT = 10;
const DEPOSIT_THRESHOLD_STEP = 0.02;

const ICE_THRESHOLD = 0.62;
const ICE_MAX_ELEVATION = 0.45;
// Ore is the darkest thing on the map, so a generous threshold turns half the field into
// shadow. Kept scarcer than ice for that reason as much as for balance.
const ORE_THRESHOLD = 0.72;
const ORE_MIN_ELEVATION = 0.4;

/** Separate noise channels, offset so elevation, ice and ore are uncorrelated. */
const ELEVATION_CHANNEL = 0;
const ICE_CHANNEL = 7919;
const ORE_CHANNEL = 104729;

type Sample = {
  readonly q: number;
  readonly r: number;
  readonly elevation: number;
  readonly iceNoise: number;
  readonly oreNoise: number;
};

function sampleChannel(q: number, r: number, seed: number, channel: number, scale: number): number {
  const world = hexToWorld({ q, r }, HEX_SIZE);
  return fbm2d(world.x * scale, world.z * scale, seed + channel, DEFAULT_FBM);
}

function sampleField(radius: number, seed: number): Sample[] {
  return hexField(radius).map(({ q, r }) => ({
    q,
    r,
    elevation: sampleChannel(q, r, seed, ELEVATION_CHANNEL, NOISE_SCALE),
    iceNoise: sampleChannel(q, r, seed, ICE_CHANNEL, DEPOSIT_NOISE_SCALE),
    oreNoise: sampleChannel(q, r, seed, ORE_CHANNEL, DEPOSIT_NOISE_SCALE),
  }));
}

/** Steepest elevation difference to any in-field neighbour. Edge tiles ignore gaps. */
function steepestSlope(sample: Sample, elevationByKey: ReadonlyMap<AxialKey, number>): number {
  let steepest = 0;
  for (const neighbor of neighborsOf(sample)) {
    const neighborElevation = elevationByKey.get(axialKey(neighbor.q, neighbor.r));
    if (neighborElevation === undefined) continue;
    steepest = Math.max(steepest, Math.abs(sample.elevation - neighborElevation));
  }
  return steepest;
}

/**
 * Assigns deposits at the given thresholds. Ice wins ties because basins are scarcer than
 * highlands, and a tile can only carry one deposit.
 */
function assignDeposits(
  samples: readonly Sample[],
  buildable: readonly boolean[],
  iceThreshold: number,
  oreThreshold: number,
): DepositKind[] {
  return samples.map((sample, index) => {
    if (!buildable[index]) return 'none';
    if (sample.iceNoise > iceThreshold && sample.elevation < ICE_MAX_ELEVATION) return 'ice';
    if (sample.oreNoise > oreThreshold && sample.elevation > ORE_MIN_ELEVATION) return 'ore';
    return 'none';
  });
}

function countDeposit(deposits: readonly DepositKind[], kind: DepositKind): number {
  return deposits.reduce((total, deposit) => (deposit === kind ? total + 1 : total), 0);
}

/**
 * Fills any remaining shortfall by assigning the best free tiles outright: the lowest
 * ground for ice, the highest for ore, matching where each would naturally form.
 *
 * Mutates `deposits` in place — it is a local array owned by the caller, and threading a
 * copy through two passes buys nothing here.
 */
function forceDeposits(
  samples: readonly Sample[],
  buildable: readonly boolean[],
  deposits: DepositKind[],
  kind: 'ice' | 'ore',
): void {
  const missing = MIN_DEPOSITS_PER_KIND - countDeposit(deposits, kind);
  if (missing <= 0) return;

  const candidates = samples
    .map((sample, index) => ({ sample, index }))
    .filter(({ index }) => buildable[index] === true && deposits[index] === 'none')
    // Ties break on coordinates so the result stays identical for a given seed.
    .sort((a, b) => {
      const byElevation =
        kind === 'ice'
          ? a.sample.elevation - b.sample.elevation
          : b.sample.elevation - a.sample.elevation;
      return byElevation !== 0 ? byElevation : a.sample.q - b.sample.q || a.sample.r - b.sample.r;
    });

  for (let i = 0; i < missing && i < candidates.length; i++) {
    const candidate = candidates[i];
    if (candidate) deposits[candidate.index] = kind;
  }
}

export function generateTerrain(seed: number, radius: number = GRID_RADIUS): TerrainField {
  const samples = sampleField(radius, seed);

  const elevationByKey = new Map<AxialKey, number>(
    samples.map((sample) => [axialKey(sample.q, sample.r), sample.elevation]),
  );
  const buildable = samples.map((sample) => steepestSlope(sample, elevationByKey) <= SLOPE_LIMIT);

  // Relax thresholds until both deposit kinds are placeable. Deterministic: the same seed
  // always needs the same number of relaxations.
  let iceThreshold = ICE_THRESHOLD;
  let oreThreshold = ORE_THRESHOLD;
  let deposits = assignDeposits(samples, buildable, iceThreshold, oreThreshold);
  for (let attempt = 0; attempt < DEPOSIT_RETRY_LIMIT; attempt++) {
    const iceShort = countDeposit(deposits, 'ice') < MIN_DEPOSITS_PER_KIND;
    const oreShort = countDeposit(deposits, 'ore') < MIN_DEPOSITS_PER_KIND;
    if (!iceShort && !oreShort) break;
    if (iceShort) iceThreshold -= DEPOSIT_THRESHOLD_STEP;
    if (oreShort) oreThreshold -= DEPOSIT_THRESHOLD_STEP;
    deposits = assignDeposits(samples, buildable, iceThreshold, oreThreshold);
  }

  // Relaxing the threshold is not a guarantee: ice also requires low ground, so a seed
  // whose terrain is uniformly high can starve however far the threshold falls. The
  // shortfall is then filled directly, which is what actually makes every seed playable.
  forceDeposits(samples, buildable, deposits, 'ice');
  forceDeposits(samples, buildable, deposits, 'ore');

  const tiles: Tile[] = samples.map((sample, index) => ({
    q: sample.q,
    r: sample.r,
    elevation: sample.elevation,
    deposit: deposits[index] ?? 'none',
    buildable: buildable[index] ?? false,
    buildingId: null,
  }));

  const indexByKey: Record<AxialKey, number> = {};
  tiles.forEach((tile, index) => {
    indexByKey[axialKey(tile.q, tile.r)] = index;
  });

  return { seed, radius, tiles, indexByKey };
}

export function findTile(field: TerrainField, q: number, r: number): Tile | null {
  const index = field.indexByKey[axialKey(q, r)];
  return index === undefined ? null : (field.tiles[index] ?? null);
}
