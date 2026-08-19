/**
 * Procedural building geometry. See docs/SPEC-04-rendering.md.
 *
 * Each type is composed from primitives and merged into one BufferGeometry at startup, so
 * a whole building type draws in a single instanced call. Parts carry vertex colours and
 * an emissive mask, which is how one material and one draw call still produce a two-tone
 * building whose windows light up at night and whose body dims when idled.
 *
 * The design rule is silhouette first: at default zoom a building is roughly 60 px tall,
 * so each type has to be identifiable by outline before colour. Detail below that
 * threshold — panel cells, hull ribs, railings — exists for when the player zooms in, and
 * costs nothing extra at distance because it is all one mesh.
 */

import type * as THREE from 'three';
import type { BuildingKind } from '../../sim/types.ts';
import { assemble, box, cylinder, geodesicDome, solarPanel, sphere } from './primitives.ts';

/** A pipe running between two points, used to tie a building's parts together. */
function strut(
  length: number,
  radius: number,
  at: Parameters<typeof cylinder>[4],
  material: string,
): THREE.BufferGeometry {
  return cylinder(radius, radius, length, 8, at, { material });
}

/** Drum layout for the depot, shared by the bodies and their lids. */
const DRUM_POSITIONS = [
  [-0.26, -0.16],
  [0.26, -0.16],
  [0, 0.28],
] as const;

/** Approach lights at the four corners of the landing pad. */
const PAD_LIGHT_POSITIONS = [
  [-0.44, -0.44],
  [0.44, -0.44],
  [-0.44, 0.44],
  [0.44, 0.44],
] as const;

