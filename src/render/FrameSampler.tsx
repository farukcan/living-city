import { useFrame } from '@react-three/fiber';
import { recordFrame } from '../state/profiler.ts';

/**
 * Counts presented frames for the F3 profiler.
 *
 * Must live inside the Canvas: R3F drives its own animation loop (Three's
 * `setAnimationLoop`), and the simulation `requestAnimationFrame` in `loop.ts` is a
 * second chain. Those two can tick at different rates — on a ProMotion display the sim
 * loop has been seen sitting at 30 Hz while the composer keeps presenting at 60/120.
 * FPS is what the player is watching, so it has to be sampled here.
 *
 * Always mounted, not gated on the overlay: that is what fills 30 s of history the
 * moment F3 is pressed. One `performance.now()` read per frame, no allocations.
 */
export function FrameSampler() {
  useFrame(() => {
    recordFrame(performance.now());
  });
  return null;
}
