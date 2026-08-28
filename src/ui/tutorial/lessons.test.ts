import { describe, expect, it } from 'vitest';
import { countByKind } from '../../sim/resources.ts';
import { RESOURCE_KINDS } from '../../sim/types.ts';
import type { ResourceKind } from '../../sim/types.ts';
import type { ResourceSnapshot } from '../../state/snapshot.ts';
import { LESSON_BY_ID, TUTORIAL_LESSONS, nextLesson } from './lessons.ts';
import type { TutorialContext, TutorialLessonId } from './lessons.ts';

function resource(overrides: Partial<ResourceSnapshot>): ResourceSnapshot {
  return {
    stock: 100,
    cap: 1000,
    net: 0,
    production: 0,
    consumption: 0,
    wasted: 0,
    daysLeft: Number.POSITIVE_INFINITY,
    ...overrides,
  };
}

/** A colony with nothing wrong with it: every predicate must read false against this. */
function healthy(): TutorialContext {
  const resources = {} as Record<ResourceKind, ResourceSnapshot>;
  for (const kind of RESOURCE_KINDS) resources[kind] = resource({});
  return {
    oxygenCritical: false,
    outage: false,
    sunIntensity: 1,
    waterDeprived: false,
    foodDeprived: false,
    damagedBuildingCount: 0,
    overflowPopulation: 0,
    solsUntilLanding: 6,
    buildingCounts: { ...countByKind([]), habitat: 3, mine: 1 },
    activeEvents: [],
    resources,
  };
}

/** The minimal edit to a healthy colony that should raise each lesson. */
const RAISES: Readonly<Record<TutorialLessonId, (context: TutorialContext) => TutorialContext>> = {
  oxygenCritical: (context) => ({ ...context, oxygenCritical: true }),
  gridOutage: (context) => ({ ...context, outage: true }),
  nightBatteryLow: (context) => ({
    ...context,
    sunIntensity: 0,
    resources: { ...context.resources, power: resource({ stock: 10, cap: 1000 }) },
  }),
  waterShortage: (context) => ({ ...context, waterDeprived: true }),
  foodShortage: (context) => ({ ...context, foodDeprived: true }),
  buildingDamaged: (context) => ({ ...context, damagedBuildingCount: 1 }),
  dustStorm: (context) => ({
    ...context,
    activeEvents: [{ kind: 'dustStorm', solsRemaining: 2 }],
  }),
  overcrowded: (context) => ({ ...context, overflowPopulation: 4 }),
  mineralsEmpty: (context) => ({
    ...context,
    buildingCounts: { ...context.buildingCounts, mine: 0 },
    resources: { ...context.resources, minerals: resource({ stock: 0 }) },
  }),
  wastingOutput: (context) => ({
    ...context,
    resources: { ...context.resources, water: resource({ wasted: 12 }) },
  }),
  firstLanding: (context) => ({
    ...context,
    solsUntilLanding: 0.4,
    buildingCounts: { ...context.buildingCounts, habitat: 1 },
  }),
};

describe('tutorial lesson triggers', () => {
  it('raises nothing on a colony with nothing wrong with it', () => {
    expect(nextLesson(healthy(), [])).toBeNull();
  });

  for (const lesson of TUTORIAL_LESSONS) {
    it(`raises ${lesson.id} on its own condition and not otherwise`, () => {
      const context = RAISES[lesson.id](healthy());
      expect(lesson.triggered(context)).toBe(true);
      expect(lesson.triggered(healthy())).toBe(false);
    });
  }

  it('does not blame the storage cap for discarded solar surplus', () => {
    // Power overflows on every clear sol by design; treating that as a storage problem
    // would fire the depot lesson on sol 1 and teach the opposite of the truth.
    const context = {
      ...healthy(),
      resources: { ...healthy().resources, power: resource({ wasted: 400 }) },
    };
    expect(LESSON_BY_ID.wastingOutput.triggered(context)).toBe(false);
  });

  it('does not call the battery low while the sun is up', () => {
    const context = {
      ...healthy(),
      resources: { ...healthy().resources, power: resource({ stock: 10, cap: 1000 }) },
    };
    expect(LESSON_BY_ID.nightBatteryLow.triggered(context)).toBe(false);
  });
});

describe('nextLesson', () => {
  it('returns the most urgent of several live lessons', () => {
    const context = RAISES.overcrowded(RAISES.oxygenCritical(healthy()));
    expect(nextLesson(context, [])).toBe('oxygenCritical');
  });

  it('falls through to the next lesson once the urgent one is dismissed', () => {
    const context = RAISES.overcrowded(RAISES.oxygenCritical(healthy()));
    expect(nextLesson(context, ['oxygenCritical'])).toBe('overcrowded');
  });

  it('returns null when every live lesson has been dismissed', () => {
    const context = RAISES.oxygenCritical(healthy());
    expect(nextLesson(context, ['oxygenCritical'])).toBeNull();
  });

  it('keeps offering a lesson for as long as its condition holds', () => {
    // The watcher declines to act while the orientation card is up or the colony is over.
    // Nothing here may remember having been asked, or the lesson is lost the moment the
    // caller starts listening again.
    const context = RAISES.oxygenCritical(healthy());
    expect(nextLesson(context, [])).toBe('oxygenCritical');
    expect(nextLesson(context, [])).toBe('oxygenCritical');
    expect(nextLesson(context, [])).toBe('oxygenCritical');
  });
});

describe('the lesson table itself', () => {
  it('has a unique id per lesson, and an index for each', () => {
    const ids = TUTORIAL_LESSONS.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(LESSON_BY_ID)).toHaveLength(ids.length);
  });

  it('gives every lesson a title, a body and a solution', () => {
    for (const lesson of TUTORIAL_LESSONS) {
      expect(lesson.title.length).toBeGreaterThan(0);
      expect(lesson.body.length).toBeGreaterThan(0);
      expect(lesson.solution.length).toBeGreaterThan(0);
    }
  });
});
