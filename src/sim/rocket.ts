/**
 * The crew landing schedule. See docs/SPEC-02-buildings.md.
 *
 * Everything here is derived from `sol`, which the simulation already tracks. A stored
 * counter would be a second source of truth that can drift across a save, and the rocket
 * animation needs a continuous phase anyway — only a formula gives one. The pad is issued
 * with the colony and cannot be built, idled or demolished, so the schedule is unconditional.
 */

export const LANDING_INTERVAL_SOLS = 7;

/** Crew on the first landing, and the amount each later landing adds on top. */
export const CREW_PER_LANDING_STEP = 5;

/** Landings completed at the start of `sol`. */
export function landingsBySol(sol: number): number {
  return Math.floor(sol / LANDING_INTERVAL_SOLS);
}

/** Crew on the nth landing, n from 1: 5, 10, 15, 20, … unbounded. This is the difficulty. */
export function crewForLanding(n: number): number {
  return CREW_PER_LANDING_STEP * n;
}

/**
 * Crew arriving on the tick that advances `fromSol` to `toSol`. Zero when no landing
 * boundary was crossed, and a sum when several were — a long enough tick cannot skip one.
 */
export function crewArriving(fromSol: number, toSol: number): number {
  let crew = 0;
  for (let n = landingsBySol(fromSol) + 1; n <= landingsBySol(toSol); n++) {
    crew += crewForLanding(n);
  }
  return crew;
}

/** Continuous sols until the next landing, in (0, LANDING_INTERVAL_SOLS]. */
export function solsUntilLanding(sol: number, solTime: number): number {
  return LANDING_INTERVAL_SOLS - ((sol + solTime) % LANDING_INTERVAL_SOLS);
}

/** Crew the next landing will bring, for the countdown to name a number. */
export function nextLandingCrew(sol: number): number {
  return crewForLanding(landingsBySol(sol) + 1);
}
