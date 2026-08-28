/**
 * Decides which lesson is on screen. See docs/SPEC-07-tutorial.md.
 *
 * Lives outside React for the same reason `loop.ts` does: choosing the lesson from inside a
 * component would mean a `setState` in an effect purely to mirror derived state back into
 * state, which is a cascading render for no reason. Components here only read
 * `tutorial.currentId` and draw it.
 */

import { useStore } from '../../state/store.ts';
import { onboardingVisible } from '../Onboarding.tsx';
import { nextLesson } from './lessons.ts';

/** Started once from App.tsx alongside `startLoop`. Returns its unsubscribe. */
export function startTutorialWatcher(): () => void {
  return useStore.subscribe((state, previous) => {
    if (state.ui === previous.ui && state.tutorial === previous.tutorial) return;

    // Nothing is cached across these gates on purpose. Two of them lift without touching the
    // store at all — the orientation card dismisses itself in local state — so a watcher that
    // remembered "already considered this situation" would never reconsider it, and the
    // lesson would be lost for the rest of the run.
    if (state.tutorial.currentId !== null) return;
    if (state.ui.gameOver !== null) return;
    if (onboardingVisible()) return;

    const next = nextLesson(state.ui, state.tutorial.seenIds);
    if (next !== null) state.showTutorial(next);
  });
}
