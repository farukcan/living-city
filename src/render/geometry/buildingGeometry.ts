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
 *
 * Shapes follow the concept art in docs/concept_art: stepped footings, capped roofs,
 * corner posts and banded tanks are what separate a machine from a primitive, and each
 * costs a handful of triangles. Segment counts stay deliberately low — the faceting is the
 * style, not a compromise.
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

/** Corner posts of a boxed enclosure, as signed offsets from its centre. */
const CORNER_OFFSETS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

/** Drum layout for the depot, shared by the bodies and their lids. */
const DRUM_POSITIONS = [
  [-0.26, -0.16],
  [0.26, -0.16],
  [0, 0.28],
] as const;

/** The four legs of the ice extractor's lattice mast. */
const MAST_LEGS = [
  [0.12, 0.12],
  [-0.12, 0.12],
  [0.12, -0.12],
  [-0.12, -0.12],
] as const;

/** How far the mine's conveyor leans, in radians. Its cross-ties are spaced along it. */
const CONVEYOR_TILT = 0.5;

/** Spoil thrown out around the mine's pit mouth. */
const SPOIL_ANGLES = Array.from({ length: 12 }, (_unused, index) => (index * Math.PI) / 6);

/** Approach lights around the landing pad's apron, inside the hex deck's short axis. */
const PAD_LIGHT_POSITIONS = [
  [-0.33, -0.33],
  [0.33, -0.33],
  [-0.33, 0.33],
  [0.33, 0.33],
] as const;

/** The array's fixed lean. Shallow on purpose — see the panel note below. */
const PANEL_TILT = -0.32;

/**
 * The solar array's static half: a stepped octagonal pedestal, a braced mast, and the
 * collar the head turns on.
 *
 * Three faceted tiers rather than one drum: the pedestal is what gives the array weight,
 * and a single cylinder reads as a pole stuck in the ground.
 */
function solarArrayBaseParts(): THREE.BufferGeometry[] {
  return [
    cylinder(0.46, 0.52, 0.09, 8, { y: 0.045 }, { material: 'frameDark' }),
    cylinder(0.38, 0.44, 0.09, 8, { y: 0.135 }, { material: 'shellDark' }),
    cylinder(0.26, 0.32, 0.08, 8, { y: 0.22 }, { material: 'frame' }),
    cylinder(0.08, 0.13, 0.56, 8, { y: 0.52 }, { material: 'frame' }),
    cylinder(0.14, 0.14, 0.06, 8, { y: 0.73 }, { material: 'frameDark' }),
    ...[-1, 1].map((side) =>
      box([0.04, 0.3, 0.04], { x: side * 0.16, y: 0.4, rz: side * 0.5 }, { material: 'frame' }),
    ),
  ];
}

/**
 * The solar array's moving half: everything above the pivot, authored around the mast axis
 * so a yaw about Y turns it in place.
 */
function solarArrayHeadParts(): THREE.BufferGeometry[] {
  return [
    // Tracker motor at the pivot. It has to clear the panel's underside: the panel is
    // tilted about the same origin, so a motor sized by eye pokes its top facets straight
    // through the cell face.
    cylinder(0.1, 0.1, 0.18, 8, { y: 0.77, rz: Math.PI / 2 }, { material: 'frameDark' }),
    // Edge rail under the cells, so the array reads as a framed panel and not a slab.
    box([1.38, 0.02, 0.94], { y: 0.88, rx: PANEL_TILT }, { material: 'frame' }),
    // A shallower tilt than a real array would use: steeper, and from a raised camera
    // the panel presents its unlit edge and reads as a black slab.
    ...solarPanel(1.34, 0.9, 5, 3, { y: 0.905, rx: PANEL_TILT }),
    // The spine that carries the panel. Nothing sits on the cell face: a part placed there
    // has to be offset along the panel's normal, and one offset in world Y instead floats
    // clear of the glass and drops a shadow across it.
    box([1.2, 0.05, 0.05], { y: 0.84, z: 0.16, rx: PANEL_TILT }, { material: 'frame' }),
    box([0.06, 0.05, 0.46], { y: 0.87, rx: PANEL_TILT }, { material: 'frame' }),
  ];
}

