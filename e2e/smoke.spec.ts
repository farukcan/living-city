import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';
import { zoomToColony } from './framing.ts';

/**
 * Smoke coverage for the rendered app.
 *
 * A 3D canvas can mount, report a healthy size, and still draw nothing, so these tests
 * check pixels rather than the DOM: the scene is verified by sampling the framebuffer.
 */

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error: Error) => errors.push(error.message));
  return errors;
}

/** Waits until the WebGL canvas exists and has been given a real backing size. */
async function waitForCanvas(page: Page) {
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () => canvas.evaluate((element: HTMLCanvasElement) => element.width), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  return canvas;
}

/**
 * Counts distinct colours in a screenshot.
 *
 * The screenshot is decoded back inside the browser rather than read out of the WebGL
 * context: `readPixels` returns an empty buffer unless the renderer was built with
 * `preserveDrawingBuffer`, and turning that on in production to satisfy a test is the
 * wrong trade. Compositing a screenshot sees exactly what the user sees.
 */
async function countDistinctColours(page: Page): Promise<number> {
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
    const seen = new Set<number>();
    // Stride is a prime number of pixels so the sample never aligns with the grid.
    for (let i = 0; i < data.length; i += 4 * 997) {
      seen.add(((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0));
    }
    return seen.size;
  }, screenshot.toString('base64'));
}

test('renders the terrain without console errors', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');

  await waitForCanvas(page);
  await page.waitForTimeout(1500);

  // A scene that failed to draw is a single flat colour; lit terrain is hundreds.
  expect(await countDistinctColours(page)).toBeGreaterThan(20);
  expect(errors).toEqual([]);

  // Both of these are full-screen overlays. A healthy colony must not raise either, and the
  // canvas-click sweeps in the tests below would silently stop hitting the scene if one did.
  await expect(page.getByTestId('game-over')).toHaveCount(0);
  await expect(page.getByTestId('outage-banner')).toHaveCount(0);
});

test('keeps the landing pad out of the build menu', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);

  // The pad is issued with the colony; offering it would imply the landings are optional.
  await expect(page.getByRole('button', { name: /Landing Pad/ })).toHaveCount(0);
  await expect(page.getByTestId('landing-countdown')).toContainText(/sols|h/);
});

test('lands a crew of five on sol 7', async ({ page }) => {
  // Seven sols at 16× is roughly half a minute, plus startup.
  test.setTimeout(120_000);
  await page.goto('/');
  await waitForCanvas(page);

  const crew = page.getByTestId('crew-count');
  const readCrew = async () => Number((await crew.innerText()).split('/')[0] ?? 0);

  // The HUD paints once from the empty snapshot before the loop publishes its first real
  // one, so the starting crew has to be polled for rather than read on arrival.
  await expect.poll(readCrew, { timeout: 15_000, intervals: [100] }).toBe(6);

  await page.getByRole('button', { name: '16×' }).click();
  await expect
    .poll(async () => Number(await page.getByTestId('sol-counter').innerText()), {
      timeout: 90_000,
      intervals: [250],
    })
    .toBeGreaterThanOrEqual(7);
  await page.getByRole('button', { name: '❚❚' }).click();
  await page.waitForTimeout(400);

  // Five arrived; a life-support deficit overnight can shave a fraction off before the
  // display rounds down, so the floor is what is asserted.
  expect(await readCrew()).toBeGreaterThanOrEqual(10);
});

test('captures a reference screenshot of the scene', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.waitForTimeout(1500);
  await zoomToColony(page);
  await page.screenshot({ path: 'test-results/scene.png', fullPage: false });
});

/**
 * Not an assertion — a visual reference of the opening frame: the founding rocket still on
 * its pad, and the tutorial panel the colony greets a new player with.
 *
 * Captured on sol 1 and never run forward, and nothing in the scene is clicked. The rocket
 * is parked only for the first half of the opening sol (see `rocketPhase.ts`), and a click
 * would trade the opening panel for the building inspector — this reference is what the
 * game looks like before the player has done anything.
 */
test('captures a reference screenshot of the full interface', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);

  // Paused before anything else: the colony opens at 07:40 and the rocket lifts off at
  // midday, so letting the clock run at all is time spent walking towards an empty pad.
  await page.getByRole('button', { name: '❚❚' }).click();
  await page.waitForTimeout(500);
  await zoomToColony(page);

  await page.screenshot({ path: 'test-results/interface.png', fullPage: false });
});

/**
 * Reads a resource stock out of the HUD.
 *
 * Targets the stock element directly rather than parsing the tile's text: the tile also
 * shows a signed flow rate, and a regex over the whole tile happily returns "+30.0" as the
 * stock — a false pass that hides a broken UI.
 */
