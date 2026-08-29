import { useMemo } from 'react';
import * as THREE from 'three';
import { hexToWorld } from '../sim/hex.ts';
import { findTile, HEX_SIZE } from '../sim/terrain.ts';
import type { Building, TerrainField } from '../sim/types.ts';
import { BUILDING_SCALE } from './Buildings.tsx';
import { buildingGeometry } from './geometry/buildingGeometry.ts';
import { PALETTE } from './palette.ts';
import { tileHeight } from './Terrain.tsx';

/**
 * A flat fault badge floating over every building a meteor has wrecked.
 *
 * The damage tint and the lean built into `Buildings` say something is wrong only once the
 * player is already looking at that building; a colony spread over twenty tiles needs a mark
 * that finds the eye instead. Sprites rather than geometry, so the badge always faces the
 * camera whatever the orbit angle, and with size attenuation off it keeps one size on screen:
 * a wrecked mine at the far edge of the grid is as legible as one under the cursor.
 *
 * Drawn per damaged building rather than instanced. Meteors hit one building at a time and
 * repairs clear them, so this list is empty most of the run and a handful long at worst —
 * well under the point where batching would pay for the billboard shader it would need.
 */

const ICON_PIXELS = 128;
/** Roughly 4% of viewport height at the scene's 42° field of view. */
const MARKER_SCALE = 0.07;
/** Clearance between the top of the building and the badge. */
const MARKER_GAP = 0.3;

/**
 * The badge itself: a warning triangle, drawn once into a canvas.
 *
 * A canvas rather than an imported image so the icon ships inside the bundle with no asset
 * pipeline, and stays in the palette rather than in a designer's export.
 */
function buildBadgeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_PIXELS;
  canvas.height = ICON_PIXELS;

  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error(`No 2D canvas context for the ${ICON_PIXELS}px damage badge`);
  }

  const size = ICON_PIXELS;
  const inset = size * 0.06;

  context.beginPath();
  context.moveTo(size / 2, inset);
  context.lineTo(size - inset, size - inset);
  context.lineTo(inset, size - inset);
  context.closePath();

  context.fillStyle = PALETTE.critical;
  context.fill();
  // A dark rim is what keeps the badge readable against a pale roof or a bright sky.
  context.lineWidth = size * 0.07;
  context.lineJoin = 'round';
  context.strokeStyle = 'rgba(26, 22, 38, 0.85)';
  context.stroke();

  // Exclamation mark: a tapered bar over a dot, both centred on the triangle's mass rather
  // than on its bounding box, which sits lower.
  context.fillStyle = '#FFFFFF';
  context.fillRect(size * 0.455, size * 0.36, size * 0.09, size * 0.28);
  context.beginPath();
  context.arc(size / 2, size * 0.74, size * 0.055, 0, Math.PI * 2);
  context.fill();

  return new THREE.CanvasTexture(canvas);
}

let badgeMaterial: THREE.SpriteMaterial | null = null;

/**
 * The one badge material every marker shares.
 *
 * Built on first use and kept for the lifetime of the page, mirroring the geometry cache in
 * `geometry/buildingGeometry.ts`: there is exactly one `DamageMarkers` in the scene, and a
 * material torn down and rebuilt with the component would be rebuilt for nothing — under
 * StrictMode, rebuilt from an already-disposed texture.
 */
function damageBadgeMaterial(): THREE.SpriteMaterial {
  badgeMaterial ??= new THREE.SpriteMaterial({
    map: buildBadgeTexture(),
    transparent: true,
    // Constant on screen at every zoom: the badge is a readout, not a prop in the scene.
    sizeAttenuation: false,
    // A fault the player cannot see is a fault they cannot repair, so the badge is allowed
    // through terrain rather than being swallowed by a ridge in front of it. It must not
    // write depth either: N8AO reads that buffer, and a badge stamping its own far depth
    // over the building behind it would carve ambient occlusion out of thin air.
    depthTest: false,
    depthWrite: false,
  });
  return badgeMaterial;
}

/**
 * Height of a building's highest point, in world units above its tile.
 *
 * `assemble` leaves the bounding box unbuilt, and the merged geometries are cached for the
 * lifetime of the page, so computing it once here also caches it on the shared geometry.
 */
function buildingTop(building: Building): number {
  const geometry = buildingGeometry(building.kind);
  if (geometry.boundingBox === null) geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (bounds === null) throw new Error(`No bounding box for ${building.kind} geometry`);
  return bounds.max.y * BUILDING_SCALE;
}

type Marker = {
  readonly id: string;
  readonly position: [number, number, number];
};

type DamageMarkersProps = {
  field: TerrainField;
  buildings: readonly Building[];
};

export function DamageMarkers({ field, buildings }: DamageMarkersProps) {
  const material = useMemo(() => damageBadgeMaterial(), []);

  const markers = useMemo<Marker[]>(
    () =>
      buildings
        .filter((building) => building.status === 'damaged')
        .map((building) => {
          const tile = findTile(field, building.q, building.r);
          const { x, z } = hexToWorld(building, HEX_SIZE);
          // Measured off the geometry rather than assumed: a habitat dome and a solar mast
          // are nowhere near the same height, and a fixed offset clips one or floats the other.
          return {
            id: building.id,
            position: [x, (tile ? tileHeight(tile) : 0) + buildingTop(building) + MARKER_GAP, z],
          };
        }),
    [buildings, field],
  );

  return (
    <>
      {markers.map((marker) => (
        <sprite
          key={marker.id}
          position={marker.position}
          material={material}
          scale={[MARKER_SCALE, MARKER_SCALE, 1]}
          // Drawn after the world it is allowed to overlap, so the two agree on who wins.
          renderOrder={10}
        />
      ))}
    </>
  );
}
