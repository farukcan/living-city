import { useEffect } from 'react';
import { Scene } from './render/Scene.tsx';
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
import { TopBar } from './ui/TopBar.tsx';

export function App() {
  // One rAF chain for the lifetime of the app; the loop owns simulation cadence.
  useEffect(() => startLoop(), []);

  // Escape is the universal "stop what I'm doing": it clears placement, then selection.
  // F3 toggles the frame profiler, following the convention players already know.
  useEffect(() => {
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
  }, []);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-[#1A1626]">
      <Scene />
      <TopBar />
      <EventToast />
      <CriticalWarnings />

      <div className="pointer-events-none absolute left-3 top-28 flex flex-col gap-2">
        <InspectorPanel />
        <Onboarding />
      </div>

      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
        <QuestPanel />
      </div>

      <DesktopNotice />

      <div className="pointer-events-none absolute bottom-28 left-3">
        <ProfilerPanel />
      </div>

      <div className="pointer-events-none absolute bottom-28 right-3 flex flex-col items-end gap-2">
        <HoverCard />
        <div className="pointer-events-auto">
          <Sparkline />
        </div>
      </div>

      <BuildBar />

      {/* Last, so the outage banner covers the TopBar and the ending covers everything. */}
      <OutageAlert />
      <GameOverOverlay />
    </div>
  );
}
