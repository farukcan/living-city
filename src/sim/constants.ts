/**
 * Every tuning number in the simulation, mirroring docs/SPEC-02-buildings.md.
 *
 * If a value changes it changes in the spec first, then here. Nothing else in `src/`
 * should contain a balance number.
 */

import type { BuildingDefinition, BuildingKind, GraceResource, ResourceKind } from './types.ts';

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Wall-clock seconds per sol at 1x speed. */
export const SECONDS_PER_SOL = 60;
/** A real Martian sol, used to convert kW into kWh. */
export const HOURS_PER_SOL = 24.66;
export const TICK_SECONDS = 0.1;
export const SPEEDS = [0, 1, 4, 16] as const;
export type Speed = (typeof SPEEDS)[number];

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export const TEMP_DAY = -20;
export const TEMP_NIGHT = -80;
export const TARGET_TEMP = 20;

// ---------------------------------------------------------------------------
// Population
// ---------------------------------------------------------------------------

export const PER_CAPITA_CONSUMPTION: Readonly<Record<'oxygen' | 'water' | 'food', number>> = {
  oxygen: 0.85,
  water: 4,
  food: 1.8,
};

/** Sols a colony survives without each resource before deaths begin. Oxygen has none. */
export const GRACE_SOLS: Readonly<Record<GraceResource, number>> = {
  water: 3,
  food: 7,
};

/**
 * Fraction of a sol of deprivation unwound per sol of relief. Below 1 so a colony that
 * scrapes through one drought carries the debt into the next — repeated shortages compound
 * rather than being wiped by a single good sol.
 */
export const DEPRIVATION_RECOVERY_RATE = 0.25;

/**
 * Sols past the deadline at which the death rate stops accelerating. Bounding the timer
 * bounds the rate, which is what keeps the population arithmetic from going negative and
 * stops a colony that survived a long drought from being erased instantly by the next one.
 */
export const DEATH_RAMP_SOLS = 5;

/** Added to the death-rate multiplier per sol past the deadline. */
export const DEATH_ACCELERATION = 3;

/** Fraction lost per sol at the moment a grace period expires; it climbs from here. */
export const DEATH_RATE_PER_SOL = 0.02;
export const MIN_VIABLE_POPULATION = 0;

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export const BASE_CAPS: Readonly<Record<ResourceKind, number>> = {
  power: 100,
  oxygen: 100,
  water: 500,
  food: 200,
  minerals: 200,
};

/** Per battery bank. Rate limits are why one bank cannot carry a colony through a night. */
export const CHARGE_MAX_KW = 100;
export const DISCHARGE_MAX_KW = 120;

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------

export const DEMOLISH_REFUND_RATE = 0.5;
export const REPAIR_COST_RATE = 0.3;

// ---------------------------------------------------------------------------
// Survival score
// ---------------------------------------------------------------------------

export const SURVIVAL_HORIZON_SOLS = 30;
/**
 * Days-of-supply is capped before it reaches the score curve, so an unbounded surplus tops
 * out around 95 rather than a clean 100. A colony one meteor from disaster is not safe,
 * and a gauge pinned at 100 stops telling the player anything.
 */
export const SURVIVAL_CAP_SOLS = 90;
export const HISTORY_SOLS = 120;

/** Resources whose exhaustion kills people. */
export const LIFE_CRITICAL: readonly ResourceKind[] = ['oxygen', 'water', 'food'] as const;

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

