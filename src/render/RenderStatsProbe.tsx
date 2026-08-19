import { useEffect } from 'react';
import { useFrame, useStore as useThreeStore } from '@react-three/fiber';
import { clearRenderStats, recordRenderStats } from '../state/profiler.ts';

/**
 * Feeds draw calls and triangle counts to the profiler overlay.
 *
 * `info.autoReset` is turned off while this is mounted because three resets the counters at
 * the start of every `render()` call, and the post-processing composer issues several per
 * frame — left on, the panel would report the final fullscreen pass instead of the frame.
 * Ownership of the reset moves here: read the totals the previous frame accumulated, then
 * clear them.
 *
 * The renderer is reached through the R3F store rather than a `useThree` selector because
 * the counters are mutated, and lint rightly refuses mutation of a hook's return value.
 *
 * The negative priority puts this ahead of every other `useFrame` subscriber. Only a
 * priority above zero makes R3F hand over rendering, so automatic rendering is untouched.
 */
export function RenderStatsProbe() {
  const threeStore = useThreeStore();

  useEffect(() => {
    const { info } = threeStore.getState().gl;
    info.autoReset = false;
    return () => {
      info.autoReset = true;
      clearRenderStats();
    };
  }, [threeStore]);

  useFrame((state) => {
    const { info } = state.gl;
    recordRenderStats(info.render.calls, info.render.triangles);
    info.reset();
  }, -1);

  return null;
}
