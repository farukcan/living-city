#!/usr/bin/env node
/**
 * Procedural logo generator for Living Mars Machine.
 *
 * The mark is drawn, not authored: a hex mosaic — the same axial grid the colony is placed
 * on — is clipped to a Mars disk, tinted by a hash-based height field, lit from the upper
 * left and cut by a terminator, with a handful of cells promoted to lit colony pads. Every
 * value derives from the seed, so a seed always yields the same file.
 *
 * Two layouts share that geometry: MARK_LAYOUT for the full logo, and ICON_LAYOUT for the
 * favicon — fewer, larger cells and no orbit, because at 16px detail becomes mud.
 *
 * Usage:
 *   node media/generate-logo.mjs [--seed 7] [--size 512]
 *
 * Writes media/logo.svg, logo.png, logo-wordmark.svg, logo-wordmark.png, logo-lockup.svg
 * (the wordmark without its tagline or plate, for small UI headers) and favicon.svg.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Mirrors src/render/palette.ts — the logo has to read as the same product. */
const PALETTE = {
  terrainLow: '#8C4A32',
  terrainHigh: '#C98F63',
  buildingShell: '#D6D3CD',
  accent: '#4FC3F7',
  nightEmissive: '#FFD08A',
  skyNight: '#1A1626',
};

const VIEW = 256;
const CENTER = VIEW / 2;
/** Sits under the mosaic so the gaps between cells read as seams, not holes. */
const SUBSTRATE = '#2E1A12';

/** The full logo: a small planet inside its orbit, with room for fine detail. */
const MARK_LAYOUT = {
  diskRadius: 88,
  hexSize: 15,
  hexRing: 4,
  /** Cells above this noise value become lit colony pads. */
  colonyThreshold: 0.88,
  nightLightRadius: 2.6,
  glow: 3,
  rimWidth: 1.5,
};

/** The favicon: the planet fills the tile, and only a few cells survive downscaling. */
const ICON_LAYOUT = {
  diskRadius: 118,
  hexSize: 34,
  hexRing: 2,
  colonyThreshold: 0.72,
  nightLightRadius: 6,
  glow: 5,
  rimWidth: 3,
};

const ORBIT_RADIUS = 112;

/**
 * Deterministic value noise for one axial cell. Pure: no shared RNG state, so a cell's
 * value never depends on the order cells are visited.
 */
const cellNoise = (q, r, seed) => {
  let h = Math.imul(q, 374761393) ^ Math.imul(r, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const parseHex = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

const toHex = (channel) =>
  Math.round(clamp01(channel / 255) * 255)
    .toString(16)
    .padStart(2, '0');

const mixColor = (fromHex, toHexColor, t) => {
  const from = parseHex(fromHex);
  const to = parseHex(toHexColor);
  const k = clamp01(t);
  return `#${toHex(from.r + (to.r - from.r) * k)}${toHex(from.g + (to.g - from.g) * k)}${toHex(
    from.b + (to.b - from.b) * k,
  )}`;
};

const round = (value) => Math.round(value * 1000) / 1000;

/** Axial coordinates of every cell within `ring` steps of the origin. */
const axialCells = (ring) => {
  const cells = [];
  for (let q = -ring; q <= ring; q += 1) {
    const rMin = Math.max(-ring, -q - ring);
    const rMax = Math.min(ring, -q + ring);
    for (let r = rMin; r <= rMax; r += 1) cells.push({ q, r });
  }
  return cells;
};

/** Pointy-top axial layout, matching the orientation of the terrain grid in the app. */
const axialToPixel = (q, r, size) => ({
  x: CENTER + size * Math.sqrt(3) * (q + r / 2),
  y: CENTER + size * 1.5 * r,
});

const hexPoints = (cx, cy, size) =>
  Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${round(cx + size * Math.cos(angle))},${round(cy + size * Math.sin(angle))}`;
  }).join(' ');

/**
 * How lit a point is, from a light sitting off the upper-left of the disk. Drives both the
 * surface tint and how brightly a colony pad reads.
 */
const lightFactor = (x, y, layout) => {
  const lx = CENTER - layout.diskRadius * 0.55;
  const ly = CENTER - layout.diskRadius * 0.6;
  const distance = Math.hypot(x - lx, y - ly);
  return clamp01(1 - distance / (layout.diskRadius * 2.1));
};

const surfaceCell = (cell, seed, layout) => {
  const { x, y } = axialToPixel(cell.q, cell.r, layout.hexSize);
  const noise = cellNoise(cell.q, cell.r, seed);
  const height = clamp01(0.3 * noise + 0.7 * lightFactor(x, y, layout));
  return {
    x,
    y,
    noise,
    fill: mixColor(PALETTE.terrainLow, PALETTE.terrainHigh, height),
    isColony: noise > layout.colonyThreshold,
  };
};

/** Every cell of the layout's grid, resolved and culled to what the disk can show. */
const surfaceCells = (seed, layout) =>
  axialCells(layout.hexRing)
    .map((cell) => surfaceCell(cell, seed, layout))
    .filter(
      (cell) =>
        Math.hypot(cell.x - CENTER, cell.y - CENTER) < layout.diskRadius + layout.hexSize * 0.9,
    );

const renderMosaic = (seed, layout) =>
  surfaceCells(seed, layout)
    .map((cell) => {
      const face = `<polygon points="${hexPoints(cell.x, cell.y, layout.hexSize * 0.96)}" fill="${
        cell.fill
      }"/>`;
      if (!cell.isColony) return face;
      const pad = `<polygon points="${hexPoints(cell.x, cell.y, layout.hexSize * 0.62)}" fill="${
        PALETTE.accent
      }" opacity="${round(
        0.55 + 0.4 * lightFactor(cell.x, cell.y, layout),
      )}" filter="url(#glow)"/>`;
      const core = `<circle cx="${round(cell.x)}" cy="${round(cell.y)}" r="${round(
        layout.hexSize * 0.22,
      )}" fill="${PALETTE.buildingShell}"/>`;
      return `${face}${pad}${core}`;
    })
    .join('');

