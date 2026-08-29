import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { axialKey, hexToWorld } from '../sim/hex.ts';
import type { AxialKey } from '../sim/hex.ts';
import { hash2d } from '../sim/rng.ts';
import { HEX_SIZE, MAX_ELEVATION } from '../sim/terrain.ts';
import type { TerrainField, Tile } from '../sim/types.ts';
import { PALETTE } from './palette.ts';

/**
 * The hex ground and its scatter. See docs/SPEC-04-rendering.md.
 *
 * Tiles are drawn as three separate instanced meshes — rock, ice and ore — rather than one,
 * because ice needs a different material entirely: a frozen sheet that catches the sun is
 * the difference between "grey hex" and "there is water there". Everything is written once
 * when the field changes; terrain is static after generation.
 */

/** Visible thickness of a tile. Chunky blocks read as terrain; thin ones read as tiles. */
const BASE_HEIGHT = 0.55;

// Module-level scratch objects: nothing here may allocate per frame.
const scratchObject = new THREE.Object3D();
const scratchColor = new THREE.Color();
const colorLow = new THREE.Color(PALETTE.terrainLow);
const colorHigh = new THREE.Color(PALETTE.terrainHigh);

export function tileHeight(tile: Tile): number {
  return BASE_HEIGHT + tile.elevation * MAX_ELEVATION;
}

/**
 * Base rock colour with a deterministic per-tile wobble.
 *
 * A field where every tile of the same elevation is the same colour reads as a spreadsheet.
 * The variation is hashed from coordinates, so it survives reloads and costs no RNG state.
 */
function rockColor(tile: Tile, target: THREE.Color): THREE.Color {
  target.copy(colorLow).lerp(colorHigh, tile.elevation);
  const wobble = (hash2d(tile.q, tile.r, 4177) - 0.5) * 0.16;
  target.offsetHSL(wobble * 0.06, wobble * 0.2, wobble);
  return target;
}

/** Flat-top hex prism with the origin at its base, so instance scale.y is the height. */
function useHexGeometry(): THREE.CylinderGeometry {
  return useMemo(() => {
    // CylinderGeometry starts its first vertex on +z, which is a pointy-top hex; the axial
    // layout in sim/hex.ts is flat-top, hence the half-segment rotation.
    const hex = new THREE.CylinderGeometry(HEX_SIZE, HEX_SIZE * 0.97, 1, 6);
    hex.rotateY(Math.PI / 6);
    hex.translate(0, 0.5, 0);
    return hex;
  }, []);
}

type TileGroupProps = {
  field: TerrainField;
  tiles: readonly Tile[];
  onHoverTile: (key: AxialKey | null) => void;
  onClickTile: (key: AxialKey) => void;
};

/** Shared placement logic for the three tile materials. */
function useTileMatrices(
  meshRef: React.RefObject<THREE.InstancedMesh | null>,
  tiles: readonly Tile[],
  colored: boolean,
) {
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    tiles.forEach((tile, index) => {
      const { x, z } = hexToWorld(tile, HEX_SIZE);
      scratchObject.position.set(x, 0, z);
      scratchObject.scale.set(1, tileHeight(tile), 1);
      scratchObject.updateMatrix();
      mesh.setMatrixAt(index, scratchObject.matrix);
      if (colored) mesh.setColorAt(index, rockColor(tile, scratchColor));
    });

    mesh.count = tiles.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [meshRef, tiles, colored]);
}

/** Plain rock tiles — the bulk of the map. */
function RockTiles({ tiles, onHoverTile, onClickTile }: TileGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useHexGeometry();
  useTileMatrices(meshRef, tiles, true);

  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const tile = event.instanceId === undefined ? undefined : tiles[event.instanceId];
    onHoverTile(tile ? axialKey(tile.q, tile.r) : null);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    const tile = event.instanceId === undefined ? undefined : tiles[event.instanceId];
    if (!tile) return;
    event.stopPropagation();
    onClickTile(axialKey(tile.q, tile.r));
  };

  return (
    <instancedMesh
      key={`rock-${tiles.length}`}
      ref={meshRef}
      args={[geometry, undefined, Math.max(1, tiles.length)]}
      receiveShadow
      castShadow
      onPointerMove={handleMove}
      onPointerOut={() => onHoverTile(null)}
      onClick={handleClick}
    >
      <meshStandardMaterial flatShading roughness={0.95} metalness={0.02} />
    </instancedMesh>
  );
}

type DepositTilesProps = TileGroupProps & {
  color: string;
  roughness: number;
  metalness: number;
};

/** Ice and ore tiles, which differ from rock by material rather than by tint. */
function DepositTiles({
  tiles,
  color,
  roughness,
  metalness,
  onHoverTile,
  onClickTile,
}: DepositTilesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useHexGeometry();
  useTileMatrices(meshRef, tiles, false);

  const handleMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const tile = event.instanceId === undefined ? undefined : tiles[event.instanceId];
    onHoverTile(tile ? axialKey(tile.q, tile.r) : null);
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    const tile = event.instanceId === undefined ? undefined : tiles[event.instanceId];
    if (!tile) return;
    event.stopPropagation();
    onClickTile(axialKey(tile.q, tile.r));
  };

  if (tiles.length === 0) return null;

  return (
    <instancedMesh
      key={`${color}-${tiles.length}`}
      ref={meshRef}
      args={[geometry, undefined, tiles.length]}
      receiveShadow
      castShadow
      onPointerMove={handleMove}
      onPointerOut={() => onHoverTile(null)}
      onClick={handleClick}
    >
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </instancedMesh>
  );
}

