import { describe, expect, it } from 'vitest';
import { axialKey, hexFieldSize } from './hex.ts';
import { fbm2d, DEFAULT_FBM, valueNoise2d } from './noise.ts';
import { hash2d, nextIndex, nextRandom, nextRange } from './rng.ts';
import { findTile, generateTerrain, GRID_RADIUS } from './terrain.ts';

const SEEDS = [1, 42, 1337, 99999, -7];

describe('rng', () => {
  it('draws inside [0, 1)', () => {
    let state = 12345;
    for (let i = 0; i < 1000; i++) {
      const draw = nextRandom(state);
      expect(draw.value).toBeGreaterThanOrEqual(0);
      expect(draw.value).toBeLessThan(1);
      state = draw.state;
    }
  });

  it('is reproducible from a given state', () => {
    const sequence = (seed: number, count: number): number[] => {
      const values: number[] = [];
      let state = seed;
      for (let i = 0; i < count; i++) {
        const draw = nextRandom(state);
        values.push(draw.value);
        state = draw.state;
      }
      return values;
    };
    expect(sequence(7, 20)).toEqual(sequence(7, 20));
    expect(sequence(7, 20)).not.toEqual(sequence(8, 20));
  });

  it('advances state on every draw', () => {
    const first = nextRandom(3);
    const second = nextRandom(first.state);
    expect(second.state).not.toBe(first.state);
    expect(second.value).not.toBe(first.value);
  });

  it('produces a roughly uniform mean over many draws', () => {
    let state = 555;
    let total = 0;
    const samples = 20000;
    for (let i = 0; i < samples; i++) {
      const draw = nextRandom(state);
      total += draw.value;
      state = draw.state;
    }
    expect(total / samples).toBeCloseTo(0.5, 1);
  });

  it('maps ranges and indices into bounds', () => {
    let state = 99;
    for (let i = 0; i < 500; i++) {
      const ranged = nextRange(state, -5, 5);
      expect(ranged.value).toBeGreaterThanOrEqual(-5);
      expect(ranged.value).toBeLessThan(5);
      const index = nextIndex(ranged.state, 7);
      expect(Number.isInteger(index.value)).toBe(true);
      expect(index.value).toBeGreaterThanOrEqual(0);
      expect(index.value).toBeLessThan(7);
      state = index.state;
    }
  });

  it('returns -1 for an index draw over an empty set', () => {
    expect(nextIndex(1, 0).value).toBe(-1);
  });

  it('hashes coordinates stably and distinctly', () => {
    expect(hash2d(3, 4, 1)).toBe(hash2d(3, 4, 1));
    expect(hash2d(3, 4, 1)).not.toBe(hash2d(4, 3, 1));
    expect(hash2d(3, 4, 1)).not.toBe(hash2d(3, 4, 2));
  });
});

describe('noise', () => {
  it('stays within [0, 1)', () => {
    for (let i = 0; i < 2000; i++) {
      const x = (i % 50) * 0.37;
      const y = Math.floor(i / 50) * 0.29;
      expect(valueNoise2d(x, y, 5)).toBeGreaterThanOrEqual(0);
      expect(valueNoise2d(x, y, 5)).toBeLessThan(1);
      expect(fbm2d(x, y, 5, DEFAULT_FBM)).toBeGreaterThanOrEqual(0);
      expect(fbm2d(x, y, 5, DEFAULT_FBM)).toBeLessThan(1);
    }
  });

  it('is continuous: nearby samples stay close', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.13;
      const delta = Math.abs(valueNoise2d(x, 1, 9) - valueNoise2d(x + 0.01, 1, 9));
      expect(delta).toBeLessThan(0.1);
    }
  });

  it('varies across the field rather than returning a constant', () => {
    const samples = new Set<number>();
    for (let i = 0; i < 100; i++) samples.add(fbm2d(i * 1.7, i * 0.9, 3, DEFAULT_FBM));
    expect(samples.size).toBeGreaterThan(50);
  });
});

