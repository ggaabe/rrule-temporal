import {RRuleTemporal} from '../src';
import {Temporal} from '../src/temporal-impl';

type InspectableRule = RRuleTemporal & {
  numericQueryPlanCache?: {kind: string} | null;
};

function epochKeys(values: ReturnType<RRuleTemporal['all']>): bigint[] {
  return values.map((value) => value.epochNanoseconds);
}

function expectPlan(rule: RRuleTemporal, kind: 'fixed-step' | 'daily' | 'weekly' | 'monthly'): void {
  expect((rule as InspectableRule).numericQueryPlanCache?.kind).toBe(kind);
}

function expectedNext(occurrences: ReturnType<RRuleTemporal['all']>, target: bigint, inclusive: boolean) {
  return occurrences.find((value) => (inclusive ? value.epochNanoseconds >= target : value.epochNanoseconds > target));
}

function expectedPrevious(occurrences: ReturnType<RRuleTemporal['all']>, target: bigint, inclusive: boolean) {
  return occurrences.findLast((value) =>
    inclusive ? value.epochNanoseconds <= target : value.epochNanoseconds < target,
  );
}

function expectQueriesMatchOccurrenceSet(rule: RRuleTemporal): void {
  const occurrences = rule.all();
  const ranks = [
    ...new Set([0, 1, Math.floor(occurrences.length / 2), occurrences.length - 2, occurrences.length - 1]),
  ].filter((rank) => rank >= 0 && rank < occurrences.length);

  for (const rank of ranks) {
    const occurrence = occurrences[rank]!;
    for (const inclusive of [false, true]) {
      const next = rule.next(occurrence, inclusive);
      const previous = rule.previous(occurrence, inclusive);
      expect(next?.epochNanoseconds ?? null).toBe(
        expectedNext(occurrences, occurrence.epochNanoseconds, inclusive)?.epochNanoseconds ?? null,
      );
      expect(previous?.epochNanoseconds ?? null).toBe(
        expectedPrevious(occurrences, occurrence.epochNanoseconds, inclusive)?.epochNanoseconds ?? null,
      );
    }

    const justBefore = occurrence.subtract({nanoseconds: 1});
    const justAfter = occurrence.add({nanoseconds: 1});
    expect(epochKeys(rule.between(justBefore, justAfter, false))).toEqual([occurrence.epochNanoseconds]);
    expect(rule.matches(occurrence)).toBe(true);
  }

  const beforeStart = occurrences[0]!.subtract({days: 30});
  const afterEnd = occurrences.at(-1)!.add({days: 30});
  expect(rule.previous(beforeStart)).toBeNull();
  expect(rule.next(afterEnd)).toBeNull();
}

