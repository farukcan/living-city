/**
 * Plain-data types for the simulation.
 *
 * Everything here must be JSON-serializable: no classes, no Map, no Set, no functions.
 * That constraint is what makes SimState trivially persistable and structurally
 * comparable in tests (docs/SPEC-01-simulation.md).
 */

import type { AxialKey } from './hex.ts';
import type { RngState } from './rng.ts';

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export type DepositKind = 'none' | 'ice' | 'ore';

export type Tile = {
  readonly q: number;
  readonly r: number;
  /** Normalised 0..1; world height is `elevation × MAX_ELEVATION`. */
  readonly elevation: number;
  readonly deposit: DepositKind;
  /**
   * True when the slope to any neighbour exceeds SLOPE_LIMIT. Marks the tile with boulders
   * and keeps deposits off it; it does not block placement.
   */
  readonly steep: boolean;
  readonly buildingId: string | null;
};

export type TerrainField = {
  readonly seed: number;
  readonly radius: number;
  readonly tiles: readonly Tile[];
  /** Maps `"q,r"` to an index into `tiles`. Axial grids are not rectangular. */
  readonly indexByKey: Readonly<Record<AxialKey, number>>;
};

// ---------------------------------------------------------------------------
// Resources and buildings
// ---------------------------------------------------------------------------

/**
 * Heat is deliberately absent: it is not stored or traded, it is a power demand computed
 * from ambient temperature. Modelling it as a stock would imply a buffer that does not
 * exist (docs/SPEC-02-buildings.md).
 */
export type ResourceKind = 'power' | 'oxygen' | 'water' | 'food' | 'minerals';

export const RESOURCE_KINDS: readonly ResourceKind[] = [
  'power',
  'oxygen',
  'water',
  'food',
  'minerals',
] as const;

export type ResourceAmounts = Readonly<Partial<Record<ResourceKind, number>>>;

export type BuildingKind =
  | 'solarArray'
  | 'batteryBank'
  | 'habitat'
  | 'iceExtractor'
  | 'electrolyzer'
  | 'greenhouse'
  | 'mine'
  | 'storageDepot'
  | 'rocketPad';

export type BuildingStatus = 'active' | 'idle' | 'damaged';

export type Building = {
  readonly id: string;
  readonly kind: BuildingKind;
  readonly q: number;
  readonly r: number;
  readonly status: BuildingStatus;
};

/**
 * Power priority tier. Lower numbers are served first; tier 0 means the building draws no
 * operating power at all (it may still draw heat).
 */
export type PowerTier = 0 | 1 | 2 | 3 | 4;

export type BuildingDefinition = {
  readonly kind: BuildingKind;
  readonly label: string;
  readonly description: string;
  readonly cost: number;
  readonly tier: PowerTier;
  /** Operating draw at full efficiency, excluding heating. */
  readonly basePowerKW: number;
  /** kW per °C of difference between the interior setpoint and ambient. */
  readonly insulation: number;
  /** Output per sol at full efficiency. Solar is the exception; see `solarPeakKW`. */
  readonly produces: ResourceAmounts;
  readonly consumes: ResourceAmounts;
  readonly requiresDeposit: DepositKind | null;
  /** Added to storage caps while the building stands, regardless of status. */
  readonly capacityBonus: ResourceAmounts;
  readonly populationCapacity: number;
  /** Peak output in full sun. Zero for everything that is not a solar array. */
  readonly solarPeakKW: number;
  /**
   * Whether the player may place, idle or demolish this kind. False marks a fixture the
   * colony is issued rather than builds — it stays out of the build bar and out of every
   * user action, so the simulation can rely on it existing exactly once.
   */
  readonly buildable: boolean;
};

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * `crewArrival` is a notice, not a random event: it fires off the landing schedule and must
 * never appear in EVENT_WEIGHTS (docs/SPEC-06-events.md).
 */
export type EventKind = 'dustStorm' | 'meteorStrike' | 'oxygenLeak' | 'supplyDrop' | 'crewArrival';

/** Only durational events are stored; instant ones mutate the colony and vanish. */
export type ActiveEvent = {
  readonly kind: 'dustStorm' | 'oxygenLeak';
  readonly solsRemaining: number;
};

export type EventNotice = {
  readonly kind: EventKind;
  readonly sol: number;
  readonly started: boolean;
};

// ---------------------------------------------------------------------------
// Derived per-tick report
// ---------------------------------------------------------------------------

