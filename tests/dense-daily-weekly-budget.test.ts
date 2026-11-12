import {RRuleTemporal, type RRuleOptions} from '../src';
import {Temporal} from '../src/temporal-impl';

const range = (start: number, end: number) => Array.from({length: end - start + 1}, (_, index) => start + index);
const everyTimeOfDay = {byHour: range(0, 23), byMinute: range(0, 59), bySecond: range(0, 59)};
const everyWeekday = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const utc = Temporal.ZonedDateTime.from('2025-01-01T00:00:00+00:00[UTC]');
const berlin = Temporal.ZonedDateTime.from('2025-01-01T01:00:00+01:00[Europe/Berlin]');

describe('candidate budget on dense DAILY and WEEKLY rules', () => {
  test('a dense DAILY window stops at the default budget', () => {
    const rule = new RRuleTemporal({freq: 'DAILY', ...everyTimeOfDay, dtstart: utc});
    const from = new Date('2025-01-01T00:00:00Z');

    expect(() => rule.between(from, new Date('2025-01-13T00:00:00Z'), true)).toThrow(
      'Maximum candidate evaluations (1000000) exceeded',
    );
  });

  test('a window under the budget answers, wherever in its period it starts', () => {
    const rule = new RRuleTemporal({freq: 'WEEKLY', byDay: everyWeekday, ...everyTimeOfDay, dtstart: utc});
    const from = new Date('2025-01-07T00:00:00Z');

    // Its 6 days and the 6 before them in the same period would be over the budget
    expect(rule.between(from, new Date('2025-01-13T00:00:00Z'), true)).toHaveLength(518_401);
    expect(() => rule.between(from, new Date('2025-01-20T00:00:00Z'), true)).toThrow(
      'Maximum candidate evaluations (1000000) exceeded',
    );
  });

  test.each([
    ['DAILY in UTC', 'utcZdtFromEpochMilliseconds', {freq: 'DAILY'}, utc],
    ['WEEKLY in UTC', 'utcZdtFromEpochMilliseconds', {freq: 'WEEKLY', byDay: everyWeekday}, utc],
    ['DAILY in a time zone', 'zdtFromEpochMs', {freq: 'DAILY'}, berlin],
    ['WEEKLY in a time zone', 'zdtFromEpochMs', {freq: 'WEEKLY', byDay: everyWeekday}, berlin],
  ])('a dense %s window builds no dates before it', (_name, builder, options, dtstart) => {
    const rule = new RRuleTemporal({...options, ...everyTimeOfDay, dtstart} as RRuleOptions);
    const build = vi.spyOn(RRuleTemporal.prototype as never, builder as never);
    try {
      expect(rule.between(new Date('2025-01-07T12:00:00Z'), new Date('2025-01-07T12:01:00Z'), true)).toHaveLength(61);
      expect(build).toHaveBeenCalledTimes(61);
    } finally {
      build.mockRestore();
    }
  });

  test.each([
    ['DAILY in UTC', {freq: 'DAILY'}, '2025-01-01T12:00:00+00:00[UTC]'],
    ['WEEKLY in UTC', {freq: 'WEEKLY', byDay: everyWeekday}, '2025-01-01T12:00:00+00:00[UTC]'],
    ['DAILY in a time zone', {freq: 'DAILY'}, '2025-01-01T13:00:00+01:00[Europe/Berlin]'],
    ['WEEKLY in a time zone', {freq: 'WEEKLY', byDay: everyWeekday}, '2025-01-01T13:00:00+01:00[Europe/Berlin]'],
  ])('a dense %s window from before DTSTART starts at DTSTART', (_name, options, start) => {
    const dtstart = Temporal.ZonedDateTime.from(start);
    const rule = new RRuleTemporal({...options, ...everyTimeOfDay, dtstart} as RRuleOptions);

    expect(rule.between(new Date('2024-12-31T00:00:00Z'), new Date('2025-01-01T12:00:01Z'), true)).toHaveLength(2);
  });

  test.each([
    ['DAILY', {freq: 'DAILY'}, '2025-01-13T00:00:00Z'],
    ['WEEKLY', {freq: 'WEEKLY', byDay: everyWeekday}, '2025-01-13T00:00:00Z'],
    ['MONTHLY', {freq: 'MONTHLY', byMonthDay: range(1, 11)}, '2025-03-01T00:00:00Z'],
  ])('a plan for a dense %s COUNT rule stops before building the dates', (_name, options, end) => {
    const rule = new RRuleTemporal({
      ...options,
      ...everyTimeOfDay,
      count: 100_000_000,
      dtstart: utc,
    } as RRuleOptions);

    expect(() => rule.between(new Date('2025-01-01T00:00:00Z'), new Date(end), true)).toThrow(
      'Maximum candidate evaluations (1000000) exceeded',
    );
  });

  test('a plan still answers a narrow window on a COUNT past the budget', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      byMonthDay: range(1, 11),
      ...everyTimeOfDay,
      count: 100_000_000,
      dtstart: utc,
    });

    expect(rule.between(new Date('2025-02-01T00:00:00Z'), new Date('2025-02-01T00:01:00Z'), true)).toHaveLength(61);
    expect((rule as unknown as {getNumericQueryPlan(): {kind: string} | null}).getNumericQueryPlan()?.kind).toBe(
      'monthly',
    );
  });

  test.each([
    ['MINUTELY', {freq: 'MINUTELY'}],
    ['HOURLY', {freq: 'HOURLY'}],
  ])('a plan for a fixed-step %s rule ignores the budget, like all()', (_name, options) => {
    const rule = new RRuleTemporal({
      ...options,
      count: 1000,
      dtstart: utc,
    } as RRuleOptions) as unknown as RRuleTemporal & {
      getNumericQueryPlan(): {kind: string} | null;
      maxCandidateEvaluations: number;
    };
    expect(rule.getNumericQueryPlan()?.kind).toBe('fixed-step');

    // A plan only gets built at the default budget, so lower it afterwards
    rule.maxCandidateEvaluations = 100;

    expect(rule.between(new Date('2025-01-01T00:00:00Z'), new Date('3000-01-01T00:00:00Z'), true)).toHaveLength(1000);
    expect(
      new RRuleTemporal({...options, count: 1000, dtstart: utc, maxCandidateEvaluations: 100} as RRuleOptions).all(),
    ).toHaveLength(1000);
  });

  test.each([
    ['DAILY', {freq: 'DAILY'}],
    ['WEEKLY', {freq: 'WEEKLY', byDay: ['MO', 'TU']}],
    ['MONTHLY', {freq: 'MONTHLY', byMonthDay: [1, 15]}],
  ])('a plan for a %s rule without time slots stops at the budget, like all()', (name, options) => {
    const rule = new RRuleTemporal({
      ...options,
      count: 1000,
      dtstart: utc,
    } as RRuleOptions) as unknown as RRuleTemporal & {
      getNumericQueryPlan(): {kind: string} | null;
      maxCandidateEvaluations: number;
    };
    expect(rule.getNumericQueryPlan()?.kind).toBe(name.toLowerCase());
    rule.maxCandidateEvaluations = 100;

    expect(() => rule.between(new Date('2025-01-01T00:00:00Z'), new Date('3000-01-01T00:00:00Z'), true)).toThrow(
      'Maximum candidate evaluations (100) exceeded',
    );
    expect(() =>
      new RRuleTemporal({...options, count: 1000, dtstart: utc, maxCandidateEvaluations: 100} as RRuleOptions).all(),
    ).toThrow('Maximum candidate evaluations (100) exceeded');
  });

  test('a raised maxIterations does not let a DAILY rule without time slots skip the budget', () => {
    const options = {freq: 'DAILY', dtstart: utc, maxIterations: 2_000_000} as const;
    const counted = new RRuleTemporal({...options, count: 1_200_000});
    expect(() => counted.between(new Date('2025-01-01T00:00:00Z'), new Date('9000-01-01T00:00:00Z'), true)).toThrow(
      'Maximum candidate evaluations (1000000) exceeded',
    );

    const until = new RRuleTemporal({...options, until: Temporal.ZonedDateTime.from('5300-01-01T00:00:00+00:00[UTC]')});
    expect(() => until.all()).toThrow('Maximum candidate evaluations (1000000) exceeded');
  });

  // Only a raised maxIterations takes these past 1,000,000 dates, so test each at a small budget
  test.each([
    ['_allUtcDailySimple', {freq: 'DAILY'}, utc],
    ['_allUtcWeeklySimple', {freq: 'WEEKLY', byDay: everyWeekday}, utc],
    ['_allUtcMonthlyByDayOrMonthDay', {freq: 'MONTHLY', byMonthDay: range(1, 28)}, utc],
    ['_allTzDailySimple', {freq: 'DAILY'}, berlin],
    ['_allTzWeeklySimple', {freq: 'WEEKLY', byDay: everyWeekday}, berlin],
    ['_allTzMonthlyByDayOrMonthDay', {freq: 'MONTHLY', byMonthDay: range(1, 28)}, berlin],
  ])('%s stops just past the budget', (path, options, dtstart) => {
    const expand = (count: number) => {
      const rule = new RRuleTemporal({
        ...options,
        count,
        dtstart,
        maxCandidateEvaluations: 1000,
      } as RRuleOptions) as unknown as Record<string, () => unknown[]>;
      return rule[path]!();
    };

    expect(expand(1000)).toHaveLength(1000);
    expect(() => expand(1001)).toThrow('Maximum candidate evaluations (1000) exceeded');
  });

  test('a plan for a rule with time slots stops at the budget, like all()', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      byHour: [9],
      count: 1000,
      dtstart: utc,
    }) as unknown as RRuleTemporal & {
      getNumericQueryPlan(): {kind: string} | null;
      maxCandidateEvaluations: number;
    };
    expect(rule.getNumericQueryPlan()?.kind).toBe('daily');
    rule.maxCandidateEvaluations = 100;

    expect(() => rule.between(new Date('2025-01-01T00:00:00Z'), new Date('3000-01-01T00:00:00Z'), true)).toThrow(
      'Maximum candidate evaluations (100) exceeded',
    );
  });

  // Calling each path directly checks it is the one stopping at the budget
  test.each([
    ['_allUtcDailyExpanded', {freq: 'DAILY'}, utc],
    ['_allUtcWeeklyExpanded', {freq: 'WEEKLY', byDay: everyWeekday}, utc],
    ['_allTzDailyExpanded', {freq: 'DAILY'}, berlin],
    ['_allTzWeeklyExpanded', {freq: 'WEEKLY', byDay: everyWeekday}, berlin],
  ])('%s stops just past the budget', (path, options, dtstart) => {
    const expand = (count: number) => {
      const rule = new RRuleTemporal({
        ...options,
        ...everyTimeOfDay,
        count,
        dtstart,
        maxCandidateEvaluations: 1000,
      } as RRuleOptions) as unknown as Record<string, () => unknown[]>;
      return rule[path]!();
    };

    expect(expand(1000)).toHaveLength(1000);
    expect(() => expand(1001)).toThrow('Maximum candidate evaluations (1000) exceeded');
  });
});

