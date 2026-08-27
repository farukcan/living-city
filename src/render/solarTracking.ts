/**
 * Which way a solar array's tilted panel should yaw to face the sun. See
 * docs/SPEC-04-rendering.md.
 *
 * Split out of `Buildings.tsx` so the trigonometry is testable without pulling
 * react-three-fiber into a unit test — the same reason `rocketPhase.ts` exists.
 */

/** Tilt of the sun's arc. Matches the light rig in `SunLight.tsx`. */
const ORBIT_TILT = 0.35;

/**
 * Yaw (radians, rotation around the vertical axis) that turns a solar array to face the
 * sun's current horizontal position.
 *
 * The panel geometry (`buildingGeometry.ts`) is authored with a fixed downward tilt that
 * leans its front toward local -Z. Rotating the array's head by this angle around Y carries
 * that lean to point at `(cos(sweep), sin(sweep) * ORBIT_TILT)` — the same horizontal
 * direction `SunLight.tsx` places the light rig at for the same `solTime`. Only the head
 * turns; its pedestal is a separate mesh that never moves.
 */
export function solarPanelYaw(solTime: number): number {
  const sweep = 2 * Math.PI * (solTime - 0.25);
  return Math.atan2(-Math.cos(sweep), -Math.sin(sweep) * ORBIT_TILT);
}