async function readStock(page: Page, kind: string): Promise<number> {
  const text = await page.getByTestId(`resource-${kind}-stock`).innerText();
  const value = Number(text.replace(/[^\d.-]/g, ''));
  expect(Number.isFinite(value), `could not parse stock from "${text}"`).toBe(true);
  return value;
}

/** Poll budget for a stock to reflect an action: comfortably over the 250 ms snapshot. */
const STOCK_SETTLE_ATTEMPTS = 6;
const STOCK_SETTLE_INTERVAL_MS = 120;

/**
 * Reads a stock back after an action, giving the 4 Hz HUD snapshot time to catch up.
 *
 * Returns as soon as the figure moves off `unchanged`, and gives up quietly if it never
 * does — a refused placement has nothing to report, and must not stall a sweep that is
 * still looking for a tile that works. A fixed wait cannot do both: too short and an
 * accepted placement reads as refused, which clicks again and buys a second building.
 */
async function settledStock(page: Page, kind: string, unchanged: number): Promise<number> {
  for (let attempt = 0; attempt < STOCK_SETTLE_ATTEMPTS; attempt++) {
    await page.waitForTimeout(STOCK_SETTLE_INTERVAL_MS);
    const value = await readStock(page, kind);
    if (value !== unchanged) return value;
  }
  return unchanged;
}

test('runs the simulation on a fixed-timestep loop', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);

  await expect(page.getByText('Power', { exact: true })).toBeVisible();
  await expect(page.getByText('Survival', { exact: true })).toBeVisible();

  // The sol clock is driven by the loop, so it advancing proves the loop is running.
  const clock = page.getByText(/^\d{2}:\d{2}$/).first();
  const before = await clock.textContent();
  await page.getByRole('button', { name: '16×' }).click();
  // Polled for the same reason the pause check below is: a fixed delay measures the
  // renderer's frame rate rather than whether the simulation advanced.
  await expect
    .poll(async () => clock.textContent(), { timeout: 30_000, intervals: [200] })
    .not.toBe(before);

  // Pausing must actually stop time, not merely slow it.
  //
  // The clock is polled until it settles rather than read after a fixed delay: the HUD is
  // fed by a throttled snapshot, and under a software renderer the frame that publishes it
  // can arrive well after the pause click. A fixed wait tests the renderer's frame rate,
  // not whether the simulation stopped.
  await page.getByRole('button', { name: '❚❚' }).click();
  await expect
    .poll(
      async () => {
        const first = await clock.textContent();
        await page.waitForTimeout(600);
        return (await clock.textContent()) === first;
      },
      { timeout: 15_000, intervals: [200] },
    )
    .toBe(true);

  const paused = await clock.textContent();
  await page.waitForTimeout(1200);
  expect(await clock.textContent()).toBe(paused);
});

test('places a building and charges its mineral cost', async ({ page }) => {
  // The sweep below polls after every click, so a run that has to try most of the grid can
  // outlast the default budget on a loaded machine.
  test.setTimeout(60_000);
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: '❚❚' }).click(); // Pause so mining does not skew the count.
  await page.waitForTimeout(300);

  const before = await readStock(page, 'minerals');
  await page.getByRole('button', { name: /Solar Array/ }).click();
  await expect(page.getByRole('button', { name: /Cancel placement/ })).toBeVisible();

  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  // Sweep the colony until one click lands on a free tile. The centre is dense with starting
  // buildings, which absorb the click as a selection, so the sweep works outwards.
  for (const offsetY of [0.62, 0.5, 0.72, 0.42]) {
    for (const offsetX of [-0.3, -0.2, 0.2, 0.3, -0.1, 0.1, 0]) {
      const x = box.x + box.width * (0.5 + offsetX);
      const y = box.y + box.height * offsetY;
      await page.mouse.move(x, y);
      await page.mouse.click(x, y);
      const after = await settledStock(page, 'minerals', before);
      if (after < before) {
        expect(before - after).toBeCloseTo(20, 0); // Solar Array costs 20.
        return;
      }
    }
  }
  throw new Error('No click placed a Solar Array anywhere on the colony');
});

