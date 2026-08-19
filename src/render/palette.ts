/**
 * The visual language, in one place. See docs/SPEC-04-rendering.md.
 *
 * The terrain and shells are warm neutrals so that the three status colours are the only
 * saturated things on screen — status stays readable without a legend.
 */

export const PALETTE = {
  terrainLow: '#8C4A32',
  terrainHigh: '#C98F63',
  /** Ground beyond the grid and the distant hills — lighter, so haze reads as distance. */
  terrainFar: '#A8623F',
  /** Ice sheets: pale and slightly blue, low roughness so they catch the sun. */
  iceTint: '#C6D8E2',
  // Cool grey rather than dark brown: an umber ore tint is indistinguishable from the
  // terrain's own elevation shading once the light hits it.
  // Warm dark stone. Ore and ice sat side by side as two similar greys until this was
  // pushed toward brown — the two deposits have to be distinguishable at a glance.
  oreTint: '#4C4038',
  rock: '#6B4132',

  buildingShell: '#D6D3CD',
  /** Low-profile cable runs between buildings. */
  pipe: '#26282B',
  accent: '#4FC3F7',
  warning: '#FFB74D',
  critical: '#EF5350',
  nightEmissive: '#FFD08A',

  skyDay: '#E8A87C',
  skyNight: '#1A1626',
  skyStorm: '#C1553A',

  hoverValid: '#4FC3F7',
  hoverInvalid: '#EF5350',
} as const;

export type PaletteKey = keyof typeof PALETTE;
