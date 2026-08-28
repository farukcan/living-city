import { useSyncExternalStore } from 'react';
import { readProfilerSamples, subscribeProfiler } from '../state/profiler.ts';
import type { ProfilerSample } from '../state/profiler.ts';
import { useStore } from '../state/store.ts';
import { PANEL } from './panel.ts';

/**
 * Frame profiler overlay, toggled with F3.
 *
 * Hand-rolled SVG for the same reason as the sparkline: three polylines are a dozen lines
 * of path maths and a charting dependency would outweigh the whole render layer.
 *
 * Only the fps track carries a dashed reference line. The draw-call figure counts the whole
 * frame — shadow pass and every composer pass included — so the scene budget in
 * docs/SPEC-04-rendering.md is not a line this number can be read against; what matters
 * there is that it stays flat as buildings are added.
 *
 * Rendering only mounts while the overlay is open — see `ProfilerPanel` below — because the
 * readout updates 4 times a second and a hidden panel has no business re-rendering.
 */

const WIDTH = 240;
const GRAPH_HEIGHT = 26;

const FPS_TARGET = 60;

type Track = {
  readonly label: string;
  readonly color: string;
  readonly reading: string;
  /** Null where that window was not measured; the line breaks rather than dropping to zero. */
  readonly values: readonly (number | null)[];
  readonly scaleMax: number;
  /** Dashed reference line, or null where the metric has no single target to hold. */
  readonly reference: number | null;
};

function linePath(values: readonly (number | null)[], scaleMax: number): string {
  const stepX = WIDTH / Math.max(1, values.length - 1);

  let path = '';
  let penDown = false;
  values.forEach((value, index) => {
    if (value === null) {
      penDown = false;
      return;
    }
    const x = index * stepX;
    const normalised = Math.min(1, Math.max(0, value / scaleMax));
    const y = GRAPH_HEIGHT - normalised * (GRAPH_HEIGHT - 2) - 1;
    path += `${penDown ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
    penDown = true;
  });

  return path.trim();
}

/** Scale is driven by what was actually measured; unmeasured windows must not flatten it. */
function peakOf(values: readonly (number | null)[], floor: number): number {
  let peak = floor;
  for (const value of values) {
    if (value !== null) peak = Math.max(peak, value);
  }
  return peak;
}

function referenceY(reference: number, scaleMax: number): number {
  return GRAPH_HEIGHT - Math.min(1, reference / scaleMax) * (GRAPH_HEIGHT - 2) - 1;
}

function fpsColor(fps: number): string {
  if (fps < 30) return '#EF5350';
  if (fps < 55) return '#FFB74D';
  return '#7FD98A';
}

/**
 * Heap is Chromium-only (`performance.memory`), so its track appears or does not rather
 * than printing a zero that would read as "no memory used".
 */
function buildTracks(samples: readonly ProfilerSample[], latest: ProfilerSample): Track[] {
  const fps = samples.map((sample) => sample.fps);
  const drawCalls = samples.map((sample) => sample.drawCalls);

  const tracks: Track[] = [
    {
      label: 'FPS',
      color: fpsColor(latest.fps),
      reading: latest.fps.toFixed(0),
      values: fps,
      scaleMax: peakOf(fps, FPS_TARGET),
      reference: FPS_TARGET,
    },
    {
      label: 'Draw calls',
      color: '#4FC3F7',
      reading: latest.drawCalls === null ? '—' : latest.drawCalls.toFixed(0),
      values: drawCalls,
      scaleMax: peakOf(drawCalls, 1),
      reference: null,
    },
  ];

  if (latest.heapMB !== null) {
    const heap = samples.map((sample) => sample.heapMB);
    tracks.push({
      label: 'JS heap',
      color: '#C58AF0',
      reading: `${latest.heapMB.toFixed(0)} MB`,
      values: heap,
      // Scaled to its own peak: absolute heap size says little, the slope says everything.
      scaleMax: peakOf(heap, 1),
      reference: null,
    });
  }

  return tracks;
}

function TrackGraph({ track }: { track: Track }) {
  const path = linePath(track.values, track.scaleMax);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-white/45">{track.label}</span>
        <span
          className="font-mono text-[11px] tabular-nums"
          style={{ color: track.color }}
          data-testid={`profiler-${track.label.replace(/\s+/g, '-').toLowerCase()}`}
        >
          {track.reading}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${GRAPH_HEIGHT}`}
        className="h-[26px] w-full"
        preserveAspectRatio="none"
        aria-hidden
      >
        {track.reference === null ? null : (
          <line
            x1={0}
            x2={WIDTH}
            y1={referenceY(track.reference, track.scaleMax)}
            y2={referenceY(track.reference, track.scaleMax)}
            stroke="#FFFFFF"
            strokeOpacity={0.18}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {path === '' ? null : (
          <path
            d={path}
            fill="none"
            stroke={track.color}
            strokeWidth={1.4}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
}

function ProfilerReadout() {
  const samples = useSyncExternalStore(subscribeProfiler, readProfilerSamples);
  const latest = samples.at(-1) ?? null;

  return (
    <div data-testid="profiler-panel" className={`pointer-events-auto w-full p-2.5 ${PANEL}`}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-white/50">Profiler</span>
        <span className="text-[10px] text-white/35">F3</span>
      </div>

      {latest === null ? (
        <div className="py-3 text-center text-[10px] text-white/35">collecting…</div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {buildTracks(samples, latest).map((track) => (
              <TrackGraph key={track.label} track={track} />
            ))}
          </div>

          <div className="mt-2 flex justify-between border-t border-white/10 pt-1.5 font-mono text-[10px] tabular-nums text-white/55">
            {/* The worst frame of the window, not the mean: a mean of 16 ms hides a 90 ms hitch. */}
            <span>worst {latest.worstFrameMs.toFixed(1)} ms</span>
            <span>
              {latest.triangles === null
                ? '— tris'
                : `${(latest.triangles / 1000).toFixed(0)}k tris`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** Visibility gate, kept separate so toggling re-renders nothing but the overlay. */
export function ProfilerPanel() {
  const visible = useStore((state) => state.interaction.showProfiler);
  return visible ? <ProfilerReadout /> : null;
}
