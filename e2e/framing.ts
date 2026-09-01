import type { Page } from '@playwright/test';

/**
 * Pulls the camera in on the colony before a reference capture.
 *
 * The default framing sits far enough out to show the horizon, which sells the planet but
 * leaves the buildings too small to read in a screenshot. Zooming is done through the wheel
 * rather than by moving the camera directly so the captures show a framing a player can
 * actually reach through OrbitControls.
 */
export async function zoomToColony(page: Page): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) return;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  for (let step = 0; step < 12; step++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(40);
  }
  // Damping keeps moving the camera after the last wheel event.
  await page.waitForTimeout(600);
}
