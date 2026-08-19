/**
 * Flat-top hexagonal grid in axial coordinates.
 *
 * Axial `(q, r)` carries an implied third cube coordinate `s = -q - r`, which is what
 * makes distance a one-liner while keeping storage and serialization to two integers.
 * See docs/SPEC-03-world.md.
 */

const SQRT3 = Math.sqrt(3);

export type Axial = {
  readonly q: number;
  readonly r: number;
};

/** Canonical `"q,r"` string, used as the key of the tile index map. */
export type AxialKey = string;

/**
 * The six neighbour offsets in fixed clockwise order starting from east.
 * The order is part of the contract: slope calculation and flow-line pairing both
 * rely on neighbour indices being stable.
 */
export const NEIGHBOR_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
] as const;

export function axialKey(q: number, r: number): AxialKey {
  return `${q},${r}`;
}

export function parseAxialKey(key: AxialKey): Axial {
  const comma = key.indexOf(',');
  if (comma < 0) {
    throw new Error(`Malformed axial key: "${key}"`);
  }
  const q = Number(key.slice(0, comma));
  const r = Number(key.slice(comma + 1));
  if (!Number.isFinite(q) || !Number.isFinite(r)) {
    throw new Error(`Malformed axial key: "${key}"`);
  }
  return { q, r };
}

export function neighborsOf(hex: Axial): Axial[] {
  return NEIGHBOR_DIRECTIONS.map((direction) => ({
    q: hex.q + direction.q,
    r: hex.r + direction.r,
  }));
}

/** Number of steps between two tiles, derived through cube coordinates. */
export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

/**
 * World-space centre of a tile on the XZ plane.
 * Flat-top layout: columns advance by 1.5×size in x, rows by √3×size in z with a
 * half-row stagger per column.
 */
export function hexToWorld(hex: Axial, size: number): { x: number; z: number } {
  return {
    x: size * 1.5 * hex.q,
    z: size * SQRT3 * (hex.r + hex.q / 2),
  };
}

/** Every tile within `radius` steps of the origin, ordered by q then r. */
export function hexField(radius: number): Axial[] {
  if (!Number.isInteger(radius) || radius < 0) {
    throw new Error(`Hex field radius must be a non-negative integer, received ${radius}`);
  }
  const tiles: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      tiles.push({ q, r });
    }
  }
  return tiles;
}

/** Tile count of a hex field of the given radius: 3R(R+1)+1. */
export function hexFieldSize(radius: number): number {
  return 3 * radius * (radius + 1) + 1;
}
