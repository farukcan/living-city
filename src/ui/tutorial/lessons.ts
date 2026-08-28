/**
 * The tutorial's entire content and trigger table. See docs/SPEC-07-tutorial.md.
 *
 * Every lesson is a predicate over the 4 Hz `UiSnapshot` plus the copy to show when it holds.
 * The predicates are pure functions of a plain context object, which is what lets the whole
 * table be tested without a store, a renderer or a running colony.
 *
 * Order in `TUTORIAL_LESSONS` *is* the priority: the array is authored most-lethal-first and
 * `nextLesson` returns the first match. There is no separate priority field to drift out of
 * sync with the order the reader sees.
 */

import { BUILDABLE_KINDS, definitionOf } from '../../sim/constants.ts';
import type { BuildingKind } from '../../sim/types.ts';
import type { UiSnapshot } from '../../state/snapshot.ts';

export type TutorialLessonId =
  | 'oxygenCritical'
  | 'gridOutage'
  | 'nightBatteryLow'
  | 'waterShortage'
  | 'foodShortage'
  | 'buildingDamaged'
  | 'dustStorm'
  | 'overcrowded'
  | 'mineralsEmpty'
  | 'wastingOutput'
  | 'firstLanding';

/** Exactly the snapshot fields the predicates read, and nothing else. */
export type TutorialContext = Pick<
  UiSnapshot,
  | 'oxygenCritical'
  | 'outage'
  | 'sunIntensity'
  | 'waterDeprived'
  | 'foodDeprived'
  | 'damagedBuildingCount'
  | 'overflowPopulation'
  | 'solsUntilLanding'
  | 'buildingCounts'
  | 'activeEvents'
  | 'resources'
>;

export type TutorialLesson = {
  readonly id: TutorialLessonId;
  readonly title: string;
  /** What is happening, and why the simulation makes it happen. */
  readonly body: string;
  /** The one thing to go do about it. */
  readonly solution: string;
  /** Build bar button to signpost, or null when the answer is not a building. */
  readonly highlight: BuildingKind | null;
  readonly triggered: (context: TutorialContext) => boolean;
};

/**
 * The cheapest thing the player can put down. Read from the definitions rather than written
 * as a literal: docs/SPEC-02 owns balance numbers and `sim/constants.ts` is their only home.
 */
const CHEAPEST_COST = Math.min(...BUILDABLE_KINDS.map((kind) => definitionOf(kind).cost));

/** A reserve this far down at night is minutes from an outage, not hours. */
const BATTERY_LOW_FRACTION = 0.05;

/**
 * Power is excluded on purpose: solar surplus is discarded on every clear sol by design, so
 * including it would fire the storage lesson on sol 1 and teach the wrong thing.
 */
const STORABLE_KINDS = ['water', 'food', 'oxygen', 'minerals'] as const;