const BUILDERS: Readonly<Record<BuildingKind, () => THREE.BufferGeometry>> = {
  /**
   * A tilted cell array on a mast, with a small tracker motor at the pivot.
   * The only wide, flat, angled shape on the map.
   */
  solarArray: () =>
    assemble([
      cylinder(0.4, 0.46, 0.12, 8, { y: 0.06 }, { material: 'frameDark' }),
      strut(0.62, 0.06, { y: 0.4 }, 'frame'),
      cylinder(0.11, 0.11, 0.16, 10, { y: 0.7, rz: Math.PI / 2 }, { material: 'frameDark' }),
      // A shallower tilt than a real array would use: steeper, and from a raised camera
      // the panel presents its unlit edge and reads as a black slab.
      ...solarPanel(1.3, 0.88, 4, 3, { y: 0.76, rx: -0.32 }),
      // Support bar under the panel, visible from a low camera.
      box([1.18, 0.045, 0.05], { y: 0.69, z: 0.16, rx: -0.32 }, { material: 'frame' }),
      box([0.06, 0.05, 0.44], { y: 0.72, rx: -0.32 }, { material: 'frame' }),
    ]),

  /**
   * A ribbed cell stack behind a status board. The lit strip is the readable part: it is
   * the only building whose entire purpose is a number the HUD also shows.
   */
  batteryBank: () =>
    assemble([
      box([0.92, 0.1, 0.72], { y: 0.05 }, { material: 'frameDark' }),
      box([0.84, 0.44, 0.62], { y: 0.32 }, { material: 'shellDark' }),
      // Cooling ribs.
      ...[-0.24, 0, 0.24].map((offset) =>
        box([0.86, 0.06, 0.08], { y: 0.5, z: offset }, { material: 'frame' }),
      ),
      box([0.5, 0.16, 0.02], { y: 0.34, z: 0.32 }, { material: '#F0B94A', glow: 1 }),
      box([0.86, 0.08, 0.66], { y: 0.57 }, { material: 'frameDark' }),
      cylinder(0.05, 0.05, 0.18, 6, { x: 0.3, y: 0.68 }, { material: 'copper' }),
      cylinder(0.05, 0.05, 0.18, 6, { x: -0.3, y: 0.68 }, { material: 'copper' }),
    ]),

  /**
   * A geodesic dome on a pressurised drum, with an airlock and a lit window band.
   * The shape people read as "somebody lives here".
   */
  habitat: () =>
    assemble([
      cylinder(0.56, 0.6, 0.1, 14, { y: 0.05 }, { material: 'frameDark' }),
      cylinder(0.54, 0.55, 0.28, 14, { y: 0.24 }, { material: 'shell' }),
      // Window band: the strongest night-time signal that the colony is inhabited.
      cylinder(0.555, 0.555, 0.1, 14, { y: 0.34 }, { material: '#8FE3F5', glow: 1 }),
      geodesicDome(0.56, 1, 0.07, { y: 0.36 }, { material: 'shell' }),
      sphere(0.09, { y: 0.93 }, { material: '#8FE3F5', glow: 1 }),
      // Airlock tube.
      cylinder(
        0.16,
        0.16,
        0.34,
        10,
        { x: 0.56, y: 0.2, rz: Math.PI / 2 },
        { material: 'shellDark' },
      ),
      box([0.06, 0.2, 0.16], { x: 0.74, y: 0.2 }, { material: '#F0B94A', glow: 0.8 }),
    ]),

  /**
   * A drill mast over a wellhead, with an ice hopper. The tallest thing on the map, which
   * is what makes an extractor findable across the grid.
   */
  iceExtractor: () =>
    assemble([
      cylinder(0.46, 0.5, 0.14, 8, { y: 0.07 }, { material: 'frameDark' }),
      box([0.44, 0.3, 0.44], { y: 0.28 }, { material: 'shellDark' }),
      // Lattice mast: four legs and two collars, cheaper than a real truss and reads the same.
      ...(
        [
          [0.12, 0.12],
          [-0.12, 0.12],
          [0.12, -0.12],
          [-0.12, -0.12],
        ] as const
      ).map(([x, z]) => strut(1.3, 0.032, { x, y: 1.02, z }, '#8E9398')),
      box([0.32, 0.035, 0.32], { y: 0.72 }, { material: 'frame' }),
      box([0.32, 0.035, 0.32], { y: 1.28 }, { material: 'frame' }),
      box([0.34, 0.22, 0.34], { y: 1.76 }, { material: 'shell' }),
      cylinder(0.06, 0.06, 0.5, 8, { y: 1.6 }, { material: 'copper' }),
      // Ice hopper beside the rig.
      cylinder(
        0.22,
        0.16,
        0.36,
        10,
        { x: 0.42, y: 0.32, z: 0.2 },
        { material: 'glass', glow: 0.25 },
      ),
      box([0.1, 0.12, 0.02], { y: 0.34, z: 0.23 }, { material: '#6FD3F0', glow: 1 }),
    ]),

  /**
   * Two electrolysis columns joined by a manifold, with an oxygen accumulator on top.
   */
  electrolyzer: () =>
    assemble([
      box([0.8, 0.09, 0.6], { y: 0.045 }, { material: 'frameDark' }),
      cylinder(0.2, 0.2, 0.82, 12, { x: -0.21, y: 0.5 }, { material: 'shell' }),
      cylinder(0.2, 0.2, 0.82, 12, { x: 0.21, y: 0.5 }, { material: 'shell' }),
      // Banding, so the columns do not read as blank pipes.
      ...[-0.21, 0.21].flatMap((x) =>
        [0.3, 0.68].map((y) => cylinder(0.215, 0.215, 0.05, 12, { x, y }, { material: 'frame' })),
      ),
      strut(0.44, 0.05, { y: 0.86, rz: Math.PI / 2 }, 'copper'),
      sphere(0.17, { y: 1.04 }, { material: 'shellDark' }),
      box([0.12, 0.1, 0.02], { x: -0.21, y: 0.5, z: 0.21 }, { material: '#6FD3F0', glow: 1 }),
      box([0.12, 0.1, 0.02], { x: 0.21, y: 0.5, z: 0.21 }, { material: '#6FD3F0', glow: 1 }),
    ]),

  /**
   * A glazed barrel vault over planting beds. The only horizontal cylinder, and the only
   * building with anything green inside it.
   */
  greenhouse: () =>
    assemble([
      box([1.3, 0.12, 0.82], { y: 0.06 }, { material: 'frameDark' }),
      // Soil beds and crops, visible through the glass.
      ...[-0.2, 0.2].map((z) => box([1.1, 0.12, 0.24], { y: 0.16, z }, { material: 'soil' })),
      ...[-0.2, 0.2].flatMap((z) =>
        [-0.36, -0.12, 0.12, 0.36].map((x) =>
          box([0.16, 0.16, 0.16], { x, y: 0.28, z }, { material: 'plant' }),
        ),
      ),
      cylinder(0.42, 0.42, 1.24, 12, { y: 0.2, rz: Math.PI / 2 }, { material: 'glass', glow: 0.3 }),
      // Ribs along the vault.
      ...[-0.44, 0, 0.44].map((x) =>
        cylinder(0.435, 0.435, 0.05, 12, { x, y: 0.2, rz: Math.PI / 2 }, { material: 'frame' }),
      ),
      box([0.07, 0.46, 0.86], { x: -0.63, y: 0.24 }, { material: 'shell' }),
      box([0.07, 0.46, 0.86], { x: 0.63, y: 0.24 }, { material: 'shell' }),
    ]),

  /**
   * A pit head with an angled conveyor climbing to a spoil chute.
   */
  mine: () =>
    assemble([
      cylinder(0.5, 0.54, 0.12, 8, { y: 0.06 }, { material: 'frameDark' }),
      // The excavation itself.
      cylinder(0.3, 0.22, 0.16, 8, { y: 0.1 }, { material: '#2A2320' }),
      box([0.42, 0.44, 0.42], { x: -0.32, y: 0.34 }, { material: 'shellDark' }),
      box([0.1, 0.12, 0.02], { x: -0.32, y: 0.4, z: 0.22 }, { material: '#F0B94A', glow: 1 }),
      // Conveyor: belt, side rails, support leg.
      box([1.06, 0.07, 0.3], { x: 0.2, y: 0.52, rz: 0.5 }, { material: 'rubber' }),
      box([1.06, 0.05, 0.04], { x: 0.2, y: 0.52, z: 0.16, rz: 0.5 }, { material: 'frame' }),
      box([1.06, 0.05, 0.04], { x: 0.2, y: 0.52, z: -0.16, rz: 0.5 }, { material: 'frame' }),
      strut(0.5, 0.045, { x: 0.34, y: 0.3 }, 'frame'),
      box([0.26, 0.3, 0.34], { x: 0.62, y: 0.88 }, { material: 'hazard' }),
    ]),

  /**
   * Three sealed drums on a pallet with a labelled crate. Obviously containers, obviously
   * not machinery — the one building that must not look like it does anything.
   */
  storageDepot: () =>
    assemble([
      box([0.92, 0.08, 0.92], { y: 0.04 }, { material: 'frameDark' }),
      ...DRUM_POSITIONS.map(([x, z]) =>
        cylinder(0.24, 0.24, 0.5, 12, { x, y: 0.33, z }, { material: 'shell' }),
      ),
      ...DRUM_POSITIONS.map(([x, z]) =>
        cylinder(0.25, 0.25, 0.05, 12, { x, y: 0.5, z }, { material: 'frame' }),
      ),
      box([0.34, 0.26, 0.3], { x: 0.02, y: 0.21, z: -0.42 }, { material: 'hazard' }),
      box([0.16, 0.1, 0.02], { x: 0.02, y: 0.24, z: -0.58 }, { material: '#F0B94A', glow: 0.9 }),
    ]),

  /**
   * A painted apron with approach lights. The one flat silhouette on the map — it has to
   * read as ground rather than machinery, because the thing worth looking at is the rocket
   * that lands on it.
   */
  rocketPad: () =>
    assemble([
      cylinder(0.58, 0.62, 0.08, 16, { y: 0.04 }, { material: 'frameDark' }),
      cylinder(0.46, 0.46, 0.02, 16, { y: 0.09 }, { material: 'hazard' }),
      cylinder(0.3, 0.3, 0.025, 16, { y: 0.1 }, { material: 'frameDark' }),
      ...PAD_LIGHT_POSITIONS.map(([x, z]) =>
        box([0.05, 0.16, 0.05], { x, y: 0.12, z }, { material: '#F0B94A', glow: 1 }),
      ),
    ]),
};

const cache = new Map<BuildingKind, THREE.BufferGeometry>();

/** Built once per type and cached; geometry never changes after startup. */
export function buildingGeometry(kind: BuildingKind): THREE.BufferGeometry {
  const cached = cache.get(kind);
  if (cached) return cached;
  const geometry = BUILDERS[kind]();
  cache.set(kind, geometry);
  return geometry;
}
