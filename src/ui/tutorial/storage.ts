/**
 * Which lessons this colony has already dismissed.
 *
 * Kept in its own localStorage entry rather than in `SaveFile`, because a schema bump there
 * discards every existing colony (persistence.ts has no migration path by design) and losing
 * a run to make room for tutorial bookkeeping is a bad trade.
 *
 * "Once per colony" falls out of storing the seed alongside the list: both restart paths hand
 * `restartColony` a fresh time-derived seed, so a new colony never matches the stored one and
 * starts with an empty set, while a reload of the same colony matches and keeps it.
 */

import type { TutorialLessonId } from './lessons.ts';

const STORAGE_KEY = 'living-machine.tutorial.v1';

type TutorialProgress = {
  readonly seed: number;
  readonly seenIds: readonly TutorialLessonId[];
};

function isProgress(value: unknown): value is TutorialProgress {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<TutorialProgress>;
  return typeof candidate.seed === 'number' && Array.isArray(candidate.seenIds);
}

/** The dismissed lessons for this seed, or an empty list for any other colony. */
export function loadSeen(seed: number): readonly TutorialLessonId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!isProgress(parsed)) return [];
    return parsed.seed === seed ? parsed.seenIds : [];
  } catch {
    return [];
  }
}

export function saveSeen(seed: number, seenIds: readonly TutorialLessonId[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ seed, seenIds }));
  } catch {
    // A blocked or full quota must not take the HUD down with it; the lesson simply shows
    // again on the next reload, which is the harmless failure.
  }
}
