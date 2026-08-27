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
 * Applied to both meshes below. At this scale the rocket stands about 2.0 units tall —
 * taller than the ice extractor, the tallest building — while staying 0.83 wide across the
 * fins, well inside the width a single hex can hold.
 */
export const ROCKET_SCALE = 1.6;

/** Where the plume is anchored, in unscaled rocket space: just under the engine bell. */
export const NOZZLE_Y = -0.12;

const FIN_COUNT = 3;

/** How far the fins lean: base flared out, tip tucked in. */
const FIN_SWEEP = -0.34;

let rocketCache: THREE.BufferGeometry | null = null;
let plumeCache: THREE.BufferGeometry | null = null;

/**
 * A two-stage ogive nose on a tapered hull, standing on three swept fins around a flared
 * engine skirt. Read against the colony's domes and slabs it is the only vertical, tapered
 * silhouette on the map, so it is unmistakable even at altitude.
 */
export function rocketGeometry(): THREE.BufferGeometry {
  if (rocketCache) return rocketCache;

  // Each fin is rotated into its sweep first, then spun around the hull — and its offset
  // has to be spun with it, because `place` translates in world space after rotating.
  const fins = Array.from({ length: FIN_COUNT }, (_unused, index) => {
    const yaw = (index * Math.PI * 2) / FIN_COUNT;
    return box(
      [0.05, 0.42, 0.24],
      {
        x: Math.sin(yaw) * 0.18,
        y: 0.22,
        z: Math.cos(yaw) * 0.18,
        rx: FIN_SWEEP,
        ry: yaw,
      },
      { material: 'frame' },
    );
  });

  rocketCache = assemble([
    cylinder(0.18, 0.22, 0.8, 12, { y: 0.45 }, { material: 'shell' }),
    cylinder(0.135, 0.185, 0.2, 12, { y: 0.94 }, { material: 'shell' }),
    cylinder(0.015, 0.135, 0.24, 12, { y: 1.14 }, { material: 'shell' }),
    // Livery band between two dark seams, and a lower hull ring: the markings that keep
    // the hull from reading as one long extrusion.
    cylinder(0.19, 0.195, 0.1, 12, { y: 0.78 }, { material: '#F2EEE6' }),
    ...[0.725, 0.835].map((y) =>
      cylinder(0.194, 0.194, 0.02, 12, { y }, { material: 'frameDark' }),
    ),
    cylinder(0.2, 0.2, 0.045, 12, { y: 0.24 }, { material: 'frameDark' }),
    // Lit by the same aGlow path the habitat windows use, so a night landing shows a crew
    // aboard without a second material.
    cylinder(0.183, 0.183, 0.07, 12, { y: 0.6 }, { material: '#8FE3F5', glow: 1 }),
    // Engine: a flared skirt over the bell, which is what the fins appear to brace.
    cylinder(0.22, 0.26, 0.1, 12, { y: 0.05 }, { material: 'frameDark' }),
    cylinder(0.13, 0.21, 0.12, 12, { y: -0.06 }, { material: 'rubber' }),
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
