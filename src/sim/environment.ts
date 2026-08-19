/**
 * Sun and temperature for a moment in the sol. See docs/SPEC-01-simulation.md.
 *
 * Pure in `solTime`: no accumulated state, so the environment at any point in the cycle is
 * reproducible and directly testable.
 */

import { TARGET_TEMP, TEMP_DAY, TEMP_NIGHT } from './constants.ts';
import type { Environment } from './types.ts';

/**
 * Sun elevation as a sine over the sol, with sunrise at 0.25 and sunset at 0.75.
 * Returns negative values at night; callers clamp.
 */
export function sunElevation(solTime: number): number {
  return Math.sin(2 * Math.PI * (solTime - 0.25));
}

export function computeEnvironment(solTime: number, dustFactor: number): Environment {
  const sunIntensity = Math.max(0, sunElevation(solTime));
  return {
    sunIntensity,
    // Ambient tracks the sun directly. Mars has too little atmosphere for the thermal lag
    // that would make an afternoon peak realistic on Earth.
    ambientTemp: TEMP_NIGHT + (TEMP_DAY - TEMP_NIGHT) * sunIntensity,
    dustFactor,
  };
}

/** Heating draw in kW for a given insulation coefficient. */
export function heatingDemandKW(insulation: number, ambientTemp: number): number {
  return Math.max(0, insulation * (TARGET_TEMP - ambientTemp));
}
