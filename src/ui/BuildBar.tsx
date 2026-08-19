import { BUILDABLE_KINDS, definitionOf } from '../sim/constants.ts';
import type { BuildingKind } from '../sim/types.ts';
import { useStore } from '../state/store.ts';
import { BUILDING_ICONS, MineralIcon } from './icons.tsx';

/**
 * Building picker. Selecting a kind arms placement; the ghost in the scene then previews
 * it under the cursor and the click commits.
 */

function BuildButton({ kind }: { kind: BuildingKind }) {
  const definition = definitionOf(kind);
  const buildMode = useStore((state) => state.interaction.buildMode);
  const setBuildMode = useStore((state) => state.setBuildMode);
  const affordable = useStore((state) => state.sim.stocks.minerals >= definition.cost);
  const Icon = BUILDING_ICONS[kind];

  const active = buildMode === kind;

  return (
    <button
      type="button"
      title={`${definition.label} — ${definition.description}`}
      onClick={() => setBuildMode(active ? null : kind)}
      className={`flex w-[5.75rem] flex-col items-center gap-1 rounded-lg border px-2 py-2 transition-colors ${
        active
          ? 'border-[#4FC3F7] bg-[#4FC3F7]/20 shadow-[0_0_18px_-4px_#4FC3F7]'
          : 'border-white/10 bg-gradient-to-b from-white/[0.06] to-black/45 hover:from-white/[0.12]'
      } ${affordable ? '' : 'opacity-45'}`}
    >
      <Icon className="h-6 w-6 text-white/85" />
      <span className="text-[10px] leading-tight text-white/70">{definition.label}</span>
      <span
        className={`flex items-center gap-0.5 font-mono text-[10px] tabular-nums ${
          affordable ? 'text-white/45' : 'text-[#EF5350]'
        }`}
      >
        <MineralIcon className="h-3 w-3" />
        {definition.cost}
      </span>
    </button>
  );
}

export function BuildBar() {
  const notice = useStore((state) => state.interaction.notice);
  const buildMode = useStore((state) => state.interaction.buildMode);
  const setBuildMode = useStore((state) => state.setBuildMode);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3">
      {notice !== null && (
        <div className="pointer-events-auto rounded-md border border-[#EF5350]/40 bg-[#EF5350]/15 px-3 py-1.5 text-xs text-[#FFC9C7]">
          {notice}
        </div>
      )}

      {buildMode !== null && (
        <button
          type="button"
          onClick={() => setBuildMode(null)}
          className="pointer-events-auto rounded-md border border-white/15 bg-black/50 px-3 py-1 text-[11px] text-white/70 hover:bg-white/10"
        >
          Cancel placement (Esc)
        </button>
      )}

      <div className="pointer-events-auto flex gap-1.5 rounded-xl border border-white/10 bg-black/45 p-1.5 shadow-xl shadow-black/50 backdrop-blur-md">
        {BUILDABLE_KINDS.map((kind) => (
          <BuildButton key={kind} kind={kind} />
        ))}
      </div>
    </div>
  );
}
