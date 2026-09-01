import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { zoomToColony } from './framing.ts';

/**
 * Visual references for the day/night cycle.
 *
 * These are not pixel-comparison tests — they capture screenshots for human review and
 * assert only the properties that must hold for the scene to be readable at all.
 */

async function waitForScene(page: Page) {
  await expect(page.locator('canvas')).toBeVisible();
  await expect
    .poll(async () => page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.width))
    .toBeGreaterThan(0);
  await page.waitForTimeout(1200);
}

/** Mean brightness of the rendered frame, 0..255. */
async function meanBrightness(page: Page): Promise<number> {
  const screenshot = await page.screenshot();
  return page.evaluate(async (base64: string) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const surface = document.createElement('canvas');
    surface.width = image.width;
    surface.height = image.height;
    const context = surface.getContext('2d');
    if (!context) return -1;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, surface.width, surface.height);
    let total = 0;
    let samples = 0;
    for (let i = 0; i < data.length; i += 4 * 331) {
      total += ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
      samples++;
    }
    return samples > 0 ? total / samples : -1;
  }, screenshot.toString('base64'));
}

/** Reads the sol clock, e.g. "07:45" → 7.75 hours. */
async function readClockHours(page: Page): Promise<number> {
  const text =
    (await page
      .getByText(/^\d{2}:\d{2}$/)
      .first()
      .textContent()) ?? '00:00';
  const [hours, minutes] = text.split(':').map(Number);
  return (hours ?? 0) + (minutes ?? 0) / 60;
}

test('night is visibly darker than day', async ({ page }) => {
  await page.goto('/');
  await waitForScene(page);

  await page.getByRole('button', { name: '16×' }).click();

  // Run forward until the clock reads mid-afternoon, then capture.
  await expect
    .poll(async () => readClockHours(page), { timeout: 60_000, intervals: [250] })
    .toBeGreaterThan(12);
  await page.getByRole('button', { name: '❚❚' }).click();
  await page.waitForTimeout(400);
  const dayBrightness = await meanBrightness(page);
  await page.screenshot({ path: 'test-results/day.png' });

  // Then on to the middle of the night.
  await page.getByRole('button', { name: '16×' }).click();
  await expect
    .poll(async () => readClockHours(page), { timeout: 60_000, intervals: [250] })
    .toBeLessThan(3);
  await page.getByRole('button', { name: '❚❚' }).click();
  await page.waitForTimeout(400);
  const nightBrightness = await meanBrightness(page);

  // Zoomed in only for the capture, and only after both readings are taken: close framing
  // fills the frame with lit windows, which would flatter the night sample and turn the
  // brightness comparison below into a test of the camera rather than of the lighting.
  await zoomToColony(page);
  await page.screenshot({ path: 'test-results/night.png' });

  // The whole point of the day/night cycle: it has to be visible, not merely simulated.
  expect(nightBrightness).toBeLessThan(dayBrightness * 0.7);
  // ...and the colony must still be legible rather than a black rectangle.
  expect(nightBrightness).toBeGreaterThan(8);
});

/**
 * A reference of a landing in progress.
 *
 * The descent is driven by the simulation clock, so the only honest check that the rocket
 * draws at all is a picture of it drawing.
 */
test('captures the rocket on approach', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await waitForScene(page);

  await zoomToColony(page);

  await page.getByRole('button', { name: '16×' }).click();
  await expect
    .poll(async () => Number(await page.getByTestId('sol-counter').innerText()), {
      timeout: 90_000,
      intervals: [200],
    })
    .toBeGreaterThanOrEqual(6);

  // The descent occupies the last third of a sol before the landing. At 4x a sol is fifteen
  // seconds, slow enough that the pause click lands inside that window.
  await page.getByRole('button', { name: '4×' }).click();
  await expect
    .poll(
      async () => {
        const text = (await page.getByTestId('landing-countdown').innerText()) ?? '';
        // formatDays renders anything under a sol as hours; the descent is under nine.
        const hours = /(\d+)\s*h/.exec(text);
        return hours ? Number(hours[1]) : 99;
      },
      { timeout: 60_000, intervals: [120] },
    )
    .toBeLessThanOrEqual(6);

  await page.getByRole('button', { name: '❚❚' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/rocket.png' });
});
