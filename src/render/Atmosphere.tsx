import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { hash2d } from '../sim/rng.ts';
import { renderSolTime } from '../state/loop.ts';
import { useStore } from '../state/store.ts';
import { PALETTE } from './palette.ts';

/**
 * Sky, horizon and the ground beyond the playable grid.
 *
 * The single biggest difference between "hexes floating in a void" and "a colony on a
 * planet" is that the world continues past the edge of the board. That is all this file
 * does: a gradient dome, a ring of distant hills, and a ground plane wide enough that the
 * fog swallows it before it ends.
 */

const SKY_RADIUS = 400;
const GROUND_RADIUS = 260;
const HILL_RING_RADIUS = 150;
const HILL_COUNT = 46;

/**
 * A vertical gradient with a warm band at the horizon.
 *
 * Written as a shader rather than a texture because it has to be re-tinted every frame as
 * the sun moves, and swapping uniforms is free where regenerating an image is not.
 */
const SKY_VERTEX = /* glsl */ `
  varying vec3 vWorldDirection;
  void main() {
    vWorldDirection = normalize((modelMatrix * vec4(position, 1.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uSunStrength;
  varying vec3 vWorldDirection;

  void main() {
    vec3 direction = normalize(vWorldDirection);

    // Height ramp, biased so most of the visible sky is the horizon colour rather than
    // the zenith — a linear ramp reads as a studio backdrop, not an atmosphere.
    float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
    float ramp = pow(clamp(height, 0.0, 1.0), 0.55);
    vec3 color = mix(uHorizon, uZenith, ramp);

    // Broad glow around the sun, strongest when it sits near the horizon.
    float sunAlignment = max(dot(direction, normalize(uSunDirection)), 0.0);
    float glow = pow(sunAlignment, 6.0) * 0.55 + pow(sunAlignment, 64.0) * 0.9;
    color += uSunColor * glow * uSunStrength;

    // Dust haze thickening toward the ground line.
    float haze = pow(1.0 - clamp(abs(direction.y), 0.0, 1.0), 3.0);
    color = mix(color, uHorizon, haze * 0.5);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Mars daytime sky is a dusty salmon, brighter than intuition suggests — a deep red zenith
// reads as an eclipse rather than as noon.
const ZENITH_DAY = new THREE.Color('#C97F58');
const ZENITH_NIGHT = new THREE.Color('#141020');
const HORIZON_DAY = new THREE.Color('#F6CDA6');
const HORIZON_NIGHT = new THREE.Color('#2A2036');
const HORIZON_STORM = new THREE.Color('#C1553A');
const ZENITH_STORM = new THREE.Color('#7A3324');

const scratchZenith = new THREE.Color();
const scratchHorizon = new THREE.Color();

type SkyUniforms = {
  uZenith: { value: THREE.Color };
  uHorizon: { value: THREE.Color };
  uSunColor: { value: THREE.Color };
  uSunDirection: { value: THREE.Vector3 };
  uSunStrength: { value: number };
};

function createSkyUniforms(): SkyUniforms {
  return {
    uZenith: { value: new THREE.Color(ZENITH_DAY) },
    uHorizon: { value: new THREE.Color(HORIZON_DAY) },
    uSunColor: { value: new THREE.Color('#FFD9A8') },
    uSunDirection: { value: new THREE.Vector3(1, 0.2, 0) },
    uSunStrength: { value: 1 },
  };
}

export function SkyDome() {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Created once for the material to own. Per-frame updates go through the material's own
  // uniform table below rather than through this object, so nothing produced by render is
  // ever written to after the fact.
  const initialUniforms = useMemo(() => createSkyUniforms(), []);

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;
    const uniforms = material.uniforms as unknown as SkyUniforms;

    const { sim } = useStore.getState();
    const { sunIntensity, dustFactor } = sim.report.environment;
    const storminess = 1 - dustFactor;
    const daylight = Math.min(1, sunIntensity * 1.5);

    scratchZenith.copy(ZENITH_NIGHT).lerp(ZENITH_DAY, daylight);
    scratchHorizon.copy(HORIZON_NIGHT).lerp(HORIZON_DAY, daylight);
    scratchZenith.lerp(ZENITH_STORM, storminess * 0.8 * daylight);
    scratchHorizon.lerp(HORIZON_STORM, storminess * 0.85 * Math.max(0.3, daylight));

    uniforms.uZenith.value.copy(scratchZenith);
    uniforms.uHorizon.value.copy(scratchHorizon);
    uniforms.uSunStrength.value = sunIntensity * dustFactor;

    // Matches the light rig in SunLight so the glow sits where the shadows say it should —
    // same interpolated solTime, not the raw 10 Hz sim value.
    const sweep = 2 * Math.PI * (renderSolTime() - 0.25);
    uniforms.uSunDirection.value
      .set(Math.cos(sweep), Math.max(0.02, Math.sin(sweep)), Math.sin(sweep) * 0.35)
      .normalize();
  });

  return (
    <mesh renderOrder={-100} frustumCulled={false}>
      <sphereGeometry args={[SKY_RADIUS, 32, 16]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={SKY_VERTEX}
        fragmentShader={SKY_FRAGMENT}
        uniforms={initialUniforms}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

const scratchObject = new THREE.Object3D();

/**
 * A ring of low hills at the fog line.
 *
 * Deterministic from a coordinate hash rather than the simulation RNG: this is scenery, it
 * must not consume draws that would shift the event stream.
 */
export function DistantHills() {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(() => {
    // Four-sided cones read as angular ridges rather than circus tents once fogged.
    const cone = new THREE.ConeGeometry(1, 1, 4, 1);
    cone.rotateY(Math.PI / 4);
    return cone;
  }, []);

  const placements = useMemo(() => {
    return Array.from({ length: HILL_COUNT }, (_, index) => {
      const jitter = hash2d(index, 17, 991);
      const spread = hash2d(index, 43, 313);
      const angle = ((index + jitter * 0.7) / HILL_COUNT) * Math.PI * 2;
      const distance = HILL_RING_RADIUS * (0.75 + spread * 0.55);
      return {
        x: Math.cos(angle) * distance,
        z: Math.sin(angle) * distance,
        width: 26 + hash2d(index, 7, 77) * 42,
        height: 9 + hash2d(index, 23, 131) * 20,
      };
    });
  }, []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    placements.forEach((placement, index) => {
      scratchObject.position.set(placement.x, -1, placement.z);
      scratchObject.scale.set(placement.width, placement.height, placement.width);
      scratchObject.updateMatrix();
      mesh.setMatrixAt(index, scratchObject.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [placements]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, HILL_COUNT]}
      frustumCulled={false}
      receiveShadow={false}
      castShadow={false}
    >
      <meshStandardMaterial color={PALETTE.terrainLow} roughness={1} metalness={0} flatShading />
    </instancedMesh>
  );
}

type GroundPlaneProps = {
  /** Outer world radius of the hex field, so the ring starts where the tiles end. */
  gridRadius: number;
  /** Height of an average tile top, so the plain meets the grid instead of floating. */
  surfaceHeight: number;
};

/**
 * The planet surface continuing past the grid.
 *
 * A ring rather than a disc, sitting at tile-top height: a disc under the grid leaves the
 * hexes standing on a visible pedestal, which reads as a board game rather than as ground.
 */
export function GroundPlane({ gridRadius, surfaceHeight }: GroundPlaneProps) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, surfaceHeight, 0]} receiveShadow>
      <ringGeometry args={[gridRadius, GROUND_RADIUS, 96, 1]} />
      <meshStandardMaterial color={PALETTE.terrainFar} roughness={1} metalness={0} />
    </mesh>
  );
}
