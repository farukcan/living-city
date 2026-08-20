import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
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

export function SunLight() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const ambientRef = useRef<THREE.HemisphereLight>(null);

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
        // 3072, not 2048: a shadow is sampled from this grid, so its edge cannot move
        // smoothly — it holds still until the sun has turned far enough to cross a texel,
        // then jumps a whole one. At 1x that works out to roughly a seventh of a texel per
        // frame, i.e. hold for seven frames and jump, which is exactly the stepped crawl
        // this is tuned against. A finer grid makes the jumps smaller and more frequent
        // until they stop reading as steps. 4096 is finer still, but measured 104 fps
        // against a locked 120 — it buys smoother shadows by reintroducing the dropped
        // frames that PostEffects was just tuned to eliminate, which is a bad trade.
        shadow-mapSize={[3072, 3072]}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-bias={-0.0012}
        // One shadow texel is 48/3072 ≈ 0.016 world units, and the light turns every frame
        // rather than holding for six (see renderSolTime in loop.ts). A normal offset under
        // one texel leaves sloped faces — the solar panels worst of all — re-sampling the
        // wrong texel each frame, which reads as crawling shadow acne. Three texels' worth
        // clears it here.
        shadow-normalBias={0.05}
      />
    </>
  );
}