/** Night-side lights: colony cells that fall on the dark half still burn. */
const renderNightLights = (seed, layout) =>
  surfaceCells(seed, layout)
    .filter(
      (cell) =>
        cell.isColony &&
        cell.x > CENTER + layout.diskRadius * 0.15 &&
        Math.hypot(cell.x - CENTER, cell.y - CENTER) < layout.diskRadius,
    )
    .map(
      (cell) =>
        `<circle cx="${round(cell.x)}" cy="${round(cell.y)}" r="${layout.nightLightRadius}" fill="${
          PALETTE.nightEmissive
        }" filter="url(#glow)"/>`,
    )
    .join('');

/** The terminator: the disk's right limb closed by an ellipse arc, phase driven by seed. */
const renderNightSide = (seed, layout) => {
  const phase = 0.28 + 0.24 * cellNoise(101, 7, seed);
  const r = layout.diskRadius;
  const rx = round(r * phase);
  const top = round(CENTER - r);
  const bottom = round(CENTER + r);
  const path = `M ${CENTER} ${top} A ${r} ${r} 0 0 1 ${CENTER} ${bottom} A ${rx} ${r} 0 0 0 ${CENTER} ${top} Z`;
  return `<path d="${path}" fill="${PALETTE.skyNight}" opacity="0.62"/>`;
};

/** A dashed orbit with one satellite, parked at a seed-derived angle. */
const renderOrbit = (seed) => {
  const angle = 360 * cellNoise(19, 23, seed);
  // The satellite rides the leading end of the dash, so the arc reads as its trail.
  const satellite = ((angle + 26.6) * Math.PI) / 180;
  const sx = round(CENTER + ORBIT_RADIUS * Math.cos(satellite));
  const sy = round(CENTER + ORBIT_RADIUS * Math.sin(satellite));
  return [
    `<circle cx="${CENTER}" cy="${CENTER}" r="${ORBIT_RADIUS}" fill="none" stroke="${PALETTE.buildingShell}" stroke-opacity="0.28" stroke-width="2"/>`,
    `<circle cx="${CENTER}" cy="${CENTER}" r="${ORBIT_RADIUS}" fill="none" stroke="${PALETTE.accent}" stroke-width="3" stroke-linecap="round" stroke-dasharray="52 652" transform="rotate(${round(
      angle,
    )} ${CENTER} ${CENTER})"/>`,
    `<circle cx="${sx}" cy="${sy}" r="5" fill="${PALETTE.accent}" filter="url(#glow)"/>`,
  ].join('');
};

const defs = (layout) => `<defs>
    <clipPath id="disk"><circle cx="${CENTER}" cy="${CENTER}" r="${layout.diskRadius}"/></clipPath>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="${layout.glow}" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="rim" cx="35%" cy="30%" r="78%">
      <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.45"/>
    </radialGradient>
  </defs>`;

/** The planet itself: mosaic, night side, lights, limb shading and rim. */
const diskGroup = (seed, layout) => `<g>
    <g clip-path="url(#disk)">
      <circle cx="${CENTER}" cy="${CENTER}" r="${layout.diskRadius}" fill="${SUBSTRATE}"/>
      ${renderMosaic(seed, layout)}
      ${renderNightSide(seed, layout)}
      ${renderNightLights(seed, layout)}
      <circle cx="${CENTER}" cy="${CENTER}" r="${layout.diskRadius}" fill="url(#rim)"/>
    </g>
    <circle cx="${CENTER}" cy="${CENTER}" r="${layout.diskRadius}" fill="none" stroke="${PALETTE.buildingShell}" stroke-opacity="0.4" stroke-width="${layout.rimWidth}"/>
  </g>`;