describe('numeric COUNT query plans', () => {
  it('selects distant fixed-step occurrences without enumerating from DTSTART', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    const rule = new RRuleTemporal({
      freq: 'SECONDLY',
      interval: 17,
      count: 9_000,
      dtstart,
      cache: false,
    });
    const occurrence = dtstart.add({seconds: 17 * 8_500});

    expect(rule.next(occurrence, true)?.epochNanoseconds).toBe(occurrence.epochNanoseconds);
    expect(rule.previous(occurrence, true)?.epochNanoseconds).toBe(occurrence.epochNanoseconds);
    expect(epochKeys(rule.between(occurrence.subtract({nanoseconds: 1}), occurrence.add({nanoseconds: 1})))).toEqual([
      occurrence.epochNanoseconds,
    ]);
    expectPlan(rule, 'fixed-step');
  });

  it('matches the complete occurrence set for simple and expanded DAILY schedules', () => {
    const rules = [
      new RRuleTemporal({
        freq: 'DAILY',
        interval: 2,
        byDay: ['MO', 'WE', 'FR'],
        count: 180,
        dtstart: Temporal.ZonedDateTime.from('2025-01-07T09:30:00[UTC]'),
        cache: false,
      }),
      new RRuleTemporal({
        freq: 'DAILY',
        interval: 2,
        byDay: ['MO', 'WE', 'FR'],
        byHour: [9, 17],
        byMinute: [0, 30],
        count: 180,
        dtstart: Temporal.ZonedDateTime.from('2025-01-01T12:00:00[UTC]'),
        cache: false,
      }),
    ];

    for (const rule of rules) {
      expectQueriesMatchOccurrenceSet(rule);
      expectPlan(rule, 'daily');
    }
  });

  it('keeps WEEKLY query cadence aligned to the recurrence set', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-08T09:00:00[UTC]');
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      interval: 2,
      byDay: ['MO'],
      count: 40,
      dtstart,
      cache: false,
    });

    expect(rule.all()[0]!.toString()).toBe('2025-01-20T09:00:00+00:00[UTC]');
    expect(rule.next(dtstart, true)?.toString()).toBe('2025-01-20T09:00:00+00:00[UTC]');
    expectQueriesMatchOccurrenceSet(rule);
    expectPlan(rule, 'weekly');
  });

  it('selects MONTHLY occurrences through the cached Gregorian cycle', () => {
    const rules = [
      new RRuleTemporal({
        freq: 'MONTHLY',
        count: 120,
        byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
        bySetPos: [-1],
        dtstart: Temporal.ZonedDateTime.from('2023-02-21T09:00:00[UTC]'),
        cache: false,
      }),
      new RRuleTemporal({
        freq: 'MONTHLY',
        interval: 3,
        count: 120,
        byMonthDay: [15, -1],
        byHour: [9, 17],
        dtstart: Temporal.ZonedDateTime.from('2023-02-21T12:00:00[UTC]'),
        cache: false,
      }),
      new RRuleTemporal({
        freq: 'MONTHLY',
        count: 120,
        byDay: ['2TU'],
        byHour: [9, 17],
        byMonth: [3, 6, 9, 12],
        dtstart: Temporal.ZonedDateTime.from('2023-02-21T12:00:00[America/Chicago]'),
        cache: false,
      }),
    ];

    for (const rule of rules) {
      expectQueriesMatchOccurrenceSet(rule);
      expectPlan(rule, 'monthly');
    }
  });

  it('uses instant ordering through a DST fold with several repeated-hour slots', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      byHour: [1],
      byMinute: [20, 30, 40],
      count: 30,
      dtstart: Temporal.ZonedDateTime.from('2024-10-30T01:00:00[America/Chicago]'),
      cache: false,
    });
    const secondFoldCopy = Temporal.ZonedDateTime.from('2024-11-03T01:30:00-06:00[America/Chicago]');

    expect(rule.previous(secondFoldCopy)?.toString()).toBe('2024-11-03T01:40:00-05:00[America/Chicago]');
    expect(rule.next(secondFoldCopy)?.toString()).toBe('2024-11-04T01:20:00-06:00[America/Chicago]');
    expectPlan(rule, 'daily');
  });

  it('handles a distant named-zone DAILY query and caches its plan', () => {
    const dtstart = Temporal.ZonedDateTime.from('2000-01-01T09:00:00[America/Chicago]');
    const rule = new RRuleTemporal({freq: 'DAILY', count: 9_000, dtstart, cache: false});
    const target = Temporal.ZonedDateTime.from('2023-04-10T09:00:00[America/Chicago]');

    expect(rule.next(target, true)?.epochNanoseconds).toBe(target.epochNanoseconds);
    const cachedPlan = (rule as InspectableRule).numericQueryPlanCache;
    expect(cachedPlan?.kind).toBe('daily');
    rule.previous(target, true);
    expect((rule as InspectableRule).numericQueryPlanCache).toBe(cachedPlan);
  });

  it('applies inclusive UNTIL before answering COUNT-bound queries', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    const last = dtstart.add({hours: 49});
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      count: 100,
      until: last,
      dtstart,
      cache: false,
    });

    expect(rule.next(last, true)?.epochNanoseconds).toBe(last.epochNanoseconds);
    expect(rule.next(last)).toBeNull();
    expect(rule.previous(last.add({days: 10}))?.epochNanoseconds).toBe(last.epochNanoseconds);
    expect(epochKeys(rule.between(dtstart, last, true))).toHaveLength(50);
    expectPlan(rule, 'fixed-step');
  });

  it('applies UNTIL to a periodic MONTHLY plan before COUNT is exhausted', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 100,
      until: Temporal.ZonedDateTime.from('2025-03-31T09:00:00[UTC]'),
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
      bySetPos: [-1],
      dtstart: Temporal.ZonedDateTime.from('2024-01-01T09:00:00[UTC]'),
      cache: false,
    });
    const occurrences = rule.all();
    const last = occurrences.at(-1)!;

    expect(last.toString()).toBe('2025-03-31T09:00:00+00:00[UTC]');
    expect(rule.next(last, true)?.epochNanoseconds).toBe(last.epochNanoseconds);
    expect(rule.next(last)).toBeNull();
    expectQueriesMatchOccurrenceSet(rule);
    expectPlan(rule, 'monthly');
  });

  it('preserves the maxIterations boundary needed to answer each query', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      count: 100,
      maxIterations: 50,
      dtstart,
      cache: false,
    });
    const rank48 = dtstart.add({hours: 48});
    const rank49 = dtstart.add({hours: 49});

    expect(rule.next(rank49, true)?.epochNanoseconds).toBe(rank49.epochNanoseconds);
    expect(() => rule.next(rank49)).toThrow('Maximum iterations (50) exceeded in all()');
    expect(epochKeys(rule.between(dtstart, rank48, true))).toHaveLength(49);
    expect(() => rule.between(dtstart, rank49, true)).toThrow('Maximum iterations (50) exceeded in all()');
  });

  it('falls back for unproven rule shapes and DST-gap-sensitive wall times', () => {
    const utcStart = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[UTC]');
    const rules = [
      new RRuleTemporal({freq: 'DAILY', count: 10, rDate: [], dtstart: utcStart}),
      new RRuleTemporal({freq: 'DAILY', count: 10, exDate: [], dtstart: utcStart}),
      new RRuleTemporal({freq: 'DAILY', count: 10, includeDtstart: true, byDay: ['MO'], dtstart: utcStart}),
      new RRuleTemporal({freq: 'MONTHLY', count: 10, dtstart: utcStart}),
      new RRuleTemporal({
        freq: 'MONTHLY',
        count: 10,
        byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
        bySetPos: [-1, -1],
        dtstart: utcStart,
      }),
      new RRuleTemporal({freq: 'DAILY', count: 10, rscale: 'GREGORIAN', dtstart: utcStart}),
      new RRuleTemporal({
        freq: 'SECONDLY',
        count: 10,
        dtstart: Temporal.ZonedDateTime.from('2025-01-01T00:00:00.000123456[UTC]'),
      }),
      new RRuleTemporal({
        freq: 'DAILY',
        count: 400,
        dtstart: Temporal.ZonedDateTime.from('2024-03-08T02:30:00[America/Chicago]'),
      }),
      new RRuleTemporal({
        freq: 'MONTHLY',
        byMonthDay: [10],
        count: 30,
        dtstart: Temporal.ZonedDateTime.from('2023-01-10T02:30:00[America/Chicago]'),
      }),
    ];

    for (const rule of rules) {
      rule.next(rule.all()[0]!, true);
      expect((rule as InspectableRule).numericQueryPlanCache).toBeNull();
    }
  });
});

