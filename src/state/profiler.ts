/**
 * Frame profiler sampling. See docs/SPEC-05-state.md.
 *
 * Deliberately outside the Zustand store. This measures the host machine, not the colony:
 * routing it through `sim` would put a number that changes every frame inside the state
 * that persistence saves and `simulateTick` has to stay pure over. Components read it
 * through `useSyncExternalStore`, so only the profiler panel re-renders on a new sample.
 *
 * Sampling is windowed rather than per-frame: a graph of raw frame deltas is noise, and a
 * React update per frame would itself cost more than the thing it measures.
 */

/** 120 samples at 250 ms is a 30 s window — long enough to see a leak start. */
const CAPACITY = 120;
const SAMPLE_INTERVAL_MS = 250;

/**
 * A frame longer than this is a resumed tab, not a stutter. rAF stops while hidden, so the
 * first frame back carries the whole hidden duration; folding it into the window would peg
 * the graph scale for the next 30 s.
 */
const MAX_PLAUSIBLE_FRAME_MS = 1000;

const BYTES_PER_MB = 1024 * 1024;

export type ProfilerSample = {
  readonly fps: number;
  /** Worst frame of the window. An average hides exactly the stutter worth seeing. */
  readonly worstFrameMs: number;
  /** Null while the renderer probe is unmounted — a zero would read as a real measurement. */
  readonly drawCalls: number | null;
  readonly triangles: number | null;
  /** JS heap in MB, or null where the browser does not expose it (anything but Chromium). */
  readonly heapMB: number | null;
};

type MemoryInfo = { readonly usedJSHeapSize: number };
type PerformanceWithMemory = Performance & { readonly memory?: MemoryInfo };

/**
 * A real ring: samples are written in place and the ordered array is materialised only when
 * something reads it. A profiler that allocates a fresh 120-entry array four times a second
 * whether or not anyone is looking would show up in its own heap graph.
 */
const ring: ProfilerSample[] = [];
let writeIndex = 0;
let version = 0;
let cachedVersion = -1;
let cached: readonly ProfilerSample[] = [];

const listeners = new Set<() => void>();

let lastFrameAtMs: number | null = null;
let windowStartMs = 0;
let windowFrames = 0;
let windowWorstFrameMs = 0;
let lastDrawCalls: number | null = null;
let lastTriangles: number | null = null;

function readHeapMB(): number | null {
  const memory = (performance as PerformanceWithMemory).memory;
  if (memory === undefined) return null;
  return memory.usedJSHeapSize / BYTES_PER_MB;
}

function publish(sample: ProfilerSample): void {
  if (ring.length < CAPACITY) ring.push(sample);
  else ring[writeIndex] = sample;
  writeIndex = (writeIndex + 1) % CAPACITY;
  version++;
  for (const listener of listeners) listener();
}

/**
 * Called once per animation frame by the loop. Cheap enough to run whether or not the panel
 * is open, which is what lets the panel show 30 s of history the moment it is opened.
 */
export function recordFrame(timestampMs: number): void {
  const previous = lastFrameAtMs;
  lastFrameAtMs = timestampMs;

  if (previous === null) {
    windowStartMs = timestampMs;
    return;
  }

  const frameMs = timestampMs - previous;
  if (frameMs > MAX_PLAUSIBLE_FRAME_MS) {
    windowStartMs = timestampMs;
    windowFrames = 0;
    windowWorstFrameMs = 0;
    return;
  }

  windowFrames++;
  windowWorstFrameMs = Math.max(windowWorstFrameMs, frameMs);

  const elapsedMs = timestampMs - windowStartMs;
  if (elapsedMs < SAMPLE_INTERVAL_MS) return;

  publish({
    fps: (windowFrames * 1000) / elapsedMs,
    worstFrameMs: windowWorstFrameMs,
    drawCalls: lastDrawCalls,
    triangles: lastTriangles,
    heapMB: readHeapMB(),
  });

  windowStartMs = timestampMs;
  windowFrames = 0;
  windowWorstFrameMs = 0;
}

/** Fed by the renderer probe once per frame while the overlay is open. */
export function recordRenderStats(drawCalls: number, triangles: number): void {
  lastDrawCalls = drawCalls;
  lastTriangles = triangles;
}

/**
 * Called when the probe unmounts. Without it the last measured counts would keep being
 * published as if they were live, drawing a flat line through a period nothing was measured.
 */
export function clearRenderStats(): void {
  lastDrawCalls = null;
  lastTriangles = null;
}

export function subscribeProfiler(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Oldest first. Stable reference between publishes, as `useSyncExternalStore` requires. */
export function readProfilerSamples(): readonly ProfilerSample[] {
  if (cachedVersion !== version) {
    // Before the ring wraps, `writeIndex` is the length, so this one expression covers both
    // the partly-filled and the wrapped case.
    cached = [...ring.slice(writeIndex), ...ring.slice(0, writeIndex)];
    cachedVersion = version;
  }
  return cached;
}
