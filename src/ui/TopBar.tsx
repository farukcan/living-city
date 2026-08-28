import logoMark from '../../media/logo.svg';
import { SPEEDS } from '../sim/constants.ts';
import type { Speed } from '../sim/constants.ts';
import type { ResourceKind } from '../sim/types.ts';
import { useStore } from '../state/store.ts';
import { MoonIcon, RESOURCE_COLORS, RESOURCE_ICONS, SunIcon } from './icons.tsx';
import { formatAmount, formatRate, formatSolClock, formatTemperature } from './format.ts';
import { PANEL, PANEL_LABEL, PANEL_PAD, PANEL_VALUE } from './panel.ts';

/**
 * The readout strip: clock, outside conditions, speed control and the five stocks.
 *
 * Every card here is the same PANEL at the same height, and the strip is centred like the
 * build bar below it — the strip is a row of instruments, and a gauge sitting a few pixels
 * off the others reads as a mistake. Colony status lives in
 * StatusPanel, in the right column, because it is a verdict rather than a reading.
 *
 * Every value here comes from the 4 Hz snapshot, never from `sim`, so the bar updates four
 * times a second regardless of simulation speed (docs/SPEC-05-state.md).
 */

const RESOURCE_LABELS: Readonly<Record<ResourceKind, { label: string; unit: string }>> = {
  power: { label: 'Power', unit: 'kWh' },
  oxygen: { label: 'Oxygen', unit: 'kg' },
  water: { label: 'Water', unit: 'L' },
  food: { label: 'Food', unit: 'kg' },
  minerals: { label: 'Minerals', unit: 'kg' },
};

const ORDER: readonly ResourceKind[] = ['power', 'oxygen', 'water', 'food', 'minerals'];

function ResourceTile({ kind }: { kind: ResourceKind }) {
  const resource = useStore((state) => state.ui.resources[kind]);
  const { label, unit } = RESOURCE_LABELS[kind];
  const Icon = RESOURCE_ICONS[kind];
  const color = RESOURCE_COLORS[kind];

  const fill = resource.cap > 0 ? Math.min(1, resource.stock / resource.cap) : 0;
  const critical = resource.net < 0 && resource.daysLeft < 5;
  const draining = resource.net < 0;

  return (
    <div
      data-testid={`resource-${kind}`}
      className={`flex min-w-[8.25rem] flex-col justify-center ${PANEL} ${PANEL_PAD}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={PANEL_LABEL}>{label}</span>
        <span
          data-testid={`resource-${kind}-net`}
          className={`text-[10px] tabular-nums ${
            critical ? 'text-[#EF5350]' : draining ? 'text-[#FFB74D]' : 'text-[#7FD98A]'
          }`}
        >
          {formatRate(resource.net)}
        </span>
      </div>

      <div className="mt-0.5 flex items-center justify-between gap-2">
        <div className="font-mono text-[15px] leading-none tabular-nums text-white/95">
          {/* Stock is isolated in its own element so tests read a number, not a sentence. */}
          <span data-testid={`resource-${kind}-stock`}>{formatAmount(resource.stock)}</span>
          <span className="ml-1 text-[10px] text-white/40">{unit}</span>
        </div>
        {/* The icons inherit currentColor, so the resource colour is set on the wrapper. */}
        <span style={{ color }} className="shrink-0">
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>

      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/50">
        <div
          className="h-full transition-[width] duration-200"
          style={{
            width: `${fill * 100}%`,
            backgroundColor: critical ? '#EF5350' : color,
          }}
        />
      </div>
    </div>
  );
}

function SpeedControl() {
  const speed = useStore((state) => state.interaction.speed);
  const setSpeed = useStore((state) => state.setSpeed);

  return (
    <div className="flex overflow-hidden rounded-md border border-white/10">
      {SPEEDS.map((option: Speed) => (
        <button
          key={option}
          type="button"
          onClick={() => setSpeed(option)}
          className={`px-2.5 py-1.5 font-mono text-xs transition-colors ${
            speed === option
              ? 'bg-[#4FC3F7] text-[#10141C]'
              : 'bg-black/35 text-white/60 hover:bg-white/10'
          }`}
        >
          {option === 0 ? '❚❚' : `${option}×`}
        </button>
      ))}
    </div>
  );
}

function FlowLinesToggle() {
  const showFlowLines = useStore((state) => state.interaction.showFlowLines);
  const toggleFlowLines = useStore((state) => state.toggleFlowLines);

  return (
    <button
      type="button"
      onClick={toggleFlowLines}
      title="Show resource flow between producers and consumers"
      className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
        showFlowLines
          ? 'border-[#4FC3F7]/50 bg-[#4FC3F7]/20 text-[#BEE7FA]'
          : 'border-white/10 bg-black/35 text-white/50 hover:bg-white/10'
      }`}
    >
      Flows
    </button>
  );
}

export function TopBar() {
  const sol = useStore((state) => state.ui.sol);
  const solTime = useStore((state) => state.ui.solTime);
  const ambientTemp = useStore((state) => state.ui.ambientTemp);
  const sunIntensity = useStore((state) => state.ui.sunIntensity);

  return (
    <div className="pointer-events-none flex shrink-0 flex-wrap items-stretch justify-center gap-2 p-3">
      <div className={`pointer-events-auto flex items-center gap-3 ${PANEL} ${PANEL_PAD}`}>
        {/* The mark sits where a HUD's mission patch would: left of the clock, never over
            the world. */}
        <img
          src={logoMark}
          alt="Living Mars Machine"
          title="Living Mars Machine"
          className="h-9 w-9 shrink-0"
        />
        <div className="h-8 w-px bg-white/10" />
        <div>
          <div className={PANEL_LABEL}>Sol</div>
          <div className={PANEL_VALUE}>
            <span data-testid="sol-counter">{sol}</span>
            <span className="ml-1.5 text-white/40">{formatSolClock(solTime)}</span>
          </div>
        </div>
        <div className="h-8 w-px bg-white/10" />
        <div>
          <div className={PANEL_LABEL}>Outside</div>
          <div className={`flex items-center gap-1.5 ${PANEL_VALUE}`}>
            {formatTemperature(ambientTemp)}
            {sunIntensity > 0 ? (
              <SunIcon className="h-3.5 w-3.5 text-[#FFD08A]" />
            ) : (
              <MoonIcon className="h-3.5 w-3.5 text-white/45" />
            )}
          </div>
        </div>
        <SpeedControl />
        <FlowLinesToggle />
      </div>

      <div className="pointer-events-auto flex items-stretch gap-2">
        {ORDER.map((kind) => (
          <ResourceTile key={kind} kind={kind} />
        ))}
      </div>
    </div>
  );
}