type TerrainProps = {
  field: TerrainField;
  onHoverTile: (key: AxialKey | null) => void;
  onClickTile: (key: AxialKey) => void;
};

export function Terrain({ field, onHoverTile, onClickTile }: TerrainProps) {
  const groups = useMemo(() => {
    const rock: Tile[] = [];
    const ice: Tile[] = [];
    const ore: Tile[] = [];
    for (const tile of field.tiles) {
      if (tile.deposit === 'ice') ice.push(tile);
      else if (tile.deposit === 'ore') ore.push(tile);
      else rock.push(tile);
    }
    return { rock, ice, ore };
  }, [field]);

  const shared = { field, onHoverTile, onClickTile };

  return (
    <>
      <RockTiles {...shared} tiles={groups.rock} />
      {/* Smooth and faintly metallic: ice should catch the sun the rock does not. */}
      <DepositTiles
        {...shared}
        tiles={groups.ice}
        color={PALETTE.iceTint}
        roughness={0.12}
        metalness={0.05}
      />
      {/* Low metalness on purpose: there is no environment map, so a metallic surface has
          nothing to reflect and renders as a black hole in the map. */}
      <DepositTiles
        {...shared}
        tiles={groups.ore}
        color={PALETTE.oreTint}
        roughness={0.85}
        metalness={0.1}
      />
    </>
  );
}

type ScatterProps = {
  field: TerrainField;
};

/**
 * Boulders on steep tiles, cleared where a building stands.
 *
 * Geometry rather than an overlay colour, so the rough ground survives having a hover
 * highlight drawn on top of it. Building on such a tile is allowed and clears its boulders,
 * the same way `Pebbles` yields to a building below.
 */
export function Outcrops({ field }: ScatterProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const steepTiles = useMemo(
    () => field.tiles.filter((tile) => tile.steep && tile.buildingId === null),
    [field],
  );

  const geometry = useMemo(() => {
    // A low-poly icosahedron reads as a weathered boulder; a cone reads as a traffic cone.
    const rock = new THREE.IcosahedronGeometry(0.5, 0);
    rock.scale(1, 0.8, 1);
    return rock;
  }, []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    steepTiles.forEach((tile, index) => {
      const { x, z } = hexToWorld(tile, HEX_SIZE);
      const wobble = hash2d(tile.q, tile.r, 733);
      // Boulders mark a tile, they do not cover it: at hex scale anything much larger
      // reads as terrain rather than as an obstacle sitting on terrain.
      const size = 0.42 + wobble * 0.34;
      const offset = (hash2d(tile.r, tile.q, 991) - 0.5) * 0.5;
      scratchObject.position.set(x + offset, tileHeight(tile) + size * 0.3, z - offset * 0.6);
      scratchObject.rotation.set(wobble * 0.6, wobble * Math.PI * 2, wobble * 0.4);
      scratchObject.scale.set(size, size * 0.8, size);
      scratchObject.updateMatrix();
      mesh.setMatrixAt(index, scratchObject.matrix);
    });

    scratchObject.rotation.set(0, 0, 0);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [steepTiles]);

  if (steepTiles.length === 0) return null;

  return (
    <instancedMesh
      key={`outcrop-${steepTiles.length}`}
      ref={meshRef}
      args={[geometry, undefined, steepTiles.length]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={PALETTE.rock} flatShading roughness={1} />
    </instancedMesh>
  );
}

/**
 * Loose pebbles scattered over the open ground.
 *
 * Pure decoration, and the cheapest possible fix for the "empty board" feeling: three
 * stones per tile, one draw call, no per-frame work.
 */
export function Pebbles({ field }: ScatterProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const placements = useMemo(() => {
    const spots: { x: number; y: number; z: number; size: number; spin: number }[] = [];
    for (const tile of field.tiles) {
      if (tile.buildingId !== null || tile.deposit === 'ice') continue;
      const { x, z } = hexToWorld(tile, HEX_SIZE);
      const density = hash2d(tile.q, tile.r, 51);
      const count = density > 0.55 ? 3 : density > 0.3 ? 1 : 0;
      for (let i = 0; i < count; i++) {
        const angle = hash2d(tile.q * 31 + i, tile.r, 617) * Math.PI * 2;
        const radius = 0.25 + hash2d(tile.q, tile.r * 17 + i, 811) * 0.55;
        spots.push({
          x: x + Math.cos(angle) * radius,
          y: tileHeight(tile),
          z: z + Math.sin(angle) * radius,
          size: 0.07 + hash2d(i, tile.q + tile.r, 233) * 0.12,
          spin: hash2d(tile.r, tile.q + i, 97) * Math.PI * 2,
        });
      }
    }
    return spots;
  }, [field]);

  const geometry = useMemo(() => new THREE.DodecahedronGeometry(1, 0), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    placements.forEach((spot, index) => {
      scratchObject.position.set(spot.x, spot.y + spot.size * 0.4, spot.z);
      scratchObject.rotation.set(spot.spin * 0.3, spot.spin, spot.spin * 0.2);
      scratchObject.scale.setScalar(spot.size);
      scratchObject.updateMatrix();
      mesh.setMatrixAt(index, scratchObject.matrix);
    });
    scratchObject.rotation.set(0, 0, 0);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [placements]);

  if (placements.length === 0) return null;

  return (
    <instancedMesh
      key={`pebble-${placements.length}`}
      ref={meshRef}
      args={[geometry, undefined, placements.length]}
      castShadow
    >
      <meshStandardMaterial color={PALETTE.rock} flatShading roughness={1} />
    </instancedMesh>
  );
}
