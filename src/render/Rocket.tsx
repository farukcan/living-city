import { useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { hexToWorld } from '../sim/hex.ts';
import { findTile, HEX_SIZE } from '../sim/terrain.ts';
import type { Building, TerrainField } from '../sim/types.ts';
import { renderSolTime } from '../state/loop.ts';
import { useStore } from '../state/store.ts';
import { createBuildingMaterial, setNightFactor } from './buildingMaterial.ts';
import {
  NOZZLE_Y,
  plumeGeometry,
  ROCKET_SCALE,
  rocketGeometry,
} from './geometry/rocketGeometry.ts';
import { DESCENT_START, rocketCycle, rocketPhase } from './rocketPhase.ts';
import { tileHeight } from './Terrain.tsx';

/**
 * The crew rocket. See docs/SPEC-04-rendering.md.
 *
 * The one object besides the flow packets that moves every frame, and the reason the
 * "matrices are rewritten only on structural change" rule has an exception. Its phase comes
 * from the simulation clock rather than the wall clock, so pausing freezes it and 16× speeds
 * it up without either being handled here.
 */

type RocketProps = {
  field: TerrainField;
  buildings: readonly Building[];
};

export function Rocket({ field, buildings }: RocketProps) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const plumeRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const geometry = useMemo(() => rocketGeometry(), []);
  const plume = useMemo(() => plumeGeometry(), []);
  const material = useMemo(() => createBuildingMaterial(), []);

  // Structural, so this recomputes only when a building is placed or removed — never on a
  // simulation tick.
  const pad = useMemo(() => {
    const building = buildings.find((candidate) => candidate.kind === 'rocketPad');
    if (!building) return null;
    const tile = findTile(field, building.q, building.r);
    const { x, z } = hexToWorld(building, HEX_SIZE);
    // Clears the pad's painted apron so the fins rest on it rather than through it.
    return { x, z, y: (tile ? tileHeight(tile) : 0) + 0.1 };
  }, [buildings, field]);

  useFrame(() => {
    const group = groupRef.current;
    if (!group || pad === null) return;

    const { sol } = useStore.getState().sim;
    // Interpolated, not sim.solTime directly: the sim ticks at 10 Hz, and reading it straight
    // holds the rocket at one altitude for several render frames and then jumps — see loop.ts.
    const solTime = renderSolTime();
    const t = sol + solTime;

    // Nothing has launched yet this cycle, so there is nothing to show but the empty pad —
    // except on the opening sol, where `rocketCycle` puts the founding rocket already
    // parked (see docs/SPEC-04-rendering.md).
    if (sol !== 1 && t < DESCENT_START) {
      group.visible = false;
      return;
    }

    const phase = rocketPhase(rocketCycle(sol, solTime));
    group.visible = phase.visible;
    if (!phase.visible) return;

    group.position.y = pad.y + phase.altitude;

    // A hard shadow cast from twelve units up would sprawl across the whole colony; on the
    // pad it is the contact shadow that stops the rocket reading as pasted on.
    const body = bodyRef.current;
    if (body) body.castShadow = phase.altitude < 0.05;

    const flame = plumeRef.current;
    if (flame) {
      flame.visible = phase.thrust > 0.01;
      // Driven off the simulation clock like everything else here, so the flicker stops dead
      // when the game is paused instead of idling on.
      flame.scale.y = phase.thrust * (0.85 + 0.15 * Math.sin(t * 900));
    }

    const light = lightRef.current;
    if (light) light.intensity = phase.thrust * 6;

    const { sunIntensity } = useStore.getState().sim.report.environment;
    setNightFactor(material, 1 - Math.min(1, sunIntensity * 1.6));
  });

  if (pad === null) return null;

  return (
    <group ref={groupRef} position={[pad.x, pad.y, pad.z]} scale={ROCKET_SCALE} visible={false}>
      <mesh ref={bodyRef} geometry={geometry} material={material} receiveShadow />
      <mesh ref={plumeRef} geometry={plume} position={[0, NOZZLE_Y, 0]}>
        <meshBasicMaterial color="#FFD08A" toneMapped={false} />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, NOZZLE_Y - 0.2, 0]}
        color="#FFB347"
        distance={6}
        castShadow={false}
      />
    </group>
  );
}
