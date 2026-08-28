import { useEffect } from 'react';
import { Scene } from './render/Scene.tsx';
import { BuildingStudio, type StudioBuildingKind } from './render/BuildingStudio.tsx';
import { startLoop } from './state/loop.ts';
import { useStore } from './state/store.ts';
import { CriticalWarnings, OutageAlert } from './ui/Alerts.tsx';
import { BuildBar } from './ui/BuildBar.tsx';
import { EventToast } from './ui/EventToast.tsx';
import { GameOverOverlay } from './ui/GameOverOverlay.tsx';
import { HoverCard } from './ui/HoverCard.tsx';
import { InspectorPanel } from './ui/InspectorPanel.tsx';
import { DesktopNotice, Onboarding } from './ui/Onboarding.tsx';
import { ProfilerPanel } from './ui/ProfilerPanel.tsx';
import { QuestPanel } from './ui/QuestPanel.tsx';
import { Sparkline } from './ui/Sparkline.tsx';
import { StatusPanel } from './ui/StatusPanel.tsx';
import { TopBar } from './ui/TopBar.tsx';
import { TutorialCard } from './ui/tutorial/TutorialCard.tsx';
import { startTutorialWatcher } from './ui/tutorial/watcher.ts';
import { COLUMN_WIDTH } from './ui/panel.ts';

export function App() {
  const params = new URLSearchParams(window.location.search);
  const studioBuilding = params.get('building') as StudioBuildingKind | null;

  // One rAF chain for the lifetime of the app; the loop owns simulation cadence. The
  // tutorial watcher rides the snapshots that loop publishes, so the two share a lifetime.
  useEffect(() => {
    if (studioBuilding) return;
    const stopLoop = startLoop();
    const stopWatcher = startTutorialWatcher();
    return () => {
      stopWatcher();
      stopLoop();
    };
  }, [studioBuilding]);

  // Escape is the universal "stop what I'm doing": it clears placement, then selection.
  // F3 toggles the frame profiler, following the convention players already know.
  useEffect(() => {
    if (studioBuilding) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F3') {
        // Firefox binds F3 to find-again, which would steal focus from the canvas.
        event.preventDefault();
        useStore.getState().toggleProfiler();
        return;
      }
      if (event.key !== 'Escape') return;
      const store = useStore.getState();
      if (store.interaction.buildMode !== null) store.setBuildMode(null);
      else store.selectBuilding(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [studioBuilding]);

  if (studioBuilding) {
    return <BuildingStudio kind={studioBuilding} />;
  }

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-[#1A1626]">
      <Scene />

      {/* The HUD is a stack of full-width rows, not a pile of hand-placed layers: the
          readout strip, an alarm row, a middle band that takes whatever is left, and the
          build bar. Nothing is offset by a hardcoded `top-*`, so a strip that wraps onto a
          second line pushes everything below it down instead of being covered. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <TopBar />

        {/* Alarms get their own row directly under the readings they contradict, centred on
            the viewport rather than on whatever the side columns leave over. */}
        <div className="flex shrink-0 flex-col items-center gap-2 px-3">
          <OutageAlert />
          <CriticalWarnings />
          <EventToast />
        </div>

        <div className="flex min-h-0 flex-1 gap-2 p-3">
          {/* Left: what the player opened, with the profiler pinned to the foot. */}
          <div className={`flex min-h-0 shrink-0 flex-col gap-2 ${COLUMN_WIDTH}`}>
            <InspectorPanel />
            <Onboarding />
            <TutorialCard />
            <div className="mt-auto">
              <ProfilerPanel />
            </div>
          </div>

          {/* The world keeps the middle. Nothing is allowed to float over it. */}
          <div className="flex-1" />

          {/* Right: how the run is going, what it is aiming at, and the readouts. */}
          <div className={`flex min-h-0 shrink-0 flex-col items-end gap-2 ${COLUMN_WIDTH}`}>
            <StatusPanel />
            <div className="my-auto w-full">
              <QuestPanel />
            </div>
            <HoverCard />
            <div className="pointer-events-auto w-full">
              <Sparkline />
            </div>
          </div>
        </div>

        <BuildBar />
      </div>

      <DesktopNotice />

      {/* Last, so the ending covers everything. */}
      <GameOverOverlay />
    </div>
  );
}