test('opens the inspector on a building and can idle it', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: '❚❚' }).click();
  await page.waitForTimeout(400);

  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  // The starting colony sits at the centre of the grid; sweep it until a click selects.
  const idleButton = page.getByRole('button', { name: 'Idle', exact: true });
  let opened = false;
  for (const offsetY of [0.44, 0.48, 0.52, 0.4]) {
    for (const offsetX of [0, -0.04, 0.04, -0.08, 0.08, -0.12, 0.12]) {
      await page.mouse.click(box.x + box.width * (0.5 + offsetX), box.y + box.height * offsetY);
      await page.waitForTimeout(100);
      if (await idleButton.isVisible()) {
        opened = true;
        break;
      }
    }
    if (opened) break;
  }
  expect(opened, 'clicking a starting building should open the inspector').toBe(true);

  await expect(page.getByText('Online')).toBeVisible();
  await idleButton.click();
  await expect(page.getByText('Idled')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
});

test('refuses an invalid placement and says why', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: '❚❚' }).click();
  await page.waitForTimeout(300);

  // An Ice Extractor may only stand on ice, and there are only a handful of ice tiles, so
  // sweeping the colony has to produce a refusal. Running out of minerals is also a valid
  // refusal — both prove the same thing: no click is ever a silent no-op.
  await page.getByRole('button', { name: /Ice Extractor/ }).click();

  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const rejection = page.getByText(/ice deposit|already occupied|Needs \d+ minerals/i);
  for (const offsetX of [-0.28, -0.18, -0.08, 0.02, 0.12, 0.22, 0.32]) {
    for (const offsetY of [0.48, 0.6]) {
      const x = box.x + box.width * (0.5 + offsetX);
      const y = box.y + box.height * offsetY;
      await page.mouse.move(x, y);
      await page.mouse.click(x, y);
      await page.waitForTimeout(120);
      if (await rejection.isVisible()) return;
    }
  }
  throw new Error('No placement refusal surfaced anywhere on the colony');
});

test('restores the colony after a reload', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);

  // Advance far enough for an autosave to fire (every 5 sols). Polled rather than waited
  // out: under a software renderer with other workers running, simulated time falls behind
  // wall time — the documented failure mode — and a fixed delay measures the machine.
  await page.getByRole('button', { name: '16×' }).click();
  await expect
    .poll(async () => Number(await page.getByTestId('sol-counter').innerText()), {
      timeout: 60_000,
      intervals: [250],
    })
    .toBeGreaterThan(1);
  await page.getByRole('button', { name: '❚❚' }).click();
  await page.waitForTimeout(400);

  const solBefore = Number(await page.getByTestId('sol-counter').innerText());
  expect(solBefore).toBeGreaterThan(1);
  const mineralsBefore = await readStock(page, 'minerals');

  await page.reload();
  await waitForCanvas(page);
  await page.getByRole('button', { name: '❚❚' }).click();
  await page.waitForTimeout(500);

  // The autosave fires every 5 sols, so the restored colony is at or just behind where it
  // was — never back at the beginning.
  const solAfter = Number(await page.getByTestId('sol-counter').innerText());
  expect(solAfter).toBeGreaterThan(1);
  expect(solAfter).toBeLessThanOrEqual(solBefore);
  expect(Math.abs((await readStock(page, 'minerals')) - mineralsBefore)).toBeLessThan(200);
});

test('starts a fresh colony on demand', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByRole('button', { name: '16×' }).click();
  await page.waitForTimeout(5000);

  // Pause before resetting: otherwise the new colony's mine runs while the assertions are
  // being read, and the test measures the delay rather than the starting state.
  await page.getByRole('button', { name: '❚❚' }).click();
  await page.getByRole('button', { name: 'New colony' }).click();
  await page.waitForTimeout(400);

  // A fresh colony is back at sol 1 with the starting mineral stock.
  expect(Number(await page.getByTestId('sol-counter').innerText())).toBe(1);
  expect(await readStock(page, 'minerals')).toBeCloseTo(150, 0);
});

test('toggles the frame profiler with F3', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/');
  await waitForCanvas(page);

  const panel = page.getByTestId('profiler-panel');
  await expect(panel).toBeHidden();

  await page.keyboard.press('F3');
  await expect(panel).toBeVisible();

  // The readouts start as "collecting…" and fill in on the first published sample, so both
  // numbers are polled. A draw-call count above zero is what proves the panel is reading
  // the live renderer rather than printing a placeholder.
  const readNumber = async (testId: string): Promise<number> => {
    const element = page.getByTestId(testId);
    if (!(await element.isVisible())) return 0;
    return Number((await element.innerText()).replace(/[^\d.-]/g, ''));
  };

  await expect.poll(async () => readNumber('profiler-fps'), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect
    .poll(async () => readNumber('profiler-draw-calls'), { timeout: 15_000 })
    .toBeGreaterThan(0);

  await page.keyboard.press('F3');
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});