export const TUTORIAL_LESSONS: readonly TutorialLesson[] = [
  {
    id: 'oxygenCritical',
    title: 'The air is running out',
    body: 'Under a sol of oxygen is left. Unlike water or food there is no grace period — running out ends the colony the same tick it happens.',
    solution:
      'Build an Electrolyzer. It splits water into oxygen, so it needs both water and power to run.',
    highlight: 'electrolyzer',
    triggered: (context) => context.oxygenCritical,
  },
  {
    id: 'gridOutage',
    title: 'The grid has collapsed',
    body: 'The battery is empty and sunlight is not covering demand, so every producer has stopped — including the ones that make air. The allocator sheds load by tier, but with nothing in reserve there is nothing left to shed.',
    solution: 'Build a Battery Bank to carry the night, or a Solar Array to fill it faster by day.',
    highlight: 'batteryBank',
    triggered: (context) => context.outage,
  },
  {
    id: 'nightBatteryLow',
    title: 'The night is draining your reserve',
    body: 'Solar output is zero after dark, so everything the colony draws comes out of storage. Discharge is rate-limited as well as capped, which is why one bank cannot carry a growing colony through a fifteen-hour night.',
    solution: 'Build a Battery Bank now, before the reserve reaches zero and the grid drops.',
    highlight: 'batteryBank',
    triggered: (context) =>
      context.sunIntensity === 0 &&
      context.resources.power.cap > 0 &&
      context.resources.power.stock / context.resources.power.cap < BATTERY_LOW_FRACTION,
  },
  {
    id: 'waterShortage',
    title: 'Water is running short',
    body: 'Stock has fallen below a sol of need, and colonists have three sols before deaths begin. Water also feeds the electrolyzer and the greenhouse, so a drought takes the air and the food with it.',
    solution: 'Build an Ice Extractor. It only works standing on an ice deposit.',
    highlight: 'iceExtractor',
    triggered: (context) => context.waterDeprived,
  },
  {
    id: 'foodShortage',
    title: 'The colony is running out of food',
    body: 'Stock is below a sol of need and the seven-sol grace period is already counting down. Relief only unwinds that clock slowly, so the debt carries into the next shortage.',
    solution:
      'Build a Greenhouse. It grows food and releases oxygen, but drinks water and power to do it.',
    highlight: 'greenhouse',
    triggered: (context) => context.foodDeprived,
  },
  {
    id: 'buildingDamaged',
    title: 'A meteor hit something',
    body: 'A damaged building produces nothing and cannot simply be switched back on. It stays a hole in the balance until it is repaired.',
    solution: 'Click the damaged building and press Repair in the inspector; it costs minerals.',
    highlight: null,
    triggered: (context) => context.damagedBuildingCount > 0,
  },
  {
    id: 'dustStorm',
    title: 'Dust is blocking the sun',
    body: 'A storm has cut solar output by 70%, and storms last sols rather than hours. Until it clears the colony is living off whatever it banked before the sky closed.',
    solution:
      'Ride it out on stored power — another Battery Bank helps here, another Solar Array barely does.',
    highlight: 'batteryBank',
    triggered: (context) => context.activeEvents.some((event) => event.kind === 'dustStorm'),
  },
  {
    id: 'overcrowded',
    title: 'There are more colonists than bunks',
    body: 'Everyone past habitat capacity consumes double the oxygen, water and food of a housed colonist. Rockets keep landing whether or not there is room for them.',
    solution: 'Build a Habitat. Each one houses ten.',
    highlight: 'habitat',
    triggered: (context) => context.overflowPopulation > 0,
  },
  {
    id: 'mineralsEmpty',
    title: 'You can no longer afford to build',
    body: 'Minerals are the only construction currency, and the colony was issued a fixed pile that does not refill itself. Demolishing refunds half, but that is a retreat rather than an income.',
    solution: 'Build a Mine on an ore deposit and the colony starts paying for itself.',
    highlight: 'mine',
    triggered: (context) =>
      context.resources.minerals.stock < CHEAPEST_COST && context.buildingCounts.mine === 0,
  },
  {
    id: 'wastingOutput',
    title: 'Production is going to waste',
    body: 'A resource has hit its storage cap, so everything produced beyond it is discarded instead of banked. That discarded surplus is exactly what would have carried the colony through the next shortage.',
    solution:
      'Build a Storage Depot. It raises the cap on water, oxygen, food and minerals at once.',
    highlight: 'storageDepot',
    triggered: (context) => STORABLE_KINDS.some((kind) => context.resources[kind].wasted > 0),
  },
  {
    id: 'firstLanding',
    title: 'A crew rocket is landing',
    body: 'A rocket touches down on the pad every seven sols, and each one carries more colonists than the last. They arrive whether or not the colony can house or feed them.',
    solution:
      'Build a Habitat before they land, so the new crew is not consuming double from the first sol.',
    highlight: 'habitat',
    triggered: (context) => context.solsUntilLanding < 1 && context.buildingCounts.habitat < 2,
  },
];

export const LESSON_BY_ID: Readonly<Record<TutorialLessonId, TutorialLesson>> = Object.fromEntries(
  TUTORIAL_LESSONS.map((lesson) => [lesson.id, lesson]),
) as Record<TutorialLessonId, TutorialLesson>;

/**
 * The most urgent lesson that holds right now and has not already been dismissed.
 *
 * Walks the table in priority order and stops at the first match, so a colony in trouble
 * evaluates fewer predicates than a healthy one — and a healthy one evaluates eleven cheap
 * boolean reads, which is nothing next to the tick it rides on. An earlier version memoised
 * the triggered set between snapshots; the memo had to be invalidated by every reason the
 * caller might decline to act on the result, and getting that wrong silently swallowed a
 * lesson forever. Recomputing is both cheaper to run and cheaper to be sure of.
 */
export function nextLesson(
  context: TutorialContext,
  seen: readonly TutorialLessonId[],
): TutorialLessonId | null {
  for (const lesson of TUTORIAL_LESSONS) {
    if (seen.includes(lesson.id)) continue;
    if (lesson.triggered(context)) return lesson.id;
  }
  return null;
}
