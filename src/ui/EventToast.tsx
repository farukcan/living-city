import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { EventKind, EventNotice } from '../sim/types.ts';
import { useStore } from '../state/store.ts';
import { DustStormIcon, LeakIcon, MeteorIcon, RocketIcon, SupplyDropIcon } from './icons.tsx';

/**
 * Event notifications. See docs/SPEC-06-events.md.
 *
 * Toasts queue rather than stack: at 16x two events can fire within a second of wall time,
 * and a pile of overlapping cards is unreadable.
 */

type Presentation = {
  readonly Icon: (props: { className?: string | undefined }) => ReactElement;
  readonly title: string;
  readonly startedLine: string;
  readonly endedLine: string;
  readonly hostile: boolean;
};

const PRESENTATION: Readonly<Record<EventKind, Presentation>> = {
  dustStorm: {
    Icon: DustStormIcon,
    title: 'Dust Storm',
    startedLine: 'Solar output down 70%.',
    endedLine: 'The sky is clearing.',
    hostile: true,
  },
  meteorStrike: {
    Icon: MeteorIcon,
    title: 'Meteor Strike',
    startedLine: 'A building is offline until repaired.',
    endedLine: '',
    hostile: true,
  },
  oxygenLeak: {
    Icon: LeakIcon,
    title: 'Oxygen Leak',
    startedLine: 'Losing 8 kg of oxygen per sol.',
    endedLine: 'The leak is sealed.',
    hostile: true,
  },
  supplyDrop: {
    Icon: SupplyDropIcon,
    title: 'Supply Drop',
    startedLine: '+80 minerals, +40 food.',
    endedLine: '',
    hostile: false,
  },
  // Friendly styling, but every landing is more mouths than the last. The colony finds that
  // out from the crew readout, not from a toast that lies about it.
  crewArrival: {
    Icon: RocketIcon,
    title: 'Crew Landing',
    startedLine: 'New colonists are aboard.',
    endedLine: '',
    hostile: false,
  },
};

const VISIBLE_MS = 6000;

type QueuedToast = {
  readonly id: number;
  readonly kind: EventKind;
  readonly started: boolean;
};

export function EventToast() {
  const notices = useStore((state) => state.sim.notices);
  const [toasts, setToasts] = useState<readonly QueuedToast[]>([]);
  const nextId = useRef(1);
  const consumed = useRef<readonly EventNotice[] | null>(null);

  // Copy notices into a local queue. `sim.notices` lasts one tick; tying the dismiss
  // timer to that array cancelled it on the next empty tick and left every toast stuck.
  useEffect(() => {
    if (notices.length === 0) return;
    if (notices === consumed.current) return;
    consumed.current = notices;

    const queued = notices.map((notice) => ({
      id: nextId.current++,
      kind: notice.kind,
      started: notice.started,
    }));
    setToasts((current) => [...current, ...queued]);
  }, [notices]);

  const front = toasts[0];
  const frontId = front?.id;

  useEffect(() => {
    if (frontId === undefined) return undefined;
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== frontId));
    }, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [frontId]);

  if (front === undefined) return null;

  const presentation = PRESENTATION[front.kind];
  const line = front.started ? presentation.startedLine : presentation.endedLine;
  const hostile = presentation.hostile && front.started;

  return (
    <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2">
      <div
        className={`flex items-center gap-2.5 rounded-md border px-3 py-2 backdrop-blur-sm ${
          hostile
            ? 'border-[#EF5350]/45 bg-[#EF5350]/15'
            : 'border-[#4FC3F7]/40 bg-[#4FC3F7]/12'
        }`}
      >
        <presentation.Icon className="h-5 w-5 shrink-0" />
        <div>
          <div className="text-xs text-white/90">
            {presentation.title}
            {!front.started && <span className="text-white/45"> ended</span>}
          </div>
          {line !== '' && <div className="text-[11px] text-white/55">{line}</div>}
        </div>
      </div>
    </div>
  );
}

/** Persistent badge for events that last, shown while one is running. */
export function ActiveEventBadges() {
  const activeEvents = useStore((state) => state.ui.activeEvents);
  if (activeEvents.length === 0) return null;

  return (
    <div className="flex gap-1.5">
      {activeEvents.map((event) => (
        <div
          key={event.kind}
          className="flex items-center gap-1.5 rounded-md border border-[#EF5350]/40 bg-[#EF5350]/15 px-2 py-1"
        >
          {(() => {
            const { Icon } = PRESENTATION[event.kind];
            return <Icon className="h-3.5 w-3.5 shrink-0" />;
          })()}
          <span className="text-[10px] text-white/80">{PRESENTATION[event.kind].title}</span>
          <span className="font-mono text-[10px] tabular-nums text-white/50">
            {event.solsRemaining.toFixed(1)}s
          </span>
        </div>
      ))}
    </div>
  );
}
