/**
 * The single Zustand store. See docs/SPEC-05-state.md.
 *
 * Sliced by update frequency, not by domain. That is the whole design: `sim` changes at
 * 10 Hz and is read imperatively inside `useFrame`, `ui` is a throttled 4 Hz projection
 * that the HUD subscribes to, and `interaction` changes only when the user does something.
 * Nothing subscribes to `sim`, which is what keeps a 10 Hz simulation from driving a
 * 10 Hz React tree.
 */

import { create } from 'zustand';
import { createColony } from '../sim/colony.ts';
import { load } from './persistence.ts';
import type { Speed } from '../sim/constants.ts';
import type { AxialKey } from '../sim/hex.ts';
import type { BuildingKind, SimState } from '../sim/types.ts';
import { emptySnapshot, projectSnapshot } from './snapshot.ts';
import type { UiSnapshot } from './snapshot.ts';

export type InteractionState = {
  readonly speed: Speed;
  readonly buildMode: BuildingKind | null;
  readonly selectedBuildingId: string | null;
  readonly hoveredBuildingId: string | null;
  readonly hoveredTile: AxialKey | null;
  readonly showFlowLines: boolean;
  /** Frame profiler overlay, toggled with F3. Off by default; it is a developer tool. */
  readonly showProfiler: boolean;
  /** Last rejected action, shown in the HUD then cleared. */
  readonly notice: string | null;
};

export type Store = {
  readonly sim: SimState;
  readonly ui: UiSnapshot;
  readonly interaction: InteractionState;

  readonly setSim: (sim: SimState) => void;
  readonly publishSnapshot: () => void;
  readonly setSpeed: (speed: Speed) => void;
  readonly setBuildMode: (kind: BuildingKind | null) => void;
  readonly selectBuilding: (id: string | null) => void;
  readonly setHoveredBuilding: (id: string | null) => void;
  readonly setHoveredTile: (key: AxialKey | null) => void;
  readonly toggleFlowLines: () => void;
  readonly toggleProfiler: () => void;
  readonly setNotice: (message: string | null) => void;
};

const INITIAL_SEED = 42;

/** A stored colony wins over a fresh one; a corrupt or outdated save is simply ignored. */
function initialSim(): SimState {
  return load() ?? createColony(INITIAL_SEED);
}

export const useStore = create<Store>((set, get) => ({
  sim: initialSim(),
  ui: emptySnapshot(),
  interaction: {
    speed: 1,
    buildMode: null,
    selectedBuildingId: null,
    hoveredBuildingId: null,
    hoveredTile: null,
    showFlowLines: true,
    showProfiler: false,
    notice: null,
  },

  setSim: (sim) => set({ sim }),

  // Called by the loop on its own cadence, never by a component.
  publishSnapshot: () => set({ ui: projectSnapshot(get().sim) }),

  setSpeed: (speed) => set((state) => ({ interaction: { ...state.interaction, speed } })),

  setBuildMode: (kind) =>
    set((state) => ({
      // Entering build mode clears the selection: the inspector and the ghost compete for
      // the same click, and one of them has to win explicitly.
      interaction: {
        ...state.interaction,
        buildMode: kind,
        selectedBuildingId: kind === null ? state.interaction.selectedBuildingId : null,
        notice: null,
      },
    })),

  selectBuilding: (id) =>
    set((state) => ({
      interaction: { ...state.interaction, selectedBuildingId: id, buildMode: null },
    })),

  setHoveredBuilding: (id) =>
    set((state) =>
      state.interaction.hoveredBuildingId === id
        ? state
        : { interaction: { ...state.interaction, hoveredBuildingId: id } },
    ),

  setHoveredTile: (key) =>
    set((state) =>
      state.interaction.hoveredTile === key
        ? state
        : { interaction: { ...state.interaction, hoveredTile: key } },
    ),

  toggleFlowLines: () =>
    set((state) => ({
      interaction: { ...state.interaction, showFlowLines: !state.interaction.showFlowLines },
    })),

  toggleProfiler: () =>
    set((state) => ({
      interaction: { ...state.interaction, showProfiler: !state.interaction.showProfiler },
    })),

  setNotice: (notice) => set((state) => ({ interaction: { ...state.interaction, notice } })),
}));

/** Imperative read for the render loop; deliberately not a hook. */
export function readSim(): SimState {
  return useStore.getState().sim;
}
