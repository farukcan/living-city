import { definitionOf } from '../sim/constants.ts';
import type { ResourceKind } from '../sim/types.ts';
import { useStore } from '../state/store.ts';
import { formatAmount } from './format.ts';
import { PANEL } from './panel.ts';

/**
 * What the building under the cursor makes and costs, without having to click it.
 *
 * Anchored to a fixed corner rather than following the pointer: a card chasing the cursor
 * over a 3D scene has to be repositioned every frame and lands on top of whatever the
 * player is trying to look at.
 */

const UNITS: Readonly<Record<ResourceKind, string>> = {
  power: 'kW',
  oxygen: 'kg/sol',
  water: 'L/sol',
  food: 'kg/sol',
  minerals: 'kg/sol',
};

export function HoverCard() {
  const hoveredId = useStore((state) => state.interaction.hoveredBuildingId);
  const selectedId = useStore((state) => state.interaction.selectedBuildingId);
  const building = useStore((state) =>
    state.sim.buildings.find((candidate) => candidate.id === state.interaction.hoveredBuildingId),
  );
  // Efficiency is a run flag, 0 or 1; the halfway test only guards against float noise.
  const running = useStore(
    (state) => hoveredId !== null && (state.sim.report.efficiencyById[hoveredId] ?? 0) >= 0.5,
  );

  // The inspector already shows everything this card would, in more detail.
  if (!building || hoveredId === null || selectedId === hoveredId) return null;

  const definition = definitionOf(building.kind);
  const outputs = Object.entries(definition.produces);
  const inputs = Object.entries(definition.consumes);

  return (
    <div className={`pointer-events-none w-full px-2.5 py-2 ${PANEL}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-white/90">{definition.label}</span>
        <span
          className={`font-mono text-[10px] ${
            building.status !== 'active'
              ? 'text-white/40'
              : running
                ? 'text-[#4FC3F7]'
                : 'text-[#EF5350]'
          }`}
        >
          {building.status === 'active' ? (running ? 'running' : 'stopped') : building.status}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
        {definition.solarPeakKW > 0 && (
          <span className="text-[#8BC34A]">+{definition.solarPeakKW} kW peak</span>
        )}
        {outputs.map(([kind, amount]) => (
          <span key={`out-${kind}`} className="text-[#8BC34A]">
            +{formatAmount(amount)} {UNITS[kind as ResourceKind]}
          </span>
        ))}
        {definition.basePowerKW > 0 && (
          <span className="text-[#FFB74D]">−{definition.basePowerKW} kW</span>
        )}
        {inputs.map(([kind, amount]) => (
          <span key={`in-${kind}`} className="text-[#FFB74D]">
            −{formatAmount(amount)} {UNITS[kind as ResourceKind]}
          </span>
        ))}
      </div>

      <div className="mt-1 text-[10px] text-white/35">Click for details</div>
    </div>
  );
}
