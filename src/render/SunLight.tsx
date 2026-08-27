import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SECONDS_PER_SOL } from '../sim/constants.ts';
import { sunElevation } from '../sim/environment.ts';
import { renderSolTime } from '../state/loop.ts';
import { useStore } from '../state/store.ts';
import { PALETTE } from './palette.ts';

/**
 * The moving sun, and the sky that follows it. See docs/SPEC-04-rendering.md.
 *
 * This component is the bridge between the simulation and the look of the scene: the same
 * `solTime` that decides how much power the arrays make also decides where the shadows
 * fall and what colour the sky is. It reads the store imperatively inside `useFrame`, so
 * none of that costs a React render.
 */

const ORBIT_RADIUS = 34;
/** Tilt of the sun's arc, so it does not travel straight overhead. */
const ORBIT_TILT = 0.35;

const dayColor = new THREE.Color(PALETTE.skyDay);
const nightColor = new THREE.Color(PALETTE.skyNight);
const stormColor = new THREE.Color(PALETTE.skyStorm);
const scratchSky = new THREE.Color();
const scratchLight = new THREE.Color();

const SUN_WARM = new THREE.Color('#FFE2B8');
const SUN_COLD = new THREE.Color('#9FB4D8');

/**
 * Night fill light. Near-neutral on purpose: a saturated blue fill multiplies against the
 * rust terrain to almost nothing, leaving the ground a black void. A desaturated fill with
 * only a hint of blue keeps the terrain readable and still reads as night.
 */
const NIGHT_FILL = new THREE.Color('#8189A3');

/** Fog distances, tightened during a dust storm. */
const FOG_NEAR_CLEAR = 40;
const FOG_FAR_CLEAR = 165;
const FOG_NEAR_STORM = 16;
const FOG_FAR_STORM = 62;

const SHADOW_MAP_SIZE = 4096;
/** Half-width of the shadow ortho. Scales with GRID_RADIUS 8 → 10 so edge tiles stay inside. */
const SHADOW_CAMERA_EXTENT = 30;
/**
 * World-space light travel before the depth map is redrawn.
 *
 * A single 1x frame at 120 Hz already moves the rig by
 * `ORBIT_RADIUS × 2π / (SECONDS_PER_SOL × 120) ≈ 0.030`. One ortho texel is
 * 60/4096 ≈ 0.015 — smaller than that — so a one-texel gate would keep
 * `needsUpdate` true every frame and the flicker would remain. Seven frames
 * of 1x travel (~0.21) is the hold: one visible step, then stable, at the
 * same simulated rate on 60 Hz or 144 Hz.
 */
const SHADOW_MOVE = ((ORBIT_RADIUS * 2 * Math.PI) / (SECONDS_PER_SOL * 120)) * 7;
const SHADOW_MOVE_SQ = SHADOW_MOVE * SHADOW_MOVE;

export function SunLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.HemisphereLight>(null);
  // Per-mount, not module-level: a remounted light has an empty map and must refresh
  // even if the sun has not moved since the previous instance wrote this.
  const lastShadowPosition = useRef(new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0));
  const lastBuildings = useRef<unknown>(null);

  // The scene comes from the frame state rather than a captured `useThree` value: mutating
  // a value closed over from render is what the compiler rules (rightly) object to.
  useFrame(({ scene }) => {
    const { sim } = useStore.getState();
    const { sunIntensity, dustFactor } = sim.report.environment;
    // Interpolated, not sim.solTime directly: the sim ticks at 10 Hz, and reading it straight
    // holds the sun still for several frames between ticks and snaps — see loop.ts.
    const solTime = renderSolTime();

    // Elevation drives height, the sol angle drives the east-to-west sweep. Below the
    // horizon the light is parked rather than removed, so nothing pops when it returns.
    const elevation = sunElevation(solTime);
    const sweep = 2 * Math.PI * (solTime - 0.25);
    const light = lightRef.current;
    if (light) {
      light.position.set(
        Math.cos(sweep) * ORBIT_RADIUS,
        Math.max(2, elevation * ORBIT_RADIUS),
        Math.sin(sweep) * ORBIT_RADIUS * ORBIT_TILT,
      );
      light.intensity = 0.15 + sunIntensity * 2.6 * dustFactor;
      // Low sun reads warm, high sun reads neutral-cold: the cheapest possible sunrise.
      light.color.copy(SUN_COLD).lerp(SUN_WARM, 1 - Math.min(1, sunIntensity * 1.6));
      // Position still advances every frame so N·L stays smooth; only the depth map
      // (and its matrix) hold. They stay in lockstep because Three skips both when
      // `needsUpdate` is false. Building-list identity also dirties the map so a
      // placement while paused still casts a shadow.
      const sunMoved =
        light.position.distanceToSquared(lastShadowPosition.current) >= SHADOW_MOVE_SQ;
      const buildingsMoved = sim.buildings !== lastBuildings.current;
      if (sunMoved || buildingsMoved) {
        if (sunMoved) lastShadowPosition.current.copy(light.position);
        lastBuildings.current = sim.buildings;
        light.shadow.needsUpdate = true;
      }
    }

    const storminess = 1 - dustFactor;
    scratchSky.copy(nightColor).lerp(dayColor, Math.min(1, sunIntensity * 1.4));
    scratchSky.lerp(stormColor, storminess * 0.75 * Math.min(1, 0.35 + sunIntensity));

    // The sky dome paints the background now, so only the fog is tinted here — it has to
    // match the dome's horizon band or distant geometry separates from the sky.
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(scratchSky);
      scene.fog.near = FOG_NEAR_CLEAR + (FOG_NEAR_STORM - FOG_NEAR_CLEAR) * storminess;
      scene.fog.far = FOG_FAR_CLEAR + (FOG_FAR_STORM - FOG_FAR_CLEAR) * storminess;
    }

    const ambient = ambientRef.current;
    if (ambient) {
      // Never fully dark. Ambient fill is driven by its own cool night colour rather than
      // by the sky: the night sky is nearly black, so tinting the fill with it leaves the
      // terrain as an unreadable silhouette and the colony floating in a void.
      ambient.intensity = 0.55 + sunIntensity * 0.3;
      scratchLight.copy(NIGHT_FILL).lerp(dayColor, Math.min(1, sunIntensity * 1.4));
      ambient.color.copy(scratchLight);
    }
  });

  return (
    <>
      <hemisphereLight ref={ambientRef} args={[PALETTE.skyDay, PALETTE.terrainLow, 0.5]} />
      <directionalLight
        ref={lightRef}
        intensity={2.2}
        castShadow
        // The map is not redrawn every frame — see SHADOW_MOVE_SQ. Without this, Three
        // would rebuild it whenever the light moved, which is every frame.
        shadow-autoUpdate={false}
        // 4096: a shadow edge lives on this grid, so when the map *does* refresh
        // the jump is one texel. The larger board (frustum ±30) would coarsen a
        // 3072 map; 4096 keeps world-texel size about where 3072/±24 was.
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-camera-left={-SHADOW_CAMERA_EXTENT}
        shadow-camera-right={SHADOW_CAMERA_EXTENT}
        shadow-camera-top={SHADOW_CAMERA_EXTENT}
        shadow-camera-bottom={-SHADOW_CAMERA_EXTENT}
        shadow-bias={-0.0012}
        // One shadow texel is 60/4096 ≈ 0.015 world units. A normal offset under one
        // texel leaves sloped faces — the solar panels worst of all — sampling the
        // neighbouring cell, which reads as acne even on a held map. Three texels'
        // worth clears it here.
        shadow-normalBias={0.05}
      />
    </>
  );
}
