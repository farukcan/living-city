import { useStore } from '../../state/store.ts';
import { PANEL, PANEL_LABEL } from '../panel.ts';
import { LESSON_BY_ID } from './lessons.ts';

/**
 * The lesson currently on screen. See docs/SPEC-07-tutorial.md.
 *
 * It does not block, pause or steal the click, and it does not restate the alarm the HUD is
 * already raising: `Alerts.tsx` says the colony is dying and `QuestPanel.tsx` says what to
 * aim at, so this card is the layer neither of them has room for — why the simulation is
 * doing this, and which building answers it.
 *
 * Only a dismissal closes it. A card that vanished the moment its condition cleared would
 * disappear exactly when a player who fixed the problem by accident most needed to read it.
 */
export function TutorialCard() {
  const currentId = useStore((state) => state.tutorial.currentId);
  const dismissTutorial = useStore((state) => state.dismissTutorial);

  if (currentId === null) return null;
  const lesson = LESSON_BY_ID[currentId];

  return (
    <div
      data-testid="tutorial-card"
      data-lesson={currentId}
      className={`pointer-events-auto w-full p-2.5 ${PANEL}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={PANEL_LABEL}>Tutorial</span>
        <button
          type="button"
          onClick={dismissTutorial}
          className="-mr-1 -mt-0.5 rounded px-1.5 text-white/40 hover:bg-white/10 hover:text-white/80"
          aria-label="Dismiss tutorial"
        >
          ✕
        </button>
      </div>

      <div className="mt-1 text-[12px] font-semibold text-white/90">{lesson.title}</div>
      <p className="mt-1 text-[11px] leading-relaxed text-white/55">{lesson.body}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-[#4FC3F7]">{lesson.solution}</p>

      <button
        type="button"
        onClick={dismissTutorial}
        className="mt-2.5 w-full rounded border border-white/15 bg-white/5 px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/10"
      >
        Got it
      </button>
    </div>
  );
}