export type Environment = {
  /** 0 at night, 1 with the sun overhead. */
  readonly sunIntensity: number;
  readonly ambientTemp: number;
  /** Multiplier on solar output; 1 in clear weather. */
  readonly dustFactor: number;
};

export type ResourceReport = {
  readonly stock: number;
  readonly cap: number;
  /** Rates per sol, except power which is in kW. */
  readonly production: number;
  readonly consumption: number;
  readonly net: number;
  /** Production that could not be stored because the cap was reached. */
  readonly wasted: number;
};

export type PowerReport = {
  readonly supplyKW: number;
  readonly demandKW: number;
  readonly heatDemandKW: number;
  readonly batteryChargeKW: number;
  readonly batteryDischargeKW: number;
  readonly wastedKW: number;
  /** True when tier 1 could not be fully served — the colony is losing life support. */
  readonly lifeSupportDeficit: boolean;
  /**
   * True when the battery is empty and live solar cannot cover demand. The grid has
   * collapsed rather than browned out, and every producer is stopped.
   */
  readonly outage: boolean;
};

/**
 * Everything the UI reads. Rebuilt every tick so the HUD never recomputes flows, and
 * cached on the state so a render can read a consistent snapshot.
 */
export type TickReport = {
  readonly environment: Environment;
  readonly resources: Readonly<Record<ResourceKind, ResourceReport>>;
  readonly power: PowerReport;
  /**
   * A run flag per building id, exactly 0 or 1 — production is all-or-nothing. A building
   * served short of its full request produces nothing rather than a fraction. Idle and
   * damaged buildings report 0.
   */
  readonly efficiencyById: Readonly<Record<string, number>>;
  readonly populationCapacity: number;
  readonly survivalScore: number;
  /** Sols of supply remaining for the scarcest life-critical resource. */
  readonly worstDaysLeft: number;
};

// ---------------------------------------------------------------------------
// Simulation state
// ---------------------------------------------------------------------------

/** Life-critical resources a colony can survive the loss of for a while. Oxygen is not one. */
export type GraceResource = 'water' | 'food';

export const GRACE_RESOURCES: readonly GraceResource[] = ['water', 'food'] as const;

/**
 * Sols of unbroken deprivation, one per resource that has a grace period.
 *
 * Sticky across ticks and across saves. This cannot live on TickReport: the report is
 * rebuilt from scratch every tick, and the loop chains up to 40 ticks between publishes.
 * Relief does not reset the clock, it unwinds it slowly, so repeated shortages compound.
 */
export type DeprivationTimers = Readonly<Record<GraceResource, number>>;

/** Set once and never cleared: a colony that has ended stays ended, reload included. */
export type GameOver = {
  readonly sol: number;
  readonly cause: 'oxygen' | 'depopulated' | 'victory';
};

export type HistorySample = {
  readonly sol: number;
  readonly power: number;
  readonly oxygen: number;
  readonly water: number;
  readonly food: number;
  readonly population: number;
  readonly survivalScore: number;
};

export type SimState = {
  readonly seed: number;
  readonly rngState: RngState;
  /** Position within the current sol, 0..1. */
  readonly solTime: number;
  readonly sol: number;
  readonly terrain: TerrainField;
  readonly buildings: readonly Building[];
  /** Monotonic id source. Reusing `buildings.length` would collide after a demolition. */
  readonly nextBuildingId: number;
  readonly stocks: Readonly<Record<ResourceKind, number>>;
  /** Fractional internally; rounded only for display. */
  readonly population: number;
  readonly deprivation: DeprivationTimers;
  /**
   * Colonists lost during the current sol and during the one before it.
   *
   * Two buckets rather than a rolling window: the HUD only ever asks for a trailing-sol
   * toll, and rolling one bucket at the sol boundary costs two numbers instead of a ring
   * buffer. Not saved, for the same reason `history` is not — a toll that covers one sol is
   * worth nothing by the time a save is reopened.
   */
  readonly deathsThisSol: number;
  readonly deathsPreviousSol: number;
  /** Null while the colony lives. Once set, the simulation stops advancing. */
  readonly gameOver: GameOver | null;
  readonly activeEvents: readonly ActiveEvent[];
  /** Events that fired this tick, for the UI to turn into toasts. */
  readonly notices: readonly EventNotice[];
  readonly history: readonly HistorySample[];
  readonly report: TickReport;
};