export const BUILDING_DEFINITIONS: Readonly<Record<BuildingKind, BuildingDefinition>> = {
  solarArray: {
    kind: 'solarArray',
    label: 'Solar Array',
    description: 'Generates power from sunlight. Produces nothing at night.',
    cost: 20,
    tier: 0,
    basePowerKW: 0,
    insulation: 0,
    produces: {},
    consumes: {},
    requiresDeposit: null,
    capacityBonus: {},
    populationCapacity: 0,
    solarPeakKW: 60,
    buildable: true,
  },
  batteryBank: {
    kind: 'batteryBank',
    label: 'Battery Bank',
    description: 'Stores surplus power for the night. Charge and discharge are rate-limited.',
    cost: 30,
    tier: 0,
    basePowerKW: 0,
    insulation: 0.02,
    produces: {},
    consumes: {},
    requiresDeposit: null,
    capacityBonus: { power: 400 },
    populationCapacity: 0,
    solarPeakKW: 0,
    buildable: true,
  },
  habitat: {
    kind: 'habitat',
    label: 'Habitat',
    description: 'Houses ten colonists. Life support has first claim on power.',
    cost: 60,
    tier: 1,
    basePowerKW: 5,
    insulation: 0.12,
    produces: {},
    consumes: {},
    requiresDeposit: null,
    capacityBonus: {},
    populationCapacity: 10,
    solarPeakKW: 0,
    buildable: true,
  },
  iceExtractor: {
    kind: 'iceExtractor',
    label: 'Ice Extractor',
    description: 'Melts subsurface ice into water. Must stand on an ice deposit.',
    cost: 35,
    tier: 2,
    basePowerKW: 14,
    insulation: 0.03,
    produces: { water: 120 },
    consumes: {},
    requiresDeposit: 'ice',
    capacityBonus: {},
    populationCapacity: 0,
    solarPeakKW: 0,
    buildable: true,
  },
  electrolyzer: {
    kind: 'electrolyzer',
    label: 'Electrolyzer',
    description: 'Splits water into breathable oxygen.',
    cost: 40,
    tier: 2,
    basePowerKW: 8,
    insulation: 0.04,
    produces: { oxygen: 12 },
    consumes: { water: 15 },
    requiresDeposit: null,
    capacityBonus: {},
    populationCapacity: 0,
    solarPeakKW: 0,
    buildable: true,
  },
  greenhouse: {
    kind: 'greenhouse',
    label: 'Greenhouse',
    description: 'Grows food and releases oxygen. All that glass is expensive to heat.',
    cost: 50,
    tier: 3,
    basePowerKW: 10,
    insulation: 0.15,
    produces: { food: 20, oxygen: 6 },
    consumes: { water: 60 },
    requiresDeposit: null,
    capacityBonus: {},
    populationCapacity: 0,
    solarPeakKW: 0,
    buildable: true,
  },
  mine: {
    kind: 'mine',
    label: 'Mine',
    description: 'Extracts minerals for construction. Must stand on an ore deposit.',
    cost: 45,
    tier: 4,
    basePowerKW: 12,
    insulation: 0.03,
    produces: { minerals: 30 },
    consumes: {},
    requiresDeposit: 'ore',
    capacityBonus: {},
    populationCapacity: 0,
    solarPeakKW: 0,
    buildable: true,
  },
  storageDepot: {
    kind: 'storageDepot',
    label: 'Storage Depot',
    description: 'Raises storage caps so surplus production stops going to waste.',
    cost: 25,
    tier: 0,
    basePowerKW: 0,
    insulation: 0.05,
    produces: {},
    consumes: {},
    requiresDeposit: null,
    capacityBonus: { water: 2000, oxygen: 300, food: 600, minerals: 500 },
    populationCapacity: 0,
    solarPeakKW: 0,
    buildable: true,
  },
  rocketPad: {
    kind: 'rocketPad',
    label: 'Landing Pad',
    description: 'Crew rockets land here every seven sols. There is only ever one.',
    cost: 0,
    tier: 0,
    basePowerKW: 0,
    // Deliberately inert. A pad that drew power or heat would invalidate every measured
    // figure in the balance tables for a fixture the player cannot even choose to build.
    insulation: 0,
    produces: {},
    consumes: {},
    requiresDeposit: null,
    capacityBonus: {},
    populationCapacity: 0,
    solarPeakKW: 0,
    buildable: false,
  },
};

// ---------------------------------------------------------------------------
// Win condition
// ---------------------------------------------------------------------------

/** Sols survived, habitats standing, and colonists alive required to win the colony. */
export const WIN_SOLS = 60;
export const WIN_HABITATS = 15;
export const WIN_POPULATION = 150;

export const BUILDING_KINDS = Object.keys(BUILDING_DEFINITIONS) as readonly BuildingKind[];

/** What the build bar offers. Fixtures the colony is issued are excluded. */
export const BUILDABLE_KINDS: readonly BuildingKind[] = BUILDING_KINDS.filter(
  (kind) => BUILDING_DEFINITIONS[kind].buildable,
);

export function definitionOf(kind: BuildingKind): BuildingDefinition {
  return BUILDING_DEFINITIONS[kind];
}

// ---------------------------------------------------------------------------
// Starting colony
// ---------------------------------------------------------------------------

export const STARTING_POPULATION = 6;

export const STARTING_STOCKS: Readonly<Record<ResourceKind, number>> = {
  power: 900,
  oxygen: 60,
  water: 350,
  food: 120,
  minerals: 150,
};

/**
 * Counts, not positions: placement depends on where the seed put its deposits, so the
 * layout is resolved at colony creation time.
 */
export const STARTING_BUILDINGS: readonly (readonly [BuildingKind, number])[] = [
  ['solarArray', 5],
  ['batteryBank', 3],
  ['habitat', 1],
  ['iceExtractor', 1],
  ['electrolyzer', 1],
  ['greenhouse', 1],
  ['mine', 1],
  // Last, so the distance-from-origin sort puts the pad on the outer edge of the cluster
  // rather than among the habitats a rocket would be landing on top of.
  ['rocketPad', 1],
] as const;