describe('fast paths at any candidate budget', () => {
  const generalEngine = <T>(run: () => T): T => {
    const prototype = RRuleTemporal.prototype as unknown as {allUtcFastPath(): null; allTzEpochFastPath(): null};
    const spies = [
      vi.spyOn(prototype, 'allUtcFastPath').mockReturnValue(null),
      vi.spyOn(prototype, 'allTzEpochFastPath').mockReturnValue(null),
    ];
    try {
      return run();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  };
  const outcome = (run: () => Temporal.ZonedDateTime[]) => {
    try {
      return run().map(String);
    } catch (error) {
      return (error as Error).message;
    }
  };

  test('a raised budget keeps the dense paths and answers past 1,000,000 dates', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      ...everyTimeOfDay,
      dtstart: utc,
      maxCandidateEvaluations: 1_100_000,
    });
    const expand = vi.spyOn(RRuleTemporal.prototype as never, '_allUtcDailyExpanded' as never);
    try {
      expect(rule.between(new Date('2025-01-01T00:00:00Z'), new Date('2025-01-13T00:00:00Z'), true)).toHaveLength(
        1_036_801,
      );
      expect(expand).toHaveBeenCalledTimes(1);
    } finally {
      expand.mockRestore();
    }
  });

  const hours = {byHour: [1, 9, 17], byMinute: [0, 30]};
  test.each([
    ['DAILY in UTC', {freq: 'DAILY', ...hours}, utc],
    ['DAILY BYDAY in UTC', {freq: 'DAILY', byDay: ['MO', 'TH'], ...hours}, utc],
    ['WEEKLY in UTC', {freq: 'WEEKLY', byDay: ['MO', 'FR'], interval: 2, ...hours}, utc],
    ['simple DAILY in UTC', {freq: 'DAILY'}, utc],
    ['simple WEEKLY in UTC', {freq: 'WEEKLY', byDay: ['TU', 'SA']}, utc],
    ['MONTHLY in UTC', {freq: 'MONTHLY', byMonthDay: [1, 10, 20, -1]}, utc],
    ['DAILY in a time zone', {freq: 'DAILY', ...hours}, berlin],
    ['WEEKLY in a time zone', {freq: 'WEEKLY', byDay: ['MO', 'FR'], ...hours}, berlin],
    ['simple DAILY in a time zone', {freq: 'DAILY'}, berlin],
    ['MONTHLY in a time zone', {freq: 'MONTHLY', byMonthDay: [1, 10, 20, -1]}, berlin],
  ])('%s gives the general engine its answer, and fails no budget it passes', (_name, options, dtstart) => {
    const exDate = [dtstart.add({days: 3}), dtstart.add({days: 4, hours: 8})];
    const offTime = dtstart.add({minutes: 7});
    for (const extra of [{}, {exDate}, {includeDtstart: true, dtstart: offTime}]) {
      for (const ending of [{count: 12}, {until: dtstart.add({days: 6})}]) {
        const queries = (maxCandidateEvaluations: number) => {
          const make = () =>
            new RRuleTemporal({dtstart, ...options, ...extra, ...ending, maxCandidateEvaluations} as RRuleOptions);
          return [
            () => make().all(),
            () => make().between(new Date('2025-01-02T12:00:00Z'), new Date('2025-01-05T00:00:00Z'), true),
          ];
        };
        const answers = queries(5_000_000).map((query) => generalEngine(() => outcome(query)));
        for (const maxCandidateEvaluations of [1, 2, 3, 11, 12, 13, 40, 1_000_000, 5_000_000]) {
          queries(maxCandidateEvaluations).forEach((query, index) => {
            const fast = outcome(query);
            const general = generalEngine(() => outcome(query));
            // The general engine also charges the candidates it rejects, such
            // as the first one past UNTIL, so it can fail a budget a fast path
            // meets; never the reverse.
            if (typeof general === 'string' && typeof fast !== 'string') expect(fast).toEqual(answers[index]);
            else expect(fast).toEqual(general);
          });
        }
      }
    }
  });
});
