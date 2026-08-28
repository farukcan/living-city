import { rocketCycle, rocketParked } from '../render/rocketPhase.ts';
import { definitionOf } from '../sim/constants.ts';
import { repairCost } from '../sim/placement.ts';
import type { Building, ResourceKind } from '../sim/types.ts';
import { demolishBuilding, repairBuilding, toggleIdle } from '../state/actions.ts';
import { useStore } from '../state/store.ts';
import { PANEL } from './panel.ts';
import { CONCEPT_ART, CREW_ROCKET_ART } from './conceptArt.ts';
import { formatAmount } from './format.ts';

/**
 * Details and controls for the selected building.
 *
 * This is where the allocator becomes visible. Production is all-or-nothing, so the honest
 * readout is a state and a reason, not a percentage — the difference between "the game is
 * broken" and "the mine is off because the battery is low".
 */

/** Efficiency is 0 or 1; the halfway test only guards against float noise. */
const RUNNING_FLAG = 0.5;

const UNITS: Readonly<Record<ResourceKind, string>> = {
  power: 'kW',
  oxygen: 'kg/sol',
  water: 'L/sol',
  food: 'kg/sol',
  minerals: 'kg/sol',
};

const STATUS_STYLE: Readonly<Record<Building['status'], { label: string; className: string }>> = {
  active: { label: 'Online', className: 'text-[#4FC3F7]' },
  idle: { label: 'Idled', className: 'text-white/45' },
  damaged: { label: 'Damaged', className: 'text-[#EF5350]' },
};

function FlowRow({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  tone: 'in' | 'out';
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-[11px] text-white/55">{label}</span>
      <span
        className={`font-mono text-[11px] tabular-nums ${
          tone === 'in' ? 'text-[#8BC34A]' : 'text-[#FFB74D]'
        }`}
      >
        {tone === 'in' ? '+' : '−'}
        {formatAmount(value)} <span className="text-white/35">{unit}</span>
      </span>
    </div>
  );
}

/**
 * Why a powered, undamaged building is producing nothing.
 *
 * Derived here rather than reported by the simulation: everything it needs is already on the
 * tick report, and a per-building reason map would be state that exists purely for a
 * tooltip.
 */
function stopReason(outage: boolean, thirsty: boolean): string {
  if (outage) return 'Grid outage — the colony has no power at all.';
  if (thirsty) return 'Stopped — no water.';
  return 'Stopped — a higher-priority tier is taking the power.';
}

