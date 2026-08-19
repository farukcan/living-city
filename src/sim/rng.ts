/**
 * Seeded pseudo-random number generation.
 *
 * The simulation must be reproducible: the same seed and the same actions have to produce
 * the same colony, or save files and tests both become unreliable. `Math.random()` is
 * banned inside `src/sim` by an ESLint rule for exactly this reason.
 *
 * mulberry32 is chosen for being 32-bit, one line of state, and statistically good enough
 * for weather and meteors — this is not cryptography.
 */

/** RNG state is a plain number so it serializes with the rest of SimState. */
export type RngState = number;

export type RngDraw = {
  readonly value: number; // [0, 1)
  readonly state: RngState;
};

/**
 * One draw. Returns the value alongside the advanced state instead of mutating, so
 * callers stay pure and the caller decides whether a draw "counts".
 */
export function nextRandom(state: RngState): RngDraw {
  const advanced = (state + 0x6d2b79f5) | 0;
  let t = advanced;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: advanced };
}

/** Uniform draw in `[min, max)`. */
export function nextRange(state: RngState, min: number, max: number): RngDraw {
  const draw = nextRandom(state);
  return { value: min + draw.value * (max - min), state: draw.state };
}

/** Uniform integer draw in `[0, count)`. Returns -1 when `count` is 0. */
export function nextIndex(state: RngState, count: number): RngDraw {
  const draw = nextRandom(state);
  return { value: count > 0 ? Math.floor(draw.value * count) : -1, state: draw.state };
}

/**
 * Deterministic hash of two integers to `[0, 1)`, used by the terrain noise lattice.
 * Unlike `nextRandom` this carries no state: the same coordinates always hash the same,
 * which is what lets terrain regenerate from a seed instead of being saved.
 */
export function hash2d(x: number, y: number, seed: number): number {
  let h =
    Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
