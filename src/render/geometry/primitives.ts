/**
 * Composition helpers for procedural building geometry.
 *
 * Every building is a merged set of coloured primitives. Colour travels in the vertex
 * colour attribute so one instanced draw call per type can still produce a multi-material
 * look, and a separate emissive attribute marks the parts that glow after dark.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const scratchColor = new THREE.Color();

/** Named after what the part *is*, so the builders read as descriptions of a building. */
export const MATERIALS = {
  shell: '#D8D4CC',
  shellDark: '#9BA0A6',
  frame: '#6E7378',
  frameDark: '#4A4E54',
  // Solar cells need to read as blue at a glance; anything darker turns the array into a
  // black rectangle against dark terrain.
  panelGlass: '#3A6EAE',
  panelCell: '#6FA6DC',
  glass: '#9FD8E8',
  soil: '#4A3324',
  plant: '#5FA845',
  rubber: '#33383D',
  copper: '#B87548',
  hazard: '#D8A13C',
} as const;

export type MaterialKey = keyof typeof MATERIALS;

export type Placement = {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
  readonly scale?: number;
};

/**
 * Writes a flat colour plus an emissive mask into a geometry.
 *
 * The mask rides in a second attribute rather than a second material because instanced
 * meshes get one material; the building shader multiplies it by a night factor so windows
 * and status lights come on by themselves.
 */
function paint(
  geometry: THREE.BufferGeometry,
  color: string,
  emissive: number,
): THREE.BufferGeometry {
  scratchColor.set(color);
  const count = geometry.attributes.position?.count ?? 0;
  const colors = new Float32Array(count * 3);
  const glow = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    colors[i * 3] = scratchColor.r;
    colors[i * 3 + 1] = scratchColor.g;
    colors[i * 3 + 2] = scratchColor.b;
    glow[i] = emissive;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  return geometry;
}

function place(geometry: THREE.BufferGeometry, at: Placement): THREE.BufferGeometry {
  if (at.scale !== undefined) geometry.scale(at.scale, at.scale, at.scale);
  if (at.rx) geometry.rotateX(at.rx);
  if (at.ry) geometry.rotateY(at.ry);
  if (at.rz) geometry.rotateZ(at.rz);
  geometry.translate(at.x ?? 0, at.y ?? 0, at.z ?? 0);
  return geometry;
}

type PartOptions = {
  readonly material: MaterialKey | string;
  /** 0 = never glows, 1 = fully lit at night. */
  readonly glow?: number;
};

function resolve(material: MaterialKey | string): string {
  return material in MATERIALS ? MATERIALS[material as MaterialKey] : material;
}

export function box(
  size: readonly [number, number, number],
  at: Placement,
  options: PartOptions,
): THREE.BufferGeometry {
  return paint(
    place(new THREE.BoxGeometry(size[0], size[1], size[2]), at),
    resolve(options.material),
    options.glow ?? 0,
  );
}

export function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  at: Placement,
  options: PartOptions,
): THREE.BufferGeometry {
  return paint(
    place(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), at),
    resolve(options.material),
    options.glow ?? 0,
  );
}

export function sphere(radius: number, at: Placement, options: PartOptions): THREE.BufferGeometry {
  return paint(
    place(new THREE.SphereGeometry(radius, 14, 10), at),
    resolve(options.material),
    options.glow ?? 0,
  );
}

/** Half a sphere, flat face down — the base shape of every pressurised structure here. */
export function dome(radius: number, at: Placement, options: PartOptions): THREE.BufferGeometry {
  return paint(
    place(new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), at),
    resolve(options.material),
    options.glow ?? 0,
  );
}

/**
 * A geodesic shell: an icosphere with each face inset, leaving visible strut gaps.
 *
 * This is the single most recognisable Mars-habitat silhouette, and it cannot be faked
 * with a smooth dome — the panel facets are the whole point.
 */
export function geodesicDome(
  radius: number,
  detail: number,
  inset: number,
  at: Placement,
  options: PartOptions,
): THREE.BufferGeometry {
  const source = new THREE.IcosahedronGeometry(radius, detail);
  const position = source.getAttribute('position');
  const kept: number[] = [];

  // Keep only the upper hemisphere, and shrink each triangle toward its own centroid so
  // the gaps between panels read as structural framing.
  for (let i = 0; i < position.count; i += 3) {
    const ax = position.getX(i);
    const ay = position.getY(i);
    const az = position.getZ(i);
    const bx = position.getX(i + 1);
    const by = position.getY(i + 1);
    const bz = position.getZ(i + 1);
    const cx = position.getX(i + 2);
    const cy = position.getY(i + 2);
    const cz = position.getZ(i + 2);

    const centroidY = (ay + by + cy) / 3;
    if (centroidY < -radius * 0.08) continue;

    const centroidX = (ax + bx + cx) / 3;
    const centroidZ = (az + bz + cz) / 3;
    const shrink = 1 - inset;

    for (const [vx, vy, vz] of [
      [ax, ay, az],
      [bx, by, bz],
      [cx, cy, cz],
    ] as const) {
      kept.push(
        centroidX + (vx - centroidX) * shrink,
        centroidY + (vy - centroidY) * shrink,
        centroidZ + (vz - centroidZ) * shrink,
      );
    }
  }

  source.dispose();

  const panels = new THREE.BufferGeometry();
  panels.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
  panels.computeVertexNormals();

  return paint(place(panels, at), resolve(options.material), options.glow ?? 0);
}

/**
 * A rectangular solar panel divided into cells by inset gaps.
 *
 * Drawn as a grid of small quads on a frame rather than one textured plane, so the cells
 * survive any zoom and need no texture.
 */
export function solarPanel(
  width: number,
  depth: number,
  columns: number,
  rows: number,
  at: Placement,
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [
    box([width, 0.035, depth], {}, { material: 'panelGlass' }),
  ];

  const gap = 0.018;
  const cellWidth = (width - gap * (columns + 1)) / columns;
  const cellDepth = (depth - gap * (rows + 1)) / rows;

  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      parts.push(
        box(
          [cellWidth, 0.012, cellDepth],
          {
            x: -width / 2 + gap * (column + 1) + cellWidth * (column + 0.5),
            y: 0.024,
            z: -depth / 2 + gap * (row + 1) + cellDepth * (row + 0.5),
          },
          { material: 'panelCell' },
        ),
      );
    }
  }

  return parts.map((part) => place(part, at));
}

/**
 * Merges parts, dropping the index so each face keeps its own flat-shaded normal.
 *
 * UVs are stripped first. `mergeGeometries` requires every input to carry an identical set
 * of attributes, and the hand-built geodesic shell has no UVs — nothing here is textured,
 * so deleting them is both the fix and a smaller vertex buffer.
 */
export function assemble(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = parts.map((part) => {
    const flat = part.index ? part.toNonIndexed() : part;
    flat.deleteAttribute('uv');
    return flat;
  });

  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('Failed to merge building geometry parts');
  merged.computeVertexNormals();
  return merged;
}
