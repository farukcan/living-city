import { useStore } from '../state/store.ts';
import { formatDays } from './format.ts';

/**
 * Colony-level alarms: the things that end a run, as opposed to the per-resource tinting the
 * TopBar already does.
 *
 * All of it is `pointer-events-none`. These are read, not clicked, and the 3D scene under
 * them has to keep receiving every click.
 */

/** Critical panel recipe, shared by every alert here. */
const ALERT = 'rounded-lg border border-[#EF5350]/40 bg-[#EF5350]/15 px-3 py-1.5 text-[#FFC9C7]';

/**
 * A blinking banner and a red edge glow while the grid is down.
 *
 * Heads the HUD's centre lane because an outage outranks every other reading on screen:
 * nothing is producing anything, and the oxygen the colony is breathing is the last tank it
 * has. The vignette is DOM rather than the postprocessing pass — cheaper, blinks with the
 * same class, and does not couple React to the canvas for a purely decorative effect.
 */
export function OutageAlert() {
  const outage = useStore((state) => state.ui.outage);
  if (!outage) return null;

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-20 animate-pulse"
        style={{ boxShadow: 'inset 0 0 220px 60px rgba(239,83,80,0.42)' }}
      />
      <div data-testid="outage-banner" className="pointer-events-none flex justify-center">
        <div className={`${ALERT} animate-pulse text-center shadow-lg shadow-black/40`}>
          <div className="text-sm font-semibold uppercase tracking-wider">Grid Outage</div>
          <div className="text-[11px] text-[#FFC9C7]/80">
            The battery is empty and the sun is not covering demand. Nothing is producing.
          </div>
        </div>
      </div>
    </>
  );
}

/** Below this the toll rounds to nobody, and a banner reporting no deaths is noise. */
const CASUALTY_FLOOR = 0.5;

/**
 * What the last sol cost in colonists.
 *
 * Deaths are a rate rather than an event, so there is no toast to fire them and nothing else
 * on the HUD states the loss outright — the population readout drifts down slowly enough to
 * miss entirely. The deprivation warnings above say a colony is *about to* start dying; this
 * is the only place that says it already has.
 */
export function CasualtyAlert() {
  const recentDeaths = useStore((state) => state.ui.recentDeaths);
  const gameOver = useStore((state) => state.ui.gameOver);

  // The game-over screen says all of this, and says it better.
  if (gameOver !== null || recentDeaths < CASUALTY_FLOOR) return null;

  const lost = Math.round(recentDeaths);

  return (
    <div data-testid="casualty-alert" className="pointer-events-none flex justify-center">
      <div className={`${ALERT} text-center shadow-lg shadow-black/40`}>
        <div className="text-[11px] font-semibold uppercase tracking-wider">Colonists lost</div>
        <div className="text-[10px] text-[#FFC9C7]/80">
          {lost === 1 ? '1 colonist has' : `${lost} colonists have`} died in the last sol.
        </div>
      </div>
    </div>
  );
}

function Warning({ title, detail }: { title: string; detail: string }) {
  return (
    <div className={`${ALERT} w-64 backdrop-blur-sm`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider">{title}</div>
      <div className="text-[10px] leading-snug text-[#FFC9C7]/80">{detail}</div>
    </div>
  );
}

/**
 * The three ways a colony is currently dying, each with the time it has left.
 *
 * Oxygen gets a warning at all only because it kills instantly — there is no countdown
 * afterwards to notice, so this is the one chance the player has to react.
 */
export function CriticalWarnings() {
  const oxygenCritical = useStore((state) => state.ui.oxygenCritical);
  const oxygenDaysLeft = useStore((state) => state.ui.resources.oxygen.daysLeft);
  const waterDeprived = useStore((state) => state.ui.waterDeprived);
  const foodDeprived = useStore((state) => state.ui.foodDeprived);
  const waterGraceLeft = useStore((state) => state.ui.waterGraceLeft);
  const foodGraceLeft = useStore((state) => state.ui.foodGraceLeft);
  const gameOver = useStore((state) => state.ui.gameOver);

  // The game-over screen says all of this, and says it better.
  if (gameOver !== null) return null;

  // Show only while the tank is still below a sol of need. Leftover timer debt is silent
  // on purpose: it shortens the next drought, it is not a reason to keep shouting.
  if (!oxygenCritical && !waterDeprived && !foodDeprived) return null;

  return (
    <div data-testid="critical-warnings" className="pointer-events-none flex flex-col gap-1.5">
      {oxygenCritical && (
        <Warning
          title="Oxygen critical"
          detail={`${formatDays(oxygenDaysLeft)} of air left. Running out is immediately fatal.`}
        />
      )}
      {waterDeprived && (
        <Warning
          title={waterGraceLeft > 0 ? 'Water running out' : 'Dying of thirst'}
          detail={
            waterGraceLeft > 0
              ? `${formatDays(waterGraceLeft)} before colonists start dying.`
              : 'Colonists are dying, and faster every sol.'
          }
        />
      )}
      {foodDeprived && (
        <Warning
          title={foodGraceLeft > 0 ? 'Food running out' : 'Starving'}
          detail={
            foodGraceLeft > 0
              ? `${formatDays(foodGraceLeft)} before colonists start dying.`
              : 'Colonists are dying, and faster every sol.'
          }
        />
      )}
    </div>
  );
}
