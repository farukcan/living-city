import { describe, expect, it } from 'vitest';
import {
  axialKey,
  hexDistance,
  hexField,
  hexFieldSize,
  hexToWorld,
  neighborsOf,
  parseAxialKey,
} from './hex.ts';
import { GRID_RADIUS } from './terrain.ts';

describe('axial keys', () => {
  it('round-trips through parse, including negatives', () => {
    for (const hex of [
      { q: 0, r: 0 },
      { q: -3, r: 7 },
      { q: 12, r: -12 },
    ]) {
      expect(parseAxialKey(axialKey(hex.q, hex.r))).toEqual(hex);
    }
  });

  it('rejects malformed keys instead of returning NaN coordinates', () => {
    expect(() => parseAxialKey('4')).toThrow();
    expect(() => parseAxialKey('a,b')).toThrow();
  });
});

describe('hexField', () => {
  it('produces 3R(R+1)+1 tiles', () => {
    for (const radius of [0, 1, 2, GRID_RADIUS]) {
      expect(hexField(radius)).toHaveLength(hexFieldSize(radius));
    }
  });

  it('produces 331 tiles at the game radius', () => {
    expect(hexField(GRID_RADIUS)).toHaveLength(331);
    expect(hexFieldSize(GRID_RADIUS)).toBe(331);
  });

  it('contains no duplicates', () => {
    const tiles = hexField(GRID_RADIUS);
    const keys = new Set(tiles.map((tile) => axialKey(tile.q, tile.r)));
    expect(keys.size).toBe(tiles.length);
  });

  it('keeps every tile within the radius', () => {
    for (const tile of hexField(5)) {
      expect(hexDistance(tile, { q: 0, r: 0 })).toBeLessThanOrEqual(5);
    }
  });

  it('rejects a non-integer or negative radius', () => {
    expect(() => hexField(-1)).toThrow();
    expect(() => hexField(2.5)).toThrow();
  });
});

describe('neighborsOf', () => {
  it('returns six tiles, each exactly one step away', () => {
    const origin = { q: 3, r: -2 };
    const neighbors = neighborsOf(origin);
    expect(neighbors).toHaveLength(6);
    for (const neighbor of neighbors) {
      expect(hexDistance(origin, neighbor)).toBe(1);
    }
  });

  it('is symmetric: each neighbour has the origin as a neighbour', () => {
    const origin = { q: 1, r: 1 };
    for (const neighbor of neighborsOf(origin)) {
      const back = neighborsOf(neighbor).map((hex) => axialKey(hex.q, hex.r));
      expect(back).toContain(axialKey(origin.q, origin.r));
    }
  });
});

describe('hexDistance', () => {
  it('is zero to itself and symmetric', () => {
    const a = { q: 2, r: -5 };
    const b = { q: -3, r: 4 };
    expect(hexDistance(a, a)).toBe(0);
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });

  it('counts straight-line steps', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 4, r: 0 })).toBe(4);
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: -3 })).toBe(3);
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: -2 })).toBe(2);
  });
});

describe('hexToWorld', () => {
  it('places the origin at the world origin', () => {
    expect(hexToWorld({ q: 0, r: 0 }, 1)).toEqual({ x: 0, z: 0 });
  });

  it('spaces neighbours one hex apart for flat-top layout', () => {
    const size = 1;
    const origin = hexToWorld({ q: 0, r: 0 }, size);
    for (const neighbor of neighborsOf({ q: 0, r: 0 })) {
      const world = hexToWorld(neighbor, size);
      const distance = Math.hypot(world.x - origin.x, world.z - origin.z);
      expect(distance).toBeCloseTo(Math.sqrt(3) * size, 6);
    }
  });

  it('scales linearly with hex size', () => {
    const single = hexToWorld({ q: 3, r: -1 }, 1);
    const double = hexToWorld({ q: 3, r: -1 }, 2);
    expect(double.x).toBeCloseTo(single.x * 2, 6);
    expect(double.z).toBeCloseTo(single.z * 2, 6);
  });
});
