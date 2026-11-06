import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {RRuleTemporal, type RRuleOptions} from '../src';
import {Temporal} from '../src/temporal-impl';

type InspectableRule = {
  numericQueryPlanCache: {kind: string; heldCandidates: number} | null | undefined;
  generateYearlyOccurrenceEpochsUtc: (...args: unknown[]) => number[];
};

const range = (start: number, end: number) => Array.from({length: end - start + 1}, (_, index) => start + index);
const dtstart = Temporal.ZonedDateTime.from('2025-01-01T00:00:00+00:00[UTC]');
const after = new Date('2025-01-01T00:00:00Z');

const yearlyRule = (byHour: number[], byMinute: number[]) =>
  new RRuleTemporal({freq: 'YEARLY', count: 100, byMonthDay: range(1, 31), byHour, byMinute, dtstart});

const countPlanBuilds = (rule: RRuleTemporal) => {
  const inspectable = rule as unknown as InspectableRule;
  const generate = inspectable.generateYearlyOccurrenceEpochsUtc;
  const counter = {calls: 0};
  inspectable.generateYearlyOccurrenceEpochsUtc = function (this: RRuleTemporal, ...args) {
    counter.calls += 1;
    return generate.apply(this, args);
  };
  return counter;
};

describe('query plan cache', () => {
  const planOf = (rule: RRuleTemporal) => (rule as unknown as InspectableRule).numericQueryPlanCache;

  test('keeps a plan of up to 10,000 candidates when another rule builds a larger one', () => {
    // 3 hours x 9 minutes on 365 days is 9,855 candidates
    const rule = yearlyRule([9, 10, 11], range(0, 8));
    rule.next(after);
    yearlyRule([9, 10, 11, 12], range(0, 6)).next(after);

    expect(planOf(rule)?.kind).toBe('yearly');
  });

  test('drops a larger plan when another rule builds a larger one', () => {
    // 4 hours x 7 minutes on 365 days is 10,220 candidates
    const first = yearlyRule([9, 10, 11, 12], range(0, 6));
    const second = yearlyRule([13, 14, 15, 16], range(0, 6));
    first.next(after);
    expect(planOf(first)?.heldCandidates).toBe(10_220);

    second.next(after);
    expect(planOf(first)).toBeUndefined();
    expect(planOf(second)?.heldCandidates).toBe(10_220);
  });

  test.each([
    ['DAILY', {freq: 'DAILY'}, '2025-01-01T23:59:00+00:00[UTC]'],
    ['WEEKLY', {freq: 'WEEKLY', byDay: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']}, '2025-01-05T23:59:00+00:00[UTC]'],
  ])('counts the time slots a %s plan holds, wherever its rule starts', (_name, options, start) => {
    const rule = new RRuleTemporal({
      ...options,
      count: 100,
      byHour: range(0, 23),
      byMinute: range(0, 59),
      bySecond: range(0, 59),
      dtstart: Temporal.ZonedDateTime.from(start),
    } as RRuleOptions);
    rule.next(new Date(Temporal.ZonedDateTime.from(start).epochMilliseconds));

    expect(planOf(rule)?.heldCandidates).toBeGreaterThan(10_000);
  });

  test('reuses a larger plan until another rule builds one', () => {
    const first = yearlyRule([9, 10, 11, 12], range(0, 6));
    const second = yearlyRule([13, 14, 15, 16], range(0, 6));
    const firstBuilds = countPlanBuilds(first);
    const secondBuilds = countPlanBuilds(second);

    const expected = first.next(after)?.toString();
    const afterFirstQuery = firstBuilds.calls;
    expect(afterFirstQuery).toBeGreaterThan(0);

    first.next(after);
    expect(firstBuilds.calls).toBe(afterFirstQuery);

    second.next(after);
    expect(secondBuilds.calls).toBeGreaterThan(0);

    expect(first.next(after)?.toString()).toBe(expected);
    expect(firstBuilds.calls).toBeGreaterThan(afterFirstQuery);
  });

  test('answers the same from a rebuilt plan', () => {
    const first = yearlyRule([9, 10, 11, 12], range(0, 6));
    const second = yearlyRule([13, 14, 15, 16], range(0, 6));
    const occurrences = first.all().map((date) => date.toString());

    let cursor = new Date(after.getTime() - 1);
    const walked: string[] = [];
    for (let index = 0; index < occurrences.length; index += 1) {
      const next = first.next(cursor);
      walked.push(next!.toString());
      cursor = new Date(next!.epochMilliseconds);
      second.next(after);
    }

    expect(walked).toEqual(occurrences);
    expect(first.next(cursor)).toBeNull();
  });

  test('keeps nothing of a rule once it is dropped', () => {
    const fixture = fileURLToPath(new URL('./fixtures/dropped-dense-rule-child.mjs', import.meta.url));
    const output = execFileSync(process.execPath, ['--expose-gc', fixture], {encoding: 'utf8', timeout: 14_000});

    expect(output).toBe('collected');
  });

  test('many dense rules fit a small heap', () => {
    const fixture = fileURLToPath(new URL('./fixtures/many-dense-rules-child.mjs', import.meta.url));
    const output = execFileSync(process.execPath, ['--max-old-space-size=400', fixture], {
      encoding: 'utf8',
      timeout: 14_000,
    });

    expect(output).toBe('24');
  });
});
