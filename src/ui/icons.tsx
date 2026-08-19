import type { ReactElement } from 'react';
import type { BuildingKind, ResourceKind } from '../sim/types.ts';

/**
 * Inline SVG iconography.
 *
 * Hand-drawn rather than pulled from an icon set for the same reason the 3D is procedural:
 * no asset files, no licence to track, and every glyph can echo the shape of the thing it
 * labels — the building icons are miniatures of their own silhouettes, so the bar reads as
 * a catalogue of what is on the map.
 *
 * All icons draw on a 24×24 grid and inherit `currentColor` unless they carry a meaning
 * colour of their own.
 */

type IconProps = {
  className?: string | undefined;
};

function Svg({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? 'h-4 w-4'}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export function PowerIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function OxygenIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="9" cy="12" r="5.5" />
      <path d="M17 9.5v5M15.5 12h3" />
    </Svg>
  );
}

export function WaterIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M12 3c3.5 4.6 6 7.9 6 10.6A6 6 0 0 1 6 13.6C6 10.9 8.5 7.6 12 3Z"
        fill="currentColor"
        stroke="none"
      />
    </Svg>
  );
}

export function FoodIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 21V9" />
      <path d="M12 9c0-3 2-5.5 5-6 .3 3.2-1.6 5.7-5 6Z" fill="currentColor" stroke="none" />
      <path
        d="M12 13c-3.2-.3-5.2-2.5-5-5.5 2.9.5 4.8 2.6 5 5.5Z"
        fill="currentColor"
        stroke="none"
      />
    </Svg>
  );
}

export function MineralIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3 20 9l-3 11H7L4 9l8-6Z" />
      <path d="M8.5 9h7l-3.5 11" />
    </Svg>
  );
}

export function HeatIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3c2.5 3 4 5.4 4 7.5a4 4 0 0 1-8 0C8 8.4 9.5 6 12 3Z" />
      <path d="M12 21v-4" />
    </Svg>
  );
}

export const RESOURCE_ICONS: Readonly<Record<ResourceKind, (props: IconProps) => ReactElement>> = {
  power: PowerIcon,
  oxygen: OxygenIcon,
  water: WaterIcon,
  food: FoodIcon,
  minerals: MineralIcon,
};

/** Colour each resource is identified by, matching the flow packets in the 3D scene. */
export const RESOURCE_COLORS: Readonly<Record<ResourceKind, string>> = {
  power: '#FFB74D',
  oxygen: '#FFFFFF',
  water: '#6FB0F0',
  food: '#8BC34A',
  minerals: '#C9A227',
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** A pressure-suit helmet: the crew readout, and the only figure in the interface. */
export function CrewIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? 'h-9 w-9'} aria-hidden>
      <circle cx="12" cy="12" r="9.2" fill="#E8E4DE" />
      <circle cx="12" cy="12" r="9.2" fill="none" stroke="#9AA0A6" strokeWidth="1.2" />
      <path d="M5.6 11.8a6.6 6.6 0 0 1 12.8 0 6.6 6.6 0 0 1-12.8 0Z" fill="#1E2A38" />
      {/* Visor highlight — the detail that makes it read as glass rather than a hole. */}
      <path d="M8 9.4c1.6-1.4 4-1.9 6-1.2-2.1.1-4.2.8-6 1.2Z" fill="#8FE3F5" opacity="0.85" />
      <rect x="2.4" y="10.4" width="2.2" height="3.2" rx="0.8" fill="#9AA0A6" />
      <rect x="19.4" y="10.4" width="2.2" height="3.2" rx="0.8" fill="#9AA0A6" />
    </svg>
  );
}

export function HeartIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M12 20.3 4.7 13a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8A4.6 4.6 0 1 1 19.3 13L12 20.3Z"
        fill="currentColor"
        stroke="none"
      />
    </Svg>
  );
}

export function SunIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </Svg>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
        fill="currentColor"
        stroke="none"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Buildings — miniatures of the 3D silhouettes
// ---------------------------------------------------------------------------

function SolarArrayIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 14.5 6 7h12l3 7.5H3Z" fill="#6FA6DC" stroke="#9AA0A6" />
      <path
        d="M8.4 7 7 14.5M12 7v7.5M15.6 7l1.4 7.5M4.6 11h14.8"
        stroke="#2E4A6B"
        strokeWidth="1"
      />
      <path d="M12 14.5V20M9 20h6" />
    </Svg>
  );
}

function BatteryBankIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="7" width="17" height="11" rx="1.6" fill="#5A5F66" stroke="#9AA0A6" />
      <path d="M7 7V4.5M17 7V4.5" />
      <path d="M12.8 9.5 10 13.6h2.4L11.8 16l3-4.2h-2.4l.4-2.3Z" fill="#F0B94A" stroke="none" />
    </Svg>
  );
}

function HabitatIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.5 18a8.5 8.5 0 0 1 17 0Z" fill="#D8D4CC" stroke="#9AA0A6" />
      <path
        d="M12 9.5V18M6.2 13.2h11.6M8.6 10.6 15.4 18M15.4 10.6 8.6 18"
        stroke="#9AA0A6"
        strokeWidth="0.9"
      />
      <rect x="10.4" y="14.4" width="3.2" height="3.6" fill="#8FE3F5" stroke="none" />
      <path d="M2 18h20" />
    </Svg>
  );
}

function IceExtractorIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3v13" />
      <path d="M8.5 6.5 12 8l3.5-1.5M8.5 11 12 12.5l3.5-1.5" />
      <path d="M6.5 16h11l-1.2 4H7.7l-1.2-4Z" fill="#6FD3F0" stroke="#9AA0A6" />
    </Svg>
  );
}

function ElectrolyzerIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4.5" y="7" width="5.5" height="13" rx="2.4" fill="#D8D4CC" stroke="#9AA0A6" />
      <rect x="14" y="7" width="5.5" height="13" rx="2.4" fill="#D8D4CC" stroke="#9AA0A6" />
      <path d="M10 11h4M12 7V4" />
      <circle cx="12" cy="3.4" r="1.4" fill="#59D4F0" stroke="none" />
    </Svg>
  );
}

function GreenhouseIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.5 19v-5.5a8.5 8.5 0 0 1 17 0V19Z" fill="#9FD8E8" stroke="#9AA0A6" opacity="0.9" />
      <path d="M12 8v11M7.4 10.4V19M16.6 10.4V19" stroke="#9AA0A6" strokeWidth="0.9" />
      <path d="M2.5 19h19" />
      <path d="M9 16.5c0-1.4.9-2.4 2.2-2.6M15 16.5c0-1.4-.9-2.4-2.2-2.6" stroke="#5FA845" />
    </Svg>
  );
}

function MineIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 20 14.5 9.5" />
      <path
        d="M9.5 4.5c3.5-1.2 7.2-.4 9.6 2.1 2.4 2.4 3.2 6 2.1 9.5-2-2.9-4-5.2-5.9-7-1.8-1.9-4-3.7-5.8-4.6Z"
        fill="#C9A227"
        stroke="none"
      />
      <path d="M3 21.5 6 18.5" strokeWidth="2.4" />
    </Svg>
  );
}

function StorageDepotIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="9" width="7" height="11" rx="1.2" fill="#D8D4CC" stroke="#9AA0A6" />
      <rect x="13.5" y="9" width="7" height="11" rx="1.2" fill="#D8D4CC" stroke="#9AA0A6" />
      <path d="M3.5 12.5h7M13.5 12.5h7" strokeWidth="1" />
      <rect x="8.5" y="4" width="7" height="4.5" rx="1" fill="#D8A13C" stroke="#9AA0A6" />
    </Svg>
  );
}

/** Also stands in for the crew-arrival toast, which is the same event from the HUD's side. */
export function RocketIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path
        d="M12 2c2.6 2.3 4 5.6 4 9.2V15H8v-3.8C8 7.6 9.4 4.3 12 2Z"
        fill="#D8D4CC"
        stroke="#9AA0A6"
      />
      <circle cx="12" cy="9" r="1.8" fill="#8FE3F5" stroke="#9AA0A6" strokeWidth="1" />
      <path d="M8 12 5 15.5V18l3-1.6ZM16 12l3 3.5V18l-3-1.6Z" fill="#6E7378" stroke="none" />
      <path d="M10.2 15h3.6l-1.8 5Z" fill="#F0B94A" stroke="none" />
    </Svg>
  );
}

export const BUILDING_ICONS: Readonly<Record<BuildingKind, (props: IconProps) => ReactElement>> = {
  solarArray: SolarArrayIcon,
  batteryBank: BatteryBankIcon,
  habitat: HabitatIcon,
  iceExtractor: IceExtractorIcon,
  electrolyzer: ElectrolyzerIcon,
  greenhouse: GreenhouseIcon,
  mine: MineIcon,
  storageDepot: StorageDepotIcon,
  rocketPad: RocketIcon,
};

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export function DustStormIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h9" />
    </Svg>
  );
}

export function MeteorIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="16" cy="8" r="3.6" fill="currentColor" stroke="none" />
      <path d="M11.5 12.5 3 21M13.5 6 8 4M10 15.5 5.5 17" />
    </Svg>
  );
}

export function LeakIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.5 21.5 20H2.5L12 3.5Z" />
      <path d="M12 10v4.5M12 17.4v.2" strokeWidth="2" />
    </Svg>
  );
}

export function SupplyDropIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 11.5 12 3l6 8.5" />
      <rect
        x="7.5"
        y="11.5"
        width="9"
        height="9"
        rx="1.2"
        fill="currentColor"
        stroke="none"
        opacity="0.85"
      />
    </Svg>
  );
}