export function InspectorPanel() {
  const selectedId = useStore((state) => state.interaction.selectedBuildingId);
  const building = useStore((state) =>
    state.sim.buildings.find((candidate) => candidate.id === state.interaction.selectedBuildingId),
  );
  // A boolean rather than a percentage, so this panel re-renders on a transition instead of
  // on every simulation tick.
  const running = useStore(
    (state) =>
      selectedId !== null && (state.sim.report.efficiencyById[selectedId] ?? 0) >= RUNNING_FLAG,
  );
  const outage = useStore((state) => state.sim.report.power.outage);
  const dryColony = useStore((state) => state.sim.stocks.water <= 0);
  const minerals = useStore((state) => Math.floor(state.sim.stocks.minerals));
  // Another boolean for the same reason: the pad's art depends on the rocket, and selecting
  // the raw clock would re-render this panel ten times a second.
  const rocketOnPad = useStore((state) =>
    rocketParked(rocketCycle(state.sim.sol, state.sim.solTime)),
  );
  const selectBuilding = useStore((state) => state.selectBuilding);

  if (!building || selectedId === null) return null;

  const definition = definitionOf(building.kind);
  const status = STATUS_STYLE[building.status];
  const stopped = building.status === 'active' && !running;
  const repair = repairCost(building.kind);
  const thirsty = dryColony && (definition.consumes.water ?? 0) > 0;
  // A pad with a rocket standing on it is a different sight from an empty one, and the
  // player is most likely to open this panel precisely because a rocket just landed.
  const occupiedPad = building.kind === 'rocketPad' && rocketOnPad;
  const art = occupiedPad ? CREW_ROCKET_ART : CONCEPT_ART[building.kind];

  // Uncropped art makes this panel tall enough to overrun a short viewport, where the
  // controls at the foot are the part that would be lost. Scroll instead of clipping.
  return (
    <div className={`pointer-events-auto max-h-full w-full overflow-y-auto p-3 ${PANEL}`}>
      {/* Full-bleed: negative margins undo the panel padding so the art meets the border. */}
      <div className="-mx-3 -mt-3 mb-2.5">
        <img
          src={art}
          alt={`${occupiedPad ? 'Crew Rocket' : definition.label} concept art`}
          // Shown at its native square aspect: any crop tight enough to save vertical space
          // cuts the building itself, which is the one thing the art is here to show.
          className="aspect-square w-full object-contain"
        />
        <div className="h-6 -mt-6 bg-gradient-to-b from-transparent to-black/60" />
      </div>

      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm text-white/90">{definition.label}</div>
          <div className={`text-[11px] ${status.className}`}>{status.label}</div>
        </div>
        <button
          type="button"
          onClick={() => selectBuilding(null)}
          className="rounded px-1.5 text-white/40 hover:bg-white/10 hover:text-white/80"
          aria-label="Close inspector"
        >
          ✕
        </button>
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-white/45">{definition.description}</p>

      {building.status === 'active' && (
        <div className="mt-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-white/50">Output</span>
            <span
              className={`font-mono text-[11px] uppercase tracking-wider ${
                stopped ? 'text-[#EF5350]' : 'text-[#4FC3F7]'
              }`}
            >
              {stopped ? 'Stopped' : 'Running'}
            </span>
          </div>
          {stopped && (
            <div className="mt-1 text-[10px] leading-snug text-[#FFB74D]">
              {stopReason(outage, thirsty)}
            </div>
          )}
        </div>
      )}

      <div className="mt-2.5 border-t border-white/10 pt-2">
        {definition.solarPeakKW > 0 && (
          <FlowRow label="Power (peak sun)" value={definition.solarPeakKW} unit="kW" tone="in" />
        )}
        {Object.entries(definition.produces).map(([kind, amount]) => (
          <FlowRow
            key={`out-${kind}`}
            label={kind[0]?.toUpperCase() + kind.slice(1)}
            value={amount}
            unit={UNITS[kind as ResourceKind]}
            tone="in"
          />
        ))}
        {definition.basePowerKW > 0 && (
          <FlowRow label="Power" value={definition.basePowerKW} unit="kW" tone="out" />
        )}
        {Object.entries(definition.consumes).map(([kind, amount]) => (
          <FlowRow
            key={`in-${kind}`}
            label={kind[0]?.toUpperCase() + kind.slice(1)}
            value={amount}
            unit={UNITS[kind as ResourceKind]}
            tone="out"
          />
        ))}
        {definition.insulation > 0 && (
          <div className="flex items-baseline justify-between gap-2 py-0.5">
            <span className="text-[11px] text-white/55">Heating</span>
            <span className="font-mono text-[11px] tabular-nums text-white/50">
              {definition.insulation.toFixed(2)} kW/°C
            </span>
          </div>
        )}
      </div>

      {/* A fixture the colony was issued offers no controls: every action would be refused. */}
      {definition.buildable && (
        <div className="mt-2.5 flex gap-1.5 border-t border-white/10 pt-2.5">
          {building.status === 'damaged' ? (
            <button
              type="button"
              onClick={() => repairBuilding(building.id)}
              disabled={minerals < repair}
              className="flex-1 rounded border border-[#4FC3F7]/40 bg-[#4FC3F7]/15 px-2 py-1.5 text-[11px] text-[#BEE7FA] hover:bg-[#4FC3F7]/25 disabled:opacity-40"
            >
              Repair ({repair})
            </button>
          ) : (
            <button
              type="button"
              onClick={() => toggleIdle(building.id)}
              className="flex-1 rounded border border-white/15 bg-white/5 px-2 py-1.5 text-[11px] text-white/75 hover:bg-white/10"
            >
              {building.status === 'active' ? 'Idle' : 'Resume'}
            </button>
          )}
          <button
            type="button"
            onClick={() => demolishBuilding(building.id)}
            className="flex-1 rounded border border-[#EF5350]/35 bg-[#EF5350]/10 px-2 py-1.5 text-[11px] text-[#FFC9C7] hover:bg-[#EF5350]/20"
          >
            Demolish (+{Math.floor(definition.cost * 0.5)})
          </button>
        </div>
      )}
    </div>
  );
}
