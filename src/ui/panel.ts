/**
 * The HUD's surface language, in one place.
 *
 * Every card on screen was carrying its own radius, background opacity and border before
 * this existed — differences small enough to read as sloppiness rather than hierarchy. One
 * recipe means a new panel is automatically part of the set, and the two side columns share
 * a width so the HUD reads as a grid instead of scattered cards.
 */

export const PANEL =
  'rounded-lg border border-white/10 bg-gradient-to-b from-white/[0.06] to-black/45 shadow-lg shadow-black/40 backdrop-blur-sm';

/** Padding for a panel that holds rows of readings. */
export const PANEL_PAD = 'px-3 py-2';

export const PANEL_LABEL = 'text-[10px] uppercase tracking-wider text-white/45';

export const PANEL_VALUE = 'font-mono text-sm tabular-nums text-white/95';

/** Both side columns, and therefore every card inside them, are this wide. */
export const COLUMN_WIDTH = 'w-[17rem]';
