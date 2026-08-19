/**
 * Where the crew rocket is within one landing cycle. See docs/SPEC-04-rendering.md.
 *
 * Split out of `Rocket.tsx` so it can be tested without a renderer: this is the only real
 * arithmetic in the rocket, and importing the component would pull in react-three-fiber.
 */

import { LANDING_INTERVAL_SOLS } from '../sim/rocket.ts';

/** Sols each phase occupies. At 1× that is 21 s down, 30 s parked, 18 s up. */
export const DESCENT_SOLS = 0.35;
export const REST_SOLS = 0.5;
export const ASCENT_SOLS = 0.3;

/**
 * How high the rocket appears from and vanishes to.
 *
 * Capped well under the sun's ±24-unit shadow ortho: past that the rocket's shadow leaves
 * the frustum at low sun angles and silently stops rendering. Twelve units still reads as
 * "arriving from orbit" against a camera sitting about nineteen units out.
 */
export const ENTRY_ALTITUDE = 12;

/** Where the descent begins within the cycle; everything before it is empty sky. */
export const DESCENT_START = LANDING_INTERVAL_SOLS - DESCENT_SOLS;
const ASCENT_END = REST_SOLS + ASCENT_SOLS;

/** Slow at the ground, quick at altitude — a retro-burn profile in one expression. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export type RocketPhase = {
  readonly visible: boolean;
  /** Height above the pad, in world units. */
  readonly altitude: number;
  /** Plume strength 0..1. */
  readonly thrust: number;
};

const HIDDEN: RocketPhase = { visible: false, altitude: 0, thrust: 0 };

/** `cycle` is sols since the last touchdown, i.e. `(sol + solTime) % LANDING_INTERVAL_SOLS`. */
export function rocketPhase(cycle: number): RocketPhase {
  if (cycle < REST_SOLS) {
    return { visible: true, altitude: 0, thrust: 0 };
  }
  if (cycle < ASCENT_END) {
    const t = (cycle - REST_SOLS) / ASCENT_SOLS;
    return {
      visible: true,
      altitude: ENTRY_ALTITUDE * easeOutCubic(t),
      thrust: 1 - 0.6 * t,
    };
  }
  if (cycle < DESCENT_START) return HIDDEN;

  const t = (cycle - DESCENT_START) / DESCENT_SOLS;
  return {
    visible: true,
    altitude: ENTRY_ALTITUDE * (1 - easeOutCubic(t)),
    thrust: 0.4 + 0.6 * t,
  };
}
