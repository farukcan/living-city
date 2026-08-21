import { afterEach, describe, expect, it } from 'vitest';
import { recordFrame, readProfilerSamples, resetProfiler } from './profiler.ts';

describe('recordFrame', () => {
  afterEach(() => {
    resetProfiler();
  });

  it('reports ~120 fps when frames arrive every 8.33 ms', () => {
    let timestamp = 1_000;
    recordFrame(timestamp);
    for (let i = 0; i < 40; i++) {
      timestamp += 1000 / 120;
      recordFrame(timestamp);
    }
    const latest = readProfilerSamples().at(-1);
    expect(latest).toBeDefined();
    expect(latest?.fps).toBeGreaterThan(110);
    expect(latest?.fps).toBeLessThan(130);
  });

  it('reports ~60 fps when frames arrive every 16.67 ms', () => {
    let timestamp = 1_000;
    recordFrame(timestamp);
    for (let i = 0; i < 20; i++) {
      timestamp += 1000 / 60;
      recordFrame(timestamp);
    }
    const latest = readProfilerSamples().at(-1);
    expect(latest).toBeDefined();
    expect(latest?.fps).toBeGreaterThan(55);
    expect(latest?.fps).toBeLessThan(65);
  });

  it('does not treat a 30-frame window as 30 fps when those frames span 250 ms', () => {
    // 30 frames in 250 ms is 120 fps. Displaying the raw window count was the
    // failure mode that made a 120 Hz machine read as a locked 30.
    let timestamp = 1_000;
    recordFrame(timestamp);
    for (let i = 0; i < 32; i++) {
      timestamp += 250 / 30;
      recordFrame(timestamp);
    }
    const latest = readProfilerSamples().at(-1);
    expect(latest).toBeDefined();
    expect(latest?.fps).toBeGreaterThan(100);
  });
});
