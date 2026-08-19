/**
 * The crew rocket and its thrust plume. See docs/SPEC-04-rendering.md.
 *
 * Built once and cached like every building, but kept out of `buildingGeometry` because a
 * rocket is not a building: it never occupies a tile, and its transform is rewritten every
 * frame rather than only when the colony changes.
 */

import * as THREE from 'three';
import { assemble, box, cylinder } from './primitives.ts';

/**
 * Applied to both meshes below. At this scale the rocket stands about 1.9 units tall —
 * taller than the ice extractor, the tallest building — while staying 0.64 wide, well inside
 * the width a single hex can hold.
 */
export const ROCKET_SCALE = 1.6;

/** Where the plume is anchored, in unscaled rocket space: just under the engine bell. */
export const NOZZLE_Y = -0.12;

const FIN_COUNT = 3;

let rocketCache: THREE.BufferGeometry | null = null;
let plumeCache: THREE.BufferGeometry | null = null;

/**
 * A capsule on a bell with three fins. Read against the colony's domes and slabs it is the
 * only vertical, tapered silhouette on the map, so it is unmistakable even at altitude.
 */
export function rocketGeometry(): THREE.BufferGeometry {
  if (rocketCache) return rocketCache;

  const fins = Array.from({ length: FIN_COUNT }, (_unused, index) =>
    box(
      [0.04, 0.3, 0.22],
      { y: 0.18, z: 0.18, ry: (index * Math.PI * 2) / FIN_COUNT },
      { material: 'frameDark' },
    ),
  );

  rocketCache = assemble([
    cylinder(0.16, 0.2, 0.9, 12, { y: 0.45 }, { material: 'shell' }),
    cylinder(0.02, 0.16, 0.34, 12, { y: 1.07 }, { material: 'shellDark' }),
    // Lit by the same aGlow path the habitat windows use, so a night landing shows a crew
    // aboard without a second material.
    cylinder(0.165, 0.165, 0.08, 12, { y: 0.7 }, { material: '#8FE3F5', glow: 1 }),
    cylinder(0.2, 0.12, 0.12, 12, { y: -0.06 }, { material: 'frameDark' }),
    ...fins,
  ]);
  return rocketCache;
}

/**
 * The plume, pointing down from the nozzle. Its own geometry rather than part of the rocket
 * because it is scaled independently every frame, and its own material because it must stay
 * bright enough to trip the bloom threshold rather than being lit like a hull.
 */
export function plumeGeometry(): THREE.BufferGeometry {
  if (plumeCache) return plumeCache;
  const cone = new THREE.ConeGeometry(0.14, 0.7, 10);
  // Tip down, and shifted so the wide end sits at the nozzle: scaling y then stretches the
  // flame away from the engine instead of through it.
  cone.rotateX(Math.PI);
  cone.translate(0, -0.35, 0);
  plumeCache = cone;
  return plumeCache;
}
