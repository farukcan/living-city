/**
 * The fixed-timestep driver. See docs/SPEC-05-state.md.
 *
 * Lives outside React: one requestAnimationFrame chain, started once. Speed changes the
 * number of ticks per frame, never the size of a tick — that is what makes results
 * identical on a 144 Hz monitor and in a throttled background tab.
 */

import { TICK_SECONDS } from '../sim/constants.ts';
import { simulateTick } from '../sim/tick.ts';
import { save } from './persistence.ts';
import { recordFrame } from './profiler.ts';
import { useStore } from './store.ts';

/**
 * A tab that was backgrounded for a minute must not try to simulate a minute in one frame,
 * so the raw frame delta is clamped before the speed multiplier is applied.
 */
const MAX_FRAME_DELTA_SECONDS = 0.25;

/**
 * Spiral-of-death guard. If the machine cannot keep up at 16x, simulated time falls behind
 * wall time — the correct failure mode. An unbounded accumulator locks the browser instead.
 */
const MAX_TICKS_PER_FRAME = 40;

const SNAPSHOT_INTERVAL_MS = 250;

/** Autosave cadence in simulated sols, plus a save whenever the tab is hidden. */
const AUTOSAVE_INTERVAL_SOLS = 5;

export function startLoop(): () => void {
  let frame = 0;
  let lastTimestamp: number | null = null;
  let lastSnapshotAt = 0;
  let lastSavedSol = useStore.getState().sim.sol;
  let accumulator = 0;

  // Saving on hide is what actually protects a session: tabs are closed far more often
  // than they are left open for five sols.
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') save(useStore.getState().sim);
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const step = (timestamp: number) => {
    frame = requestAnimationFrame(step);

    const previous = lastTimestamp ?? timestamp;
    lastTimestamp = timestamp;

    // R3F drives its own chain for rendering; this is the one the app owns, and both are
    // paced by the same display refresh, so it is a faithful frame clock.
    recordFrame(timestamp);

    const store = useStore.getState();
    const { speed } = store.interaction;

    // A finished colony is gated here as well as inside simulateTick: without it the loop
    // still spins forty no-op iterations a frame and keeps re-entering the autosave branch.
    if (speed > 0 && store.sim.gameOver === null) {
      const frameDelta = Math.min((timestamp - previous) / 1000, MAX_FRAME_DELTA_SECONDS);
      accumulator += frameDelta * speed;

      let ticks = 0;
      let sim = store.sim;
      while (accumulator >= TICK_SECONDS && ticks < MAX_TICKS_PER_FRAME) {
        sim = simulateTick(sim, TICK_SECONDS);
        accumulator -= TICK_SECONDS;
        ticks++;
      }
      if (ticks >= MAX_TICKS_PER_FRAME) accumulator = 0;
      if (ticks > 0) {
        store.setSim(sim);
        // The ending is durable immediately: waiting for the next autosave interval would
        // let a reload resurrect a colony that has already died.
        if (sim.gameOver !== null) {
          lastSavedSol = sim.sol;
          save(sim);
        } else if (sim.sol - lastSavedSol >= AUTOSAVE_INTERVAL_SOLS) {
          lastSavedSol = sim.sol;
          save(sim);
        }
      }
    } else {
      // Paused: drop the backlog so unpausing does not fast-forward.
      accumulator = 0;
    }

    if (timestamp - lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
      lastSnapshotAt = timestamp;
      useStore.getState().publishSnapshot();
    }
  };

  frame = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