describe('numeric query differential coverage', () => {
  it('matches all() across deterministic supported rule combinations', () => {
    let state = 0x51f15e;
    const random = () => {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

    for (let index = 0; index < 30; index++) {
      const interval = 1 + Math.floor(random() * 5);
      const frequency = index % 3;
      let rule: RRuleTemporal;

      if (frequency === 0) {
        rule = new RRuleTemporal({
          freq: index % 2 === 0 ? 'MINUTELY' : 'SECONDLY',
          interval,
          count: 80,
          dtstart: Temporal.ZonedDateTime.from('2024-01-01T00:00:00[UTC]'),
          cache: false,
        });
      } else if (frequency === 1) {
        const byDay = weekdays.filter(() => random() > 0.55);
        rule = new RRuleTemporal({
          freq: 'DAILY',
          interval,
          count: 80,
          byDay: byDay.length ? byDay : undefined,
          byHour: index % 2 ? [9, 17] : undefined,
          dtstart: Temporal.ZonedDateTime.from('2024-01-02T12:34:00[UTC]'),
          cache: false,
        });
      } else {
        const byDay = weekdays.filter(() => random() > 0.6);
        rule = new RRuleTemporal({
          freq: 'WEEKLY',
          interval,
          count: 80,
          byDay: byDay.length ? byDay : undefined,
          byHour: index % 2 ? [8, 16] : undefined,
          wkst: weekdays[Math.floor(random() * weekdays.length)],
          dtstart: Temporal.ZonedDateTime.from('2024-01-03T12:34:00[UTC]'),
          cache: false,
        });
      }

      expectQueriesMatchOccurrenceSet(rule);
      expect((rule as InspectableRule).numericQueryPlanCache).not.toBeNull();
    }
  });

  it('matches all() across varied Gregorian MONTHLY shapes', () => {
    const scenarios = [
      {byMonthDay: [1, 15, -1]},
      {byDay: ['MO', 'WE', 'FR'], bySetPos: [-1]},
      {byDay: ['2TU'], byHour: [9, 17]},
      {byDay: ['MO', 'TU', 'WE', 'TH', 'FR'], bySetPos: [1, -1]},
    ];

    for (let index = 0; index < 16; index++) {
      const shape = scenarios[index % scenarios.length]!;
      const rule = new RRuleTemporal({
        freq: 'MONTHLY',
        interval: 1 + (index % 7),
        count: 80,
        ...shape,
        dtstart: Temporal.ZonedDateTime.from('1997-09-02T12:34:00[UTC]'),
        cache: false,
      });

      expectQueriesMatchOccurrenceSet(rule);
      expectPlan(rule, 'monthly');
    }
  });
});

describe('early Gregorian years', () => {
  it.each([
    ['0001', ['0001-01-31', '0001-02-28', '0001-03-30']],
    ['0099', ['0099-01-30', '0099-02-27', '0099-03-31']],
    ['0100', ['0100-01-29', '0100-02-26', '0100-03-31']],
  ])('keeps MONTHLY BYSETPOS in year %s instead of remapping it to 19xx', (year, expectedDates) => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
      bySetPos: [-1],
      dtstart: Temporal.ZonedDateTime.from(`${year}-01-01T09:00:00[UTC]`),
      cache: false,
    });

    expect(rule.all().map((value) => value.toPlainDate().toString())).toEqual(expectedDates);
  });

  it('keeps negative proleptic years aligned with the Temporal engine', () => {
    const options = {
      freq: 'MONTHLY' as const,
      count: 24,
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
      bySetPos: [-1],
      dtstart: Temporal.ZonedDateTime.from('-000001-01-01T09:00:00[UTC]'),
      cache: false,
    };
    const rule = new RRuleTemporal(options);
    const general = new RRuleTemporal(options).all(() => true);

    expect(epochKeys(rule.all())).toEqual(epochKeys(general));
    expectQueriesMatchOccurrenceSet(rule);
    expectPlan(rule, 'monthly');
  });
});
