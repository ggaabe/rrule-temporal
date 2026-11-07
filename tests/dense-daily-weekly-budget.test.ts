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
    ['DAILY', {freq: 'DAILY'}],
    ['WEEKLY', {freq: 'WEEKLY', byDay: ['MO', 'TU']}],
    ['MONTHLY', {freq: 'MONTHLY', byMonthDay: [1, 15]}],
  ])('a plan for a %s rule without time slots ignores the budget, like all()', (name, options) => {
    const rule = new RRuleTemporal({
      ...options,
      count: 1000,
      dtstart: utc,
    } as RRuleOptions) as unknown as RRuleTemporal & {
      getNumericQueryPlan(): {kind: string} | null;
      maxCandidateEvaluations: number;
    };
    expect(rule.getNumericQueryPlan()?.kind).toBe(
      name === 'MINUTELY' || name === 'HOURLY' ? 'fixed-step' : name.toLowerCase(),
    );

    // A plan only gets built at the default budget, so lower it afterwards
    rule.maxCandidateEvaluations = 100;

    expect(rule.between(new Date('2025-01-01T00:00:00Z'), new Date('3000-01-01T00:00:00Z'), true)).toHaveLength(1000);
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

  // These paths only run at the default budget, so calling them directly tests each one at a small budget
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
