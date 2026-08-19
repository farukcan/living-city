import { useEffect, useState } from 'react';
import { useStore } from '../state/store.ts';

/**
 * A one-time orientation card.
 *
 * The colony already runs on first load, so this does not teach controls — it names the
 * one thing a viewer would otherwise have to infer: that the numbers are a simulation, and
 * that the night is what makes it interesting. It dismisses on the first real interaction
 * so nobody has to read it.
 */

const STORAGE_KEY = 'living-machine.onboarding.seen';

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // A blocked storage is not worth interrupting anyone over.
  }
}

export function Onboarding() {
  const [dismissed, setDismissed] = useState(alreadySeen);
  const buildMode = useStore((state) => state.interaction.buildMode);
  const selectedBuildingId = useStore((state) => state.interaction.selectedBuildingId);

  // Any real interaction means the card has served its purpose. Derived during render
  // rather than pushed through an effect: a setState inside an effect just to mirror
  // props back into state is a cascading render for no reason.
  const interacted = buildMode !== null || selectedBuildingId !== null;
  const visible = !dismissed && !interacted;

  const dismiss = () => {
    remember();
    setDismissed(true);
  };

  // The effect only writes to the external system, which is what effects are for.
  useEffect(() => {
    if (interacted) remember();
  }, [interacted]);

  if (!visible) return null;

  return (
    <div className="pointer-events-auto w-64 rounded-md border border-[#4FC3F7]/30 bg-black/55 p-3 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm text-white/90">Living Machine</div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded px-1.5 text-white/40 hover:bg-white/10 hover:text-white/80"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-white/60">
        A working Mars colony, already running. Power, water, oxygen, food and heat are solved every
        tick by a priority allocator.
      </p>
      <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-white/50">
        <li>
          <span className="text-white/75">Click a building</span> to see what it makes, what it
          costs, and whether it is being throttled.
        </li>
        <li>
          <span className="text-white/75">Run to nightfall</span> at 16× — solar output hits zero
          and the allocator starts shedding load.
        </li>
        <li>
          <span className="text-white/75">Build</span> from the bar below; extractors need the
          deposit they mine.
        </li>
      </ul>
      <button
        type="button"
        onClick={dismiss}
        className="mt-2.5 w-full rounded border border-white/15 bg-white/5 px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/10"
      >
        Got it
      </button>
    </div>
  );
}

/** Small-screen advisory: the HUD assumes a desktop-sized viewport. */
export function DesktopNotice() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 mx-auto w-64 -translate-y-1/2 rounded-md border border-white/15 bg-black/70 p-3 text-center text-[11px] text-white/70 md:hidden">
      This colony is built for a desktop-sized screen. It runs here, but the HUD will be cramped.
    </div>
  );
}
