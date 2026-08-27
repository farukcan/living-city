import { expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BUILDINGS = [
  { kind: 'solarArray', name: 'solar_array', label: 'Solar Array' },
  { kind: 'batteryBank', name: 'battery_bank', label: 'Battery Bank' },
  { kind: 'habitat', name: 'habitat', label: 'Habitat' },
  { kind: 'iceExtractor', name: 'ice_extractor', label: 'Ice Extractor' },
  { kind: 'electrolyzer', name: 'electrolyzer', label: 'Electrolyzer' },
  { kind: 'greenhouse', name: 'greenhouse', label: 'Greenhouse' },
  { kind: 'mine', name: 'mine', label: 'Mine' },
  { kind: 'storageDepot', name: 'storage_depot', label: 'Storage Depot' },
  { kind: 'rocketPad', name: 'landing_pad', label: 'Landing Pad' },
  { kind: 'rocket', name: 'crew_rocket', label: 'Crew Rocket' },
] as const;

test.describe('Generate building PNG renders', () => {
  test('renders and saves a PNG image for each building', async ({ page }) => {
    test.setTimeout(180_000);

    const docsDir = path.resolve('docs/buildings');
    const screenshotsDir = path.resolve('screenshots/buildings');

    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(screenshotsDir, { recursive: true });

    // Set viewport to a square high-resolution frame
    await page.setViewportSize({ width: 1024, height: 1024 });

    for (const building of BUILDINGS) {
      await page.goto(`/?building=${building.kind}`);
      const canvas = page.locator('canvas');
      await expect(canvas).toBeVisible();

      await expect
        .poll(async () => canvas.evaluate((c: HTMLCanvasElement) => c.width), { timeout: 15_000 })
        .toBeGreaterThan(0);

      // Allow several frames for lighting, shader compilation, and shadows to settle
      await page.waitForTimeout(1000);

      const docsPath = path.join(docsDir, `${building.name}.png`);
      const screenshotsPath = path.join(screenshotsDir, `${building.name}.png`);

      await page.screenshot({ path: docsPath, fullPage: false });
      await page.screenshot({ path: screenshotsPath, fullPage: false });

      console.log(`Generated render: ${building.label} -> ${building.name}.png`);
    }
  });
});
