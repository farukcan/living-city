import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { hexToWorld } from '../sim/hex.ts';
import { findTile, HEX_SIZE } from '../sim/terrain.ts';
import type { Building, BuildingKind, TerrainField } from '../sim/types.ts';
import { useStore } from '../state/store.ts';
import { createBuildingMaterial, setNightFactor } from './buildingMaterial.ts';
import { buildingGeometry } from './geometry/buildingGeometry.ts';
import { tileHeight } from './Terrain.tsx';

/**
 * One InstancedMesh per building kind. See docs/SPEC-04-rendering.md.
 *
 * Matrices and status tints are rewritten only when the building list changes — a user
 * action — never on a simulation tick.
 */

const scratchObject = new THREE.Object3D();

/**
 * Buildings are authored at roughly hex-radius scale and then enlarged here.
 *
 * The ceiling is geometric, not aesthetic: a flat-top hex is √3 ≈ 1.73 units across, and
 * the widest building (the solar array, 1.32 units) has to fit inside it. Past about 1.2
 * neighbouring buildings visibly overlap, which in a dense colony reads as a bug.
 */
const BUILDING_SCALE = 1.2;

/** Per-instance tint, multiplied with the geometry's own vertex colours. */
const STATUS_TINT: Readonly<Record<Building['status'], THREE.Color>> = {
  active: new THREE.Color('#FFFFFF'),
  idle: new THREE.Color('#6E6A66'),
  damaged: new THREE.Color('#8C4A45'),
};

type BuildingsProps = {
  field: TerrainField;
  buildings: readonly Building[];
  onSelect: (id: string) => void;
};

export function Buildings({ field, buildings, onSelect }: BuildingsProps) {
  const byKind = useMemo(() => {
    const groups = new Map<BuildingKind, Building[]>();
    for (const building of buildings) {
      const group = groups.get(building.kind);
      if (group) group.push(building);
      else groups.set(building.kind, [building]);
    }
    return [...groups.entries()];
  }, [buildings]);

  return (
    <>
      {byKind.map(([kind, group]) => (
        <BuildingCluster
          key={kind}
          kind={kind}
          field={field}
          buildings={group}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

type ClusterProps = {
  kind: BuildingKind;
  field: TerrainField;
  buildings: readonly Building[];
  onSelect: (id: string) => void;
};

function BuildingCluster({ kind, field, buildings, onSelect }: ClusterProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => buildingGeometry(kind), [kind]);
  const material = useMemo(() => createBuildingMaterial(), []);

  // Buildings light up as the sun goes down. Driven per frame from the simulation rather
  // than from a clock, so the glow and the solar output always agree about the time.
  useFrame(() => {
    const { sunIntensity } = useStore.getState().sim.report.environment;
    setNightFactor(material, 1 - Math.min(1, sunIntensity * 1.6));
  });

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    buildings.forEach((building, index) => {
      const tile = findTile(field, building.q, building.r);
      const { x, z } = hexToWorld(building, HEX_SIZE);
      scratchObject.position.set(x, tile ? tileHeight(tile) : 0, z);
      scratchObject.scale.setScalar(BUILDING_SCALE);
      // A slight lean sells the damage without a separate mesh.
      scratchObject.rotation.set(0, 0, building.status === 'damaged' ? 0.14 : 0);
      scratchObject.updateMatrix();
      mesh.setMatrixAt(index, scratchObject.matrix);
      mesh.setColorAt(index, STATUS_TINT[building.status]);
    });

    scratchObject.rotation.set(0, 0, 0);
    mesh.count = buildings.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [buildings, field, geometry]);

  const handleHover = (event: ThreeEvent<PointerEvent>) => {
    if (event.instanceId === undefined) return;
    const building = buildings[event.instanceId];
    useStore.getState().setHoveredBuilding(building?.id ?? null);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.instanceId === undefined) return;
    const building = buildings[event.instanceId];
    if (!building) return;

    // While placement is armed, a building must not swallow the click. Letting it fall
    // through to the tile underneath means the player gets "tile is already occupied"
    // instead of having their build mode silently cancelled by a stray click.
    if (useStore.getState().interaction.buildMode !== null) return;

    event.stopPropagation();
    onSelect(building.id);
  };

  return (
    <instancedMesh
      key={`${kind}-${buildings.length}`}
      ref={meshRef}
      args={[geometry, material, Math.max(1, buildings.length)]}
      castShadow
      receiveShadow
      onClick={handleClick}
      onPointerMove={handleHover}
      onPointerOut={() => useStore.getState().setHoveredBuilding(null)}
    />
  );
}