/** The square mark: planet plus orbit, in the 256×256 mark space. */
const markGroup = (seed) => `<g>${renderOrbit(seed)}${diskGroup(seed, MARK_LAYOUT)}</g>`;

const svgDocument = (body, width, height, defsBlock) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Living Mars Machine">
  ${defsBlock}
  ${body}
</svg>`;

const renderMark = (seed) => svgDocument(markGroup(seed), VIEW, VIEW, defs(MARK_LAYOUT));

const renderIcon = (seed) =>
  svgDocument(diskGroup(seed, ICON_LAYOUT), VIEW, VIEW, defs(ICON_LAYOUT));

const WORDMARK_WIDTH = 800;
const WORDMARK_HEIGHT = 256;
/**
 * Without the tagline the name survives being scaled down to a small UI header, and
 * without the plate it sits directly on whatever panel hosts it instead of reading as a
 * second box inside that panel.
 */
const LOCKUP_WIDTH = 700;
/** The lockup carries its own dark plate so it stays legible on any page background. */
const PLATE = '#14100F';

/** Mark plus the two-line name — the part every horizontal lockup shares. */
const nameGroup = (seed) => `<g transform="translate(20 0) scale(0.94) translate(8 8)">${markGroup(
  seed,
)}</g>
  <g font-family="'Inter', 'Helvetica Neue', Arial, sans-serif" text-anchor="start">
    <text x="296" y="116" fill="${PALETTE.buildingShell}" font-size="52" font-weight="700" letter-spacing="6">LIVING MARS</text>
    <text x="296" y="174" fill="${PALETTE.accent}" font-size="52" font-weight="700" letter-spacing="6">MACHINE</text>
  </g>`;

const plate = (width) =>
  `<rect x="0" y="0" width="${width}" height="${WORDMARK_HEIGHT}" rx="40" fill="${PLATE}"/>`;

const renderWordmark = (seed) =>
  svgDocument(
    `${plate(WORDMARK_WIDTH)}
  ${nameGroup(seed)}
  <text x="300" y="210" fill="${PALETTE.terrainHigh}" font-family="'Inter', 'Helvetica Neue', Arial, sans-serif" font-size="17" font-weight="500" letter-spacing="5">DETERMINISTIC COLONY SIMULATOR</text>`,
    WORDMARK_WIDTH,
    WORDMARK_HEIGHT,
    defs(MARK_LAYOUT),
  );

const renderLockup = (seed) =>
  svgDocument(nameGroup(seed), LOCKUP_WIDTH, WORDMARK_HEIGHT, defs(MARK_LAYOUT));

/** Rasterise an SVG string with headless Chromium — transparent background, no upscaling. */
const rasterise = async (browser, svg, width, height, outPath) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg}</body></html>`,
    {
      waitUntil: 'load',
    },
  );
  await page.locator('svg').evaluate(
    (node, size) => {
      node.setAttribute('width', String(size.width));
      node.setAttribute('height', String(size.height));
    },
    { width, height },
  );
  await page.screenshot({ path: outPath, omitBackground: true });
  await page.close();
};

const readArg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const raw = Number(process.argv[index + 1]);
  if (!Number.isFinite(raw)) {
    throw new Error(`--${name} expects a number, got: ${process.argv[index + 1]}`);
  }
  return raw;
};

const main = async () => {
  const seed = readArg('seed', 7);
  const size = readArg('size', 512);
  const outDir = dirname(fileURLToPath(import.meta.url));
  mkdirSync(outDir, { recursive: true });

  const mark = renderMark(seed);
  const wordmark = renderWordmark(seed);
  writeFileSync(join(outDir, 'logo.svg'), `${mark}\n`);
  writeFileSync(join(outDir, 'logo-wordmark.svg'), `${wordmark}\n`);
  writeFileSync(join(outDir, 'logo-lockup.svg'), `${renderLockup(seed)}\n`);
  writeFileSync(join(outDir, 'favicon.svg'), `${renderIcon(seed)}\n`);

  const browser = await chromium.launch();
  try {
    await rasterise(browser, mark, size, size, join(outDir, 'logo.png'));
    const wordmarkWidth = Math.round((size * WORDMARK_WIDTH) / WORDMARK_HEIGHT);
    await rasterise(browser, wordmark, wordmarkWidth, size, join(outDir, 'logo-wordmark.png'));
  } finally {
    await browser.close();
  }

  console.log(
    `logo seed=${seed} size=${size} -> media/logo.svg, logo.png, logo-wordmark.svg, logo-wordmark.png, logo-lockup.svg, favicon.svg`,
  );
};

await main();
