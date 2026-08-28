import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { definitionOf } from '../src/sim/constants.ts';
import { LESSON_BY_ID } from '../src/ui/tutorial/lessons.ts';
import type { TutorialLessonId } from '../src/ui/tutorial/lessons.ts';

/**
 * The tutorial's one end-to-end claim: a lesson surfaces on its own, signposts its answer in
 * the build bar, and never comes back once it has been dismissed — not while the colony keeps
 * running, and not after a reload.
 *
 * Which lesson fires first is deliberately not asserted. That depends on the seeded colony's
 * balance, and pinning it here would turn every future balance change into a failure in a
 * test that is not about balance. The unit tests own which condition raises which lesson.
 */

async function waitForCanvas(page: Page) {
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () => canvas.evaluate((element: HTMLCanvasElement) => element.width), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
}

test('teaches a lesson once and then leaves the player alone', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await waitForCanvas(page);

  // The orientation card owns the left column until it is gone, and the tutorial stays
  // quiet behind it on purpose.
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();

  const card = page.getByTestId('tutorial-card');
  await expect(card).toHaveCount(0);

  await page.getByRole('button', { name: '16×' }).click();
  await expect(card).toBeVisible({ timeout: 90_000 });

  const lessonId = (await card.getAttribute('data-lesson')) as TutorialLessonId | null;
  expect(lessonId).not.toBeNull();
  const lesson = LESSON_BY_ID[lessonId as TutorialLessonId];
  expect(lesson).toBeDefined();

  // A lesson whose answer is a building points at that button and no other; one whose answer
  // lives in the inspector points at nothing rather than at something arbitrary.
  const signposted = page.locator('[data-signposted="true"]');
  await expect(signposted).toHaveCount(lesson.highlight === null ? 0 : 1);
  if (lesson.highlight !== null) {
    await expect(signposted).toContainText(definitionOf(lesson.highlight).label);
  }

  await card.getByRole('button', { name: 'Got it' }).click();
  await expect(card).toHaveCount(0);
  await expect(signposted).toHaveCount(0);

  // Another lesson may well surface as the colony runs on — that is the system working. The
  // dismissed one specifically must not. Sampled across a window rather than asserted once:
  // a single negated matcher passes at the first instant the card happens to be absent,
  // which a lesson that reappears a second later would sail straight through.
  const shownLesson = async () =>
    (await card.count()) === 0 ? null : await card.getAttribute('data-lesson');

  const holdFor = async (milliseconds: number) => {
    const deadline = Date.now() + milliseconds;
    while (Date.now() < deadline) {
      expect(await shownLesson()).not.toBe(lessonId);
      await page.waitForTimeout(500);
    }
  };

  await holdFor(15_000);

  await page.reload();
  await waitForCanvas(page);
  await holdFor(5000);
});
