import { restartColony } from '../state/actions.ts';
import { useStore } from '../state/store.ts';
import { ActiveEventBadges } from './EventToast.tsx';
import { formatDays } from './format.ts';
import { CrewIcon, HeartIcon } from './icons.tsx';
import { PANEL, PANEL_LABEL, PANEL_PAD } from './panel.ts';

/**
 * How the colony is doing, as opposed to what it currently holds.
 *
 * Crew, survival score, the next landing and the live events are judgements about the run,
 * so they head the right column beside the objectives they are measured against, leaving the
 * top strip a row of instruments.
 */
export function StatusPanel() {
  const population = useStore((state) => state.ui.population);
  const populationCapacity = useStore((state) => state.ui.populationCapacity);
  const survivalScore = useStore((state) => state.ui.survivalScore);
  const worstDaysLeft = useStore((state) => state.ui.worstDaysLeft);
  const lifeSupportDeficit = useStore((state) => state.ui.lifeSupportDeficit);
  const overflowPopulation = useStore((state) => state.ui.overflowPopulation);
  const solsUntilLanding = useStore((state) => state.ui.solsUntilLanding);
  const nextLandingCrew = useStore((state) => state.ui.nextLandingCrew);

  const scoreColor =
    survivalScore > 70
      ? 'text-[#4FC3F7]'
      : survivalScore > 40
        ? 'text-[#FFB74D]'
        : 'text-[#EF5350]';

  return (
    <div className={`pointer-events-auto w-full ${PANEL} ${PANEL_PAD}`}>
      <div className="flex items-center gap-3">
        <CrewIcon className="h-8 w-8 shrink-0" />
        {/* The two readings take the full width instead of huddling next to the icon. */}
        <div className="flex flex-1 items-start justify-between gap-3">
          <div>
            <div className={PANEL_LABEL}>Crew</div>
            <div
              data-testid="crew-count"
              title={
                overflowPopulation > 0
                  ? `${Math.floor(overflowPopulation)} colonists have no bunk and draw double rations.`
                  : undefined
              }
              className={`font-mono text-sm tabular-nums ${
                overflowPopulation > 0 ? 'text-[#FFB74D]' : 'text-white/95'
              }`}
            >
              {Math.floor(population)}
              <span className="text-white/40">/{populationCapacity}</span>
            </div>
          </div>
          <div className="text-right">
            <div className={PANEL_LABEL}>Survival</div>
            <div
              className={`flex items-center justify-end gap-1 font-mono text-sm tabular-nums ${scoreColor}`}
            >
              {survivalScore.toFixed(0)}%
              <HeartIcon className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Reserves and the next landing are one line: two short facts, not two rows. */}
      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[10px] text-white/40">
        {lifeSupportDeficit ? (
          <span className="text-[#EF5350]">LIFE SUPPORT FAILING</span>
        ) : (
          <span>Reserves {formatDays(worstDaysLeft)}</span>
        )}
        <span data-testid="landing-countdown" className="shrink-0">
          Next crew {formatDays(solsUntilLanding)}{' '}
          <span className="text-[#4FC3F7]">+{nextLandingCrew}</span>
        </span>
      </div>

      <div className="mt-1.5 empty:mt-0">
        <ActiveEventBadges />
      </div>

      <button
        type="button"
        onClick={() => restartColony(Math.floor(Date.now() % 100000))}
        className="mt-1.5 w-full rounded border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-white/60 hover:bg-white/10"
      >
        New colony
      </button>
    </div>
  );
}
