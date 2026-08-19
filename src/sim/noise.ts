/**
 * Value noise with fractional Brownian motion.
 *
 * Hand-written rather than pulled from npm because it has to be seedable and byte-for-byte
 * reproducible — regenerating terrain from a seed is what keeps the save file at a few
 * kilobytes (docs/SPEC-05-state.md).
 */

import { hash2d } from './rng.ts';

/** Hermite smoothstep — C1 continuous, which is enough to hide the lattice. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Single-octave value noise sampled at continuous coordinates. Returns `[0, 1)`. */
export function valueNoise2d(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smoothstep(x - xi);
  const yf = smoothstep(y - yi);

  const topLeft = hash2d(xi, yi, seed);
  const topRight = hash2d(xi + 1, yi, seed);
  const bottomLeft = hash2d(xi, yi + 1, seed);
  const bottomRight = hash2d(xi + 1, yi + 1, seed);

  return lerp(lerp(topLeft, topRight, xf), lerp(bottomLeft, bottomRight, xf), yf);
}

export type FbmOptions = {
  readonly octaves: number;
  readonly lacunarity: number;
  readonly gain: number;
};

export const DEFAULT_FBM: FbmOptions = {
  octaves: 3,
  lacunarity: 2,
  gain: 0.5,
};

/**
 * Fractional Brownian motion: octaves of value noise at doubling frequency and halving
 * amplitude. Normalised by total amplitude so the result stays in `[0, 1)` regardless of
 * octave count — otherwise every threshold in SPEC-03 would depend on the octave setting.
 */
export function fbm2d(x: number, y: number, seed: number, options: FbmOptions): number {
  let frequency = 1;
  let amplitude = 1;
  let total = 0;
  let normalisation = 0;

  for (let octave = 0; octave < options.octaves; octave++) {
    total += valueNoise2d(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
    normalisation += amplitude;
    frequency *= options.lacunarity;
    amplitude *= options.gain;
  }

  return normalisation > 0 ? total / normalisation : 0;
}
