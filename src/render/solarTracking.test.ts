import { describe, expect, it } from 'vitest';
import { solarPanelYaw } from './solarTracking.ts';

/** Matches the light rig in `SunLight.tsx`. */
const ORBIT_TILT = 0.35;

/** Three.js's Y-axis rotation: x' = x cosθ + z sinθ, z' = -x sinθ + z cosθ. */
function rotateY(x: number, z: number, theta: number): { x: number; z: number } {
  return {
    x: x * Math.cos(theta) + z * Math.sin(theta),
    z: -x * Math.sin(theta) + z * Math.cos(theta),
  };
}

/** The panel's built-in lean before any tracking yaw is applied (see buildingGeometry.ts). */
const LOCAL_FRONT = { x: 0, z: -1 };

describe('solarPanelYaw', () => {
  it.each([0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 0.999])(
    'points the panel at the sun for solTime=%s',
    (solTime) => {
      const sweep = 2 * Math.PI * (solTime - 0.25);
      const sunX = Math.cos(sweep);
      const sunZ = Math.sin(sweep) * ORBIT_TILT;
      const sunLength = Math.hypot(sunX, sunZ);

      const front = rotateY(LOCAL_FRONT.x, LOCAL_FRONT.z, solarPanelYaw(solTime));
      const frontLength = Math.hypot(front.x, front.z);

      // Same direction, not just any alignment: normalized dot product must be 1.
      const dot = (front.x * sunX + front.z * sunZ) / (frontLength * sunLength);
      expect(dot).toBeCloseTo(1, 6);
    },
  );

  it('is periodic across a sol boundary', () => {
    expect(solarPanelYaw(0)).toBeCloseTo(solarPanelYaw(1), 6);
  });
});