describe('generateTerrain', () => {
  it('produces one tile per hex in the field', () => {
    const field = generateTerrain(42);
    expect(field.tiles).toHaveLength(hexFieldSize(GRID_RADIUS));
    expect(Object.keys(field.indexByKey)).toHaveLength(hexFieldSize(GRID_RADIUS));
  });

  it('is deterministic in the seed', () => {
    expect(generateTerrain(42)).toEqual(generateTerrain(42));
  });

  it('produces different worlds for different seeds', () => {
    const a = generateTerrain(1).tiles.map((tile) => tile.elevation);
    const b = generateTerrain(2).tiles.map((tile) => tile.elevation);
    expect(a).not.toEqual(b);
  });

  it('indexes every tile at its own coordinates', () => {
    const field = generateTerrain(7);
    field.tiles.forEach((tile, index) => {
      expect(field.indexByKey[axialKey(tile.q, tile.r)]).toBe(index);
    });
  });

  it('guarantees enough deposits of both kinds on every seed', () => {
    for (const seed of SEEDS) {
      const field = generateTerrain(seed);
      const ice = field.tiles.filter((tile) => tile.deposit === 'ice');
      const ore = field.tiles.filter((tile) => tile.deposit === 'ore');
      expect(ice.length).toBeGreaterThanOrEqual(4);
      expect(ore.length).toBeGreaterThanOrEqual(4);
    }
  });

  /**
   * The "New colony" button hands in an arbitrary seed, so the guarantee has to hold for
   * all of them, not for a hand-picked few. A seed that cannot host the starting colony
   * crashes the app on a button press.
   */
  it('produces a playable field for a wide sweep of seeds', () => {
    for (let seed = -300; seed <= 300; seed += 7) {
      const field = generateTerrain(seed);
      const ice = field.tiles.filter((tile) => tile.deposit === 'ice' && tile.buildable);
      const ore = field.tiles.filter((tile) => tile.deposit === 'ore' && tile.buildable);
      const free = field.tiles.filter((tile) => tile.buildable && tile.deposit === 'none');
      expect(ice.length, `seed ${seed} has too little ice`).toBeGreaterThanOrEqual(4);
      expect(ore.length, `seed ${seed} has too little ore`).toBeGreaterThanOrEqual(4);
      // The starting colony needs eleven plain tiles before the player places anything.
      expect(free.length, `seed ${seed} has too few open tiles`).toBeGreaterThanOrEqual(20);
    }
  });

  it('only places deposits on buildable tiles', () => {
    for (const seed of SEEDS) {
      for (const tile of generateTerrain(seed).tiles) {
        if (tile.deposit !== 'none') expect(tile.buildable).toBe(true);
      }
    }
  });

  it('keeps elevation normalised and leaves tiles unoccupied', () => {
    for (const tile of generateTerrain(3).tiles) {
      expect(tile.elevation).toBeGreaterThanOrEqual(0);
      expect(tile.elevation).toBeLessThan(1);
      expect(tile.buildingId).toBeNull();
    }
  });

  it('leaves most of the field buildable so the colony has room', () => {
    for (const seed of SEEDS) {
      const field = generateTerrain(seed);
      const buildable = field.tiles.filter((tile) => tile.buildable).length;
      expect(buildable / field.tiles.length).toBeGreaterThan(0.5);
    }
  });

  it('honours a custom radius', () => {
    expect(generateTerrain(1, 2).tiles).toHaveLength(19);
  });

  it('looks tiles up by coordinate and reports misses as null', () => {
    const field = generateTerrain(11);
    const tile = findTile(field, 0, 0);
    expect(tile).not.toBeNull();
    expect(tile?.q).toBe(0);
    expect(findTile(field, GRID_RADIUS + 5, 0)).toBeNull();
  });
});
