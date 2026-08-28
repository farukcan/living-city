import { WIN_HABITATS, WIN_POPULATION, WIN_SOLS } from '../sim/constants.ts';
import { useStore } from '../state/store.ts';
import { PANEL, PANEL_LABEL } from './panel.ts';

/**
 * The colony's objectives, always on screen in one small panel.
 *
 * Three win quests decide the game (sols survived, habitats standing, colonists alive); the
 * other five are transient prompts that surface only while their danger is live and vanish
 * the moment it clears — the same alarms Alerts.tsx raises, reframed here as something to go
 * do rather than something to dread.
 */

type WinQuestId = 'survive' | 'habitats' | 'population';

const WIN_QUEST_LABEL: Readonly<Record<WinQuestId, string>> = {
  survive: `Survive ${WIN_SOLS} sols`,
  habitats: `Build ${WIN_HABITATS} habitats`,
  population: `Reach ${WIN_POPULATION} colonists`,
};

function WinQuestRow({ id, current, target }: { id: WinQuestId; current: number; target: number }) {
  const complete = current >= target;
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] leading-none ${
            complete
              ? 'border-[#7FD98A] bg-[#7FD98A]/25 text-[#7FD98A]'
              : 'border-white/25 text-transparent'
          }`}
        >
          ✓
        </span>
        <span
          className={`truncate text-[10px] ${complete ? 'text-white/45 line-through' : 'text-white/80'}`}
        >
          {WIN_QUEST_LABEL[id]}
        </span>
      </div>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-white/40">
        {Math.min(current, target)}/{target}
      </span>
    </div>
  );
}

function DangerQuestRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded border border-[#EF5350]/30 bg-[#EF5350]/10 px-1.5 py-1">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#EF5350]" />
      <span className="text-[10px] text-[#FFC9C7]">{label}</span>
    </div>
  );
}

export function QuestPanel() {
  const gameOver = useStore((state) => state.ui.gameOver);
  const sol = useStore((state) => state.ui.sol);
  const habitatCount = useStore((state) => state.ui.habitatCount);
  const population = useStore((state) => state.ui.population);
  const foodDeprived = useStore((state) => state.ui.foodDeprived);
  const waterDeprived = useStore((state) => state.ui.waterDeprived);
  const outage = useStore((state) => state.ui.outage);
  const lifeSupportDeficit = useStore((state) => state.ui.lifeSupportDeficit);
  const damagedBuildingCount = useStore((state) => state.ui.damagedBuildingCount);
  const oxygenCritical = useStore((state) => state.ui.oxygenCritical);

  // The game-over screen already says whether this run won or lost.
  if (gameOver !== null) return null;

  // A brownout can starve tier 1 — and start killing colonists — without the battery ever
  // hitting zero, so the prompt has to catch both `outage` and `lifeSupportDeficit` rather
  // than the full grid collapse alone.
  const powerFailing = outage || lifeSupportDeficit;

  const anyDanger =
    foodDeprived || waterDeprived || powerFailing || damagedBuildingCount > 0 || oxygenCritical;

  return (
    <div data-testid="quest-panel" className={`w-full p-2.5 ${PANEL}`}>
      <div className={PANEL_LABEL}>Objectives</div>
      <div className="mt-1">
        <WinQuestRow id="survive" current={sol} target={WIN_SOLS} />
        <WinQuestRow id="habitats" current={habitatCount} target={WIN_HABITATS} />
        <WinQuestRow id="population" current={Math.floor(population)} target={WIN_POPULATION} />
      </div>

      {anyDanger && (
        <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">
          {foodDeprived && <DangerQuestRow label="Feed your people" />}
          {waterDeprived && <DangerQuestRow label="Get them water" />}
          {powerFailing && <DangerQuestRow label="Restore power" />}
          {damagedBuildingCount > 0 && <DangerQuestRow label="Repair damaged buildings" />}
          {oxygenCritical && <DangerQuestRow label="Reinforce oxygen systems" />}
        </div>
      )}
    </div>
  );
}