const BUILDERS: Readonly<Record<BuildingKind, () => THREE.BufferGeometry>> = {
  /**
   * A tilted cell array on a braced mast, standing on a stepped octagonal pedestal.
   * The only wide, flat, angled shape on the map.
   *
   * Whole, this is what the placement ghost and the reference renders want. The scene
   * draws the two halves separately so only the head tracks the sun — see
   * `solarArrayBase` and `solarArrayHead` below.
   */
  solarArray: () => assemble([...solarArrayBaseParts(), ...solarArrayHeadParts()]),

  /**
   * A hardened enclosure on a stepped plinth: corner posts, an overhanging roof cap and
   * two vent stacks. The lit status board is the readable part — it is the only building
   * whose entire purpose is a number the HUD also shows.
   */
  batteryBank: () =>
    assemble([
      box([1.08, 0.07, 0.88], { y: 0.035 }, { material: 'frameDark' }),
      box([0.96, 0.06, 0.76], { y: 0.1 }, { material: 'frame' }),
      box([0.84, 0.44, 0.62], { y: 0.35 }, { material: 'shell' }),
      ...CORNER_OFFSETS.map(([sx, sz]) =>
        box([0.1, 0.46, 0.1], { x: sx * 0.4, y: 0.35, z: sz * 0.29 }, { material: 'frameDark' }),
      ),
      // Roof cap overhangs the body, which is what makes the box read as built rather
      // than extruded, and carries the cooling ribs.
      box([0.94, 0.07, 0.72], { y: 0.6 }, { material: 'frameDark' }),
      ...[-0.18, 0.18].map((z) => box([0.7, 0.035, 0.07], { y: 0.645, z }, { material: 'frame' })),
      ...[-0.28, 0.28].flatMap((x) => [
        cylinder(0.05, 0.05, 0.2, 8, { x, y: 0.73, z: -0.04 }, { material: 'copper' }),
        cylinder(0.07, 0.07, 0.045, 8, { x, y: 0.85, z: -0.04 }, { material: 'copper' }),
      ]),
      box([0.46, 0.17, 0.02], { x: -0.16, y: 0.4, z: 0.32 }, { material: '#F0B94A', glow: 1 }),
      // Recessed personnel door with a lit indicator.
      box([0.24, 0.34, 0.02], { x: 0.25, y: 0.29, z: 0.315 }, { material: 'frame' }),
      box([0.18, 0.29, 0.02], { x: 0.25, y: 0.28, z: 0.325 }, { material: 'frameDark' }),
      box([0.05, 0.07, 0.02], { x: 0.29, y: 0.34, z: 0.335 }, { material: '#F0B94A', glow: 0.8 }),
      box([0.055, 0.055, 0.02], { x: 0.09, y: 0.21, z: 0.32 }, { material: 'hazard', glow: 0.3 }),
    ]),

  /**
   * A geodesic dome on a pressurised drum, with a lit window band, a round airlock and a
   * comms mast. The shape people read as "somebody lives here".
   */
  habitat: () =>
    assemble([
      cylinder(0.6, 0.64, 0.09, 12, { y: 0.045 }, { material: 'frameDark' }),
      cylinder(0.54, 0.56, 0.3, 12, { y: 0.24 }, { material: 'shell' }),
      // Window band: the strongest night-time signal that the colony is inhabited, so it
      // is wide enough to survive being a few pixels tall.
      cylinder(0.565, 0.565, 0.13, 12, { y: 0.29 }, { material: '#5FCFEA', glow: 0.85 }),
      cylinder(0.58, 0.58, 0.05, 12, { y: 0.41 }, { material: 'frame' }),
      geodesicDome(0.56, 1, 0.07, { y: 0.4 }, { material: 'shell' }),
      // Comms cluster: a mast, whips and a beacon, which is the one part of the colony
      // that blinks red instead of amber.
      cylinder(0.022, 0.04, 0.22, 6, { y: 1.01 }, { material: 'frame' }),
      ...[-1, 1].map((side) =>
        box(
          [0.012, 0.2, 0.012],
          { x: side * 0.045, y: 1.12, rz: side * 0.2 },
          { material: 'frame' },
        ),
      ),
      sphere(0.05, 6, 4, { y: 1.15 }, { material: '#F04A2E', glow: 1 }),
      // Airlock: tube, flange ring, lit round hatch.
      cylinder(
        0.17,
        0.17,
        0.3,
        10,
        { x: 0.56, y: 0.2, rz: Math.PI / 2 },
        { material: 'shellDark' },
      ),
      cylinder(0.2, 0.2, 0.06, 10, { x: 0.72, y: 0.2, rz: Math.PI / 2 }, { material: 'frame' }),
      cylinder(
        0.115,
        0.115,
        0.03,
        10,
        { x: 0.76, y: 0.2, rz: Math.PI / 2 },
        { material: '#F0A03A', glow: 0.9 },
      ),
    ]),

  /**
   * A lattice drill mast over a wellhead, with a lit drill column running up its middle
   * and an ice tank alongside. The tallest thing on the map, which is what makes an
   * extractor findable across the grid.
   */
  iceExtractor: () =>
    assemble([
      cylinder(0.48, 0.52, 0.12, 8, { y: 0.06 }, { material: 'frameDark' }),
      box([0.46, 0.32, 0.46], { x: -0.04, y: 0.28 }, { material: 'shellDark' }),
      box([0.5, 0.05, 0.5], { x: -0.04, y: 0.46 }, { material: 'frameDark' }),
      box([0.13, 0.14, 0.02], { x: -0.04, y: 0.3, z: 0.235 }, { material: '#F0B94A', glow: 1 }),
      // Lattice mast: four legs and three collars, cheaper than a real truss and reads
      // the same.
      ...MAST_LEGS.map(([x, z]) => strut(1.32, 0.032, { x: x - 0.04, y: 1.03, z }, '#8E9398')),
      ...[0.6, 1.04, 1.48].map((y) =>
        box([0.34, 0.04, 0.34], { x: -0.04, y }, { material: 'frame' }),
      ),
      // The drill column itself, lit down its whole length: the one part of the building
      // that is doing the work its name promises.
      cylinder(0.055, 0.055, 1.26, 8, { x: -0.04, y: 1.02 }, { material: '#E08A2E', glow: 0.55 }),
      box([0.4, 0.26, 0.4], { x: -0.04, y: 1.78 }, { material: 'shell' }),
      box([0.44, 0.05, 0.44], { x: -0.04, y: 1.935 }, { material: 'frameDark' }),
      box([0.12, 0.09, 0.02], { x: 0.02, y: 1.79, z: 0.205 }, { material: '#F0B94A', glow: 1 }),
      // Ice tank: a banded drum with a lid hatch, piped back to the wellhead.
      cylinder(
        0.24,
        0.22,
        0.42,
        10,
        { x: 0.44, y: 0.35, z: 0.2 },
        { material: 'glass', glow: 0.25 },
      ),
      cylinder(0.26, 0.26, 0.05, 10, { x: 0.44, y: 0.56, z: 0.2 }, { material: 'frame' }),
      cylinder(0.09, 0.09, 0.05, 8, { x: 0.44, y: 0.61, z: 0.2 }, { material: 'frameDark' }),
      cylinder(0.25, 0.27, 0.12, 10, { x: 0.44, y: 0.08, z: 0.2 }, { material: 'frameDark' }),
      ...[0.16, 0.3].map((y) =>
        strut(0.36, 0.035, { x: 0.24, y, z: 0.28, rz: Math.PI / 2 }, 'frame'),
      ),
      box([0.1, 0.12, 0.02], { x: 0.44, y: 0.37, z: 0.38 }, { material: '#6FD3F0', glow: 1 }),
    ]),

  /**
   * Two banded electrolysis columns under a spherical accumulator fed by copper elbows.
   */
  electrolyzer: () =>
    assemble([
      cylinder(0.5, 0.54, 0.07, 8, { y: 0.035 }, { material: 'frameDark' }),
      cylinder(0.44, 0.46, 0.05, 8, { y: 0.09 }, { material: 'frame' }),
      ...[-0.21, 0.21].flatMap((x) => [
        cylinder(0.2, 0.2, 0.82, 12, { x, y: 0.53 }, { material: 'shell' }),
        // Banding and a dark top cap, so the columns do not read as blank pipes.
        ...[0.26, 0.78].map((y) =>
          cylinder(0.212, 0.212, 0.055, 12, { x, y }, { material: 'frameDark' }),
        ),
        cylinder(0.205, 0.205, 0.06, 12, { x, y: 0.97 }, { material: 'frameDark' }),
      ]),
      sphere(0.19, 10, 6, { y: 1.0 }, { material: 'shellDark' }),
      // Elbows rather than a straight bar: the accumulator has to look plumbed in.
      ...[-1, 1].flatMap((side) => [
        cylinder(0.05, 0.05, 0.2, 8, { x: side * 0.26, y: 1.0 }, { material: 'copper' }),
        cylinder(
          0.05,
          0.05,
          0.2,
          8,
          { x: side * 0.17, y: 1.08, rz: Math.PI / 2 },
          { material: 'copper' },
        ),
      ]),
      box([0.17, 0.22, 0.02], { x: 0.21, y: 0.56, z: 0.2 }, { material: '#2FC7BC', glow: 0.7 }),
      box([0.15, 0.17, 0.02], { x: -0.21, y: 0.52, z: 0.2 }, { material: 'frame' }),
      box([0.1, 0.1, 0.02], { x: 0.21, y: 0.26, z: 0.2 }, { material: 'hazard', glow: 0.3 }),
    ]),

  /**
   * A glazed barrel vault between two pressurised end modules. The only horizontal
   * cylinder, and the only building with anything green inside it.
   */
  greenhouse: () =>
    assemble([
      box([1.36, 0.1, 0.88], { y: 0.05 }, { material: 'frameDark' }),
      box([1.26, 0.05, 0.8], { y: 0.12 }, { material: 'frame' }),
      ...[-0.2, 0.2].map((z) => box([1.0, 0.12, 0.24], { y: 0.2, z }, { material: 'soil' })),
      ...[-0.2, 0.2].flatMap((z) =>
        [-0.32, -0.11, 0.11, 0.32].map((x) =>
          box([0.15, 0.15, 0.15], { x, y: 0.31, z }, { material: 'plant' }),
        ),
      ),
      cylinder(
        0.44,
        0.44,
        1.02,
        12,
        { y: 0.3, rz: Math.PI / 2 },
        { material: '#8FC9DC', glow: 0.2 },
      ),
      ...[-0.34, 0, 0.34].map((x) =>
        cylinder(0.452, 0.452, 0.06, 12, { x, y: 0.3, rz: Math.PI / 2 }, { material: 'frameDark' }),
      ),
      // Grow-light strips down the flanks. The vault's glass is opaque geometry, so the
      // interior can only be shown from outside — and the magenta band is what tells the
      // player something is being cultivated in there.
      ...[-0.17, 0.17].flatMap((x) =>
        [-1, 1].map((side) =>
          box(
            [0.3, 0.07, 0.015],
            { x, y: 0.36, z: side * 0.44 },
            { material: '#9C63C0', glow: 0.45 },
          ),
        ),
      ),
      // End modules: pressurised boxes with capped roofs, not slabs.
      ...[-1, 1].flatMap((side) => [
        box([0.22, 0.68, 0.86], { x: side * 0.62, y: 0.4 }, { material: 'shell' }),
        box([0.25, 0.05, 0.9], { x: side * 0.62, y: 0.765 }, { material: 'frameDark' }),
      ]),
      box([0.02, 0.36, 0.24], { x: -0.735, y: 0.34, z: 0.16 }, { material: 'frameDark' }),
      box([0.02, 0.09, 0.2], { x: -0.735, y: 0.6, z: -0.16 }, { material: '#6FC6DE', glow: 0.8 }),
    ]),

  /**
   * A pit head ringed with spoil, and a trussed conveyor climbing to a chute.
   */
  mine: () =>
    assemble([
      cylinder(0.52, 0.56, 0.12, 8, { y: 0.06 }, { material: 'frameDark' }),
      // The excavation reads as a hole because its floor sits below the deck and rubble
      // is heaped around the mouth — a real bored hole would cost a CSG operation.
      cylinder(0.33, 0.24, 0.14, 10, { y: 0.03 }, { material: '#191310' }),
      ...SPOIL_ANGLES.map((angle) =>
        box(
          [0.09, 0.05, 0.07],
          { x: Math.cos(angle) * 0.35, y: 0.13, z: Math.sin(angle) * 0.35, ry: -angle },
          { material: 'ore' },
        ),
      ),
      box([0.4, 0.4, 0.4], { x: -0.36, y: 0.34 }, { material: 'shellDark' }),
      box([0.44, 0.06, 0.44], { x: -0.36, y: 0.57 }, { material: 'frameDark' }),
      box([0.13, 0.14, 0.02], { x: -0.36, y: 0.37, z: 0.21 }, { material: '#F0B94A', glow: 1 }),
      // Conveyor: belt, side rails, cross-ties, and a tapered leg on a foot.
      box([0.96, 0.09, 0.32], { x: 0.12, y: 0.46, rz: CONVEYOR_TILT }, { material: 'rubber' }),
      ...[-0.17, 0.17].map((z) =>
        box([0.96, 0.06, 0.05], { x: 0.12, y: 0.46, z, rz: CONVEYOR_TILT }, { material: 'frame' }),
      ),
      ...[-0.28, 0, 0.28].map((along) =>
        box(
          [0.04, 0.12, 0.34],
          {
            x: 0.12 + Math.cos(CONVEYOR_TILT) * along,
            y: 0.46 + Math.sin(CONVEYOR_TILT) * along,
            rz: CONVEYOR_TILT,
          },
          { material: 'frame' },
        ),
      ),
      cylinder(0.05, 0.09, 0.4, 8, { x: 0.3, y: 0.25 }, { material: 'frame' }),
      cylinder(0.13, 0.16, 0.07, 8, { x: 0.3, y: 0.09 }, { material: 'frameDark' }),
      box([0.26, 0.3, 0.34], { x: 0.55, y: 0.76 }, { material: 'rust' }),
      box([0.3, 0.05, 0.38], { x: 0.55, y: 0.925 }, { material: 'frameDark' }),
      box([0.3, 0.04, 0.38], { x: 0.55, y: 0.59 }, { material: 'frameDark' }),
    ]),

  /**
   * Three banded tanks on a pallet beside a control cabinet. Obviously containers,
   * obviously not machinery — the one building that must not look like it does anything.
   */
  storageDepot: () =>
    assemble([
      box([0.98, 0.08, 0.98], { y: 0.04 }, { material: 'frameDark' }),
      box([0.88, 0.05, 0.88], { y: 0.1 }, { material: 'frame' }),
      ...DRUM_POSITIONS.flatMap(([x, z]) => [
        cylinder(0.24, 0.24, 0.58, 10, { x, y: 0.41, z }, { material: 'shell' }),
        // Skirt, mid band and lid rim: welded courses are what separate a storage tank
        // from a plain can.
        cylinder(0.26, 0.26, 0.07, 10, { x, y: 0.16, z }, { material: 'frameDark' }),
        cylinder(0.248, 0.248, 0.1, 10, { x, y: 0.46, z }, { material: 'frameDark' }),
        cylinder(0.25, 0.25, 0.05, 10, { x, y: 0.7, z }, { material: 'frame' }),
      ]),
      box([0.36, 0.32, 0.32], { x: 0.02, y: 0.26, z: -0.44 }, { material: 'rust' }),
      box([0.39, 0.04, 0.35], { x: 0.02, y: 0.44, z: -0.44 }, { material: 'frameDark' }),
      box([0.2, 0.12, 0.02], { x: 0.02, y: 0.28, z: -0.61 }, { material: '#F0B94A', glow: 0.9 }),
      cylinder(0.01, 0.01, 0.14, 6, { x: 0.16, y: 0.52, z: -0.44 }, { material: 'frame' }),
    ]),

  /**
   * A hex deck around a lit apron, with approach lights. The one flat silhouette on the
   * map — it has to read as ground rather than machinery, because the thing worth looking
   * at is the rocket that lands on it. The deck is hexagonal so it sits inside its tile
   * instead of overhanging the flats.
   */
  rocketPad: () =>
    assemble([
      cylinder(0.62, 0.66, 0.1, 6, { y: 0.05, ry: Math.PI / 6 }, { material: 'frameDark' }),
      cylinder(0.58, 0.6, 0.04, 6, { y: 0.12, ry: Math.PI / 6 }, { material: 'frame' }),
      cylinder(0.44, 0.44, 0.018, 16, { y: 0.148 }, { material: '#E09A34', glow: 0.45 }),
      cylinder(0.37, 0.37, 0.022, 12, { y: 0.15 }, { material: '#2C2724' }),
      cylinder(0.2, 0.2, 0.024, 12, { y: 0.152 }, { material: 'frameDark' }),
      ...PAD_LIGHT_POSITIONS.flatMap(([x, z]) => [
        box([0.09, 0.07, 0.09], { x, y: 0.17, z }, { material: 'frameDark' }),
        box([0.05, 0.16, 0.05], { x, y: 0.28, z }, { material: '#F0B94A', glow: 0.9 }),
      ]),
      ...[-1, 1].flatMap((side) =>
        [-1, 1].map((other) =>
          box(
            [0.12, 0.02, 0.08],
            { x: side * 0.42, y: 0.145, z: other * 0.2 },
            { material: 'frameDark' },
          ),
        ),
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

let solarBaseCache: THREE.BufferGeometry | null = null;
let solarHeadCache: THREE.BufferGeometry | null = null;

/**
 * The half of a solar array that stays put.
 *
 * The scene tracks the sun by yawing the array, and a pedestal that swings with the panel
 * reads as a bug — so the two halves are drawn as separate instanced meshes and only the
 * head is given the yaw.
 */
export function solarArrayBase(): THREE.BufferGeometry {
  solarBaseCache ??= assemble(solarArrayBaseParts());
  return solarBaseCache;
}

/** The half of a solar array that turns. Its pivot is the mast axis, at the local origin. */
export function solarArrayHead(): THREE.BufferGeometry {
  solarHeadCache ??= assemble(solarArrayHeadParts());
  return solarHeadCache;
}
