import {RRuleTemporal, type RRuleOptions} from '../src';
import {Temporal} from '../src/temporal-impl';

const zdt = (value: string) => Temporal.ZonedDateTime.from(value);
const keys = (dates: ReturnType<RRuleTemporal['all']>) => dates.map(String);

function checkWindow(options: RRuleOptions, start: string, end: string) {
  const rule = new RRuleTemporal(options);
  const dates = rule.all(() => true);
  const after = zdt(start);
  const before = zdt(end);
  expect(keys(rule.all())).toEqual(keys(dates));
  for (const inclusive of [false, true]) {
    const expected = dates.filter((date) =>
      inclusive
        ? date.epochNanoseconds >= after.epochNanoseconds && date.epochNanoseconds <= before.epochNanoseconds
        : date.epochNanoseconds > after.epochNanoseconds && date.epochNanoseconds < before.epochNanoseconds,
    );
    expect(keys(rule.between(after, before, inclusive))).toEqual(keys(expected));
    for (const target of [after, before]) {
      expect(rule.next(target, inclusive)?.toString()).toBe(
        dates
          .find((date) =>
            inclusive
              ? date.epochNanoseconds >= target.epochNanoseconds
              : date.epochNanoseconds > target.epochNanoseconds,
          )
          ?.toString(),
      );
      expect(rule.previous(target, inclusive)?.toString()).toBe(
        dates
          .findLast((date) =>
            inclusive
              ? date.epochNanoseconds <= target.epochNanoseconds
              : date.epochNanoseconds < target.epochNanoseconds,
          )
          ?.toString(),
      );
    }
  }
}

describe('query alignment preserves recurrence identity', () => {
  it('does not force a synthetic DTSTART into an empty window (#139)', () => {
    const rule = new RRuleTemporal({
      rruleString: 'FREQ=DAILY;BYDAY=MO',
      dtstart: zdt('2024-01-01T09:00[UTC]'),
      includeDtstart: true,
    });
    expect(rule.between(zdt('2024-01-02T00:00[UTC]'), zdt('2024-01-03T23:59[UTC]'), true)).toEqual([]);
  });

  it('retains the real included DTSTART and applies EXDATE to it', () => {
    const dtstart = zdt('2024-01-02T09:00[UTC]');
    const rule = new RRuleTemporal({freq: 'DAILY', byDay: ['MO'], dtstart, includeDtstart: true});
    const end = dtstart.add({days: 1});
    expect(keys(rule.between(dtstart, end, true))).toEqual([dtstart.toString()]);
    expect(rule.between(dtstart, end, false)).toEqual([]);
    expect(rule.with({exDate: [dtstart]}).between(dtstart, end, true)).toEqual([]);
  });

  it.each(['UTC', 'America/Chicago'])('keeps DAILY INTERVAL phase through filtered weekdays in %s', (zone) => {
    for (const expanded of [false, true]) {
      const dtstart = zdt(`2025-01-07T09:30[${zone}]`);
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        dtstart,
        interval: 2,
        count: 6,
        byDay: ['MO', 'WE', 'FR'],
        ...(expanded ? {byHour: [9], byMinute: [30]} : {}),
      });
      const expected = ['2025-01-13', '2025-01-15', '2025-01-17', '2025-01-27', '2025-01-29', '2025-01-31'];
      expect(rule.all().map((date) => date.toPlainDate().toString())).toEqual(expected);
      expect(rule.all(() => true).map((date) => date.toPlainDate().toString())).toEqual(expected);
      expect(
        rule
          .next(zdt(`2025-01-09T12:00[${zone}]`))
          ?.toPlainDate()
          .toString(),
      ).toBe(expected[0]);
      checkWindow(
        {
          freq: 'DAILY',
          dtstart,
          interval: 3,
          byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
          byHour: [6, 18],
          until: dtstart.add({months: 5}),
        },
        `2025-03-30T08:00[${zone}]`,
        `2025-04-08T20:00[${zone}]`,
      );
    }
  });

  it.each(['hebrew', 'gregory', 'indian'])('preserves %s calendar queries and returned values', (calendar) => {
    for (const freq of ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const) {
      checkWindow(
        {freq, dtstart: zdt('2024-01-01T09:00[UTC]').withCalendar(calendar), until: zdt('2028-01-01T09:00[UTC]')},
        '2025-01-01T00:00[UTC]',
        '2025-06-01T00:00[UTC]',
      );
    }
  });

  it.each([
    ['MONTHLY', '2024-01-31T09:00[UTC]', '2024-06-30T23:59[UTC]', '2024-03-01T00:00[UTC]'],
    ['YEARLY', '2024-02-29T09:00[UTC]', '2032-03-01T00:00[UTC]', '2027-03-01T00:00[UTC]'],
  ] as const)('does not replace chained %s arithmetic with a single addition', (freq, dtstart, until, after) => {
    checkWindow({freq, dtstart: zdt(dtstart), until: zdt(until)}, after, until);
  });

  it('preserves cadence across a skipped local date', () => {
    checkWindow(
      {
        freq: 'DAILY',
        interval: 3,
        dtstart: zdt('2011-12-27T09:00[Pacific/Apia]'),
        until: zdt('2012-05-10T09:00[Pacific/Apia]'),
      },
      '2012-02-29T09:00[Pacific/Apia]',
      '2012-03-07T09:00[Pacific/Apia]',
    );
  });

  it('clips period time slots in the DTSTART zone when TZID is different', () => {
    for (const freq of ['WEEKLY', 'MONTHLY', 'YEARLY'] as const) {
      checkWindow(
        {
          freq,
          byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
          dtstart: zdt('2024-01-01T09:00[Pacific/Apia]'),
          tzid: 'UTC',
          until: zdt('2026-01-01T09:00[Pacific/Apia]'),
        },
        '2024-01-01T08:00[Pacific/Apia]',
        '2025-01-01T09:00[Pacific/Apia]',
      );
    }
  });

  it('keeps weekly wall time when WKST lands in a spring-forward gap', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      wkst: 'SU',
      dtstart: zdt('2024-03-08T02:30[Europe/Berlin]'),
      until: zdt('2024-05-31T02:30[Europe/Berlin]'),
    });
    expect(rule.all(() => true).every((date) => date.hour === 2 && date.minute === 30)).toBe(true);
    checkWindow(rule.options(), '2024-04-01T00:00[Europe/Berlin]', '2024-05-31T02:30[Europe/Berlin]');
  });

  it('does not reintroduce the skipped second HOURLY fold occurrence', () => {
    checkWindow(
      {
        freq: 'HOURLY',
        dtstart: zdt('2024-11-02T23:30[America/Chicago]'),
        until: zdt('2024-11-03T05:30[America/Chicago]'),
      },
      '2024-11-03T01:15-06:00[America/Chicago]',
      '2024-11-03T01:45-06:00[America/Chicago]',
    );
  });

  it('streams mixed positive and negative week numbers chronologically before COUNT', () => {
    const options = {
      freq: 'MONTHLY' as const,
      dtstart: zdt('2024-01-01T09:00[UTC]'),
      byWeekNo: [1, -1],
      byDay: ['MO'],
      interval: 2,
      count: 5,
    };
    const rule = new RRuleTemporal(options);
    const expected = ['2024-01-01', '2024-12-23', '2024-12-30', '2025-12-22', '2025-12-29'];
    expect(rule.all().map((date) => date.toPlainDate().toString())).toEqual(expected);
    expect(rule.all(() => true).map((date) => date.toPlainDate().toString())).toEqual(expected);
    checkWindow(options, '2024-01-01T09:00[UTC]', '2025-12-29T09:00[UTC]');
  });

  it('keeps an explicitly supplied later-fold DTSTART on the general engine', () => {
    for (const freq of ['SECONDLY', 'MINUTELY', 'HOURLY', 'DAILY'] as const) {
      const dtstart = zdt('2024-11-03T01:30-06:00[America/Chicago]');
      const rule = new RRuleTemporal({freq, dtstart, count: 4});
      expect(keys(rule.all())).toEqual(keys(rule.all(() => true)));
      expect(rule.all()[0]!.epochNanoseconds).toBe(dtstart.epochNanoseconds);
      expect(rule.next(dtstart, true)?.epochNanoseconds).toBe(dtstart.epochNanoseconds);
    }
  });

  it('resolves future calendar fold occurrences to the first instant in every query path', () => {
    const options = {
      freq: 'YEARLY' as const,
      dtstart: zdt('2024-10-25T01:30[America/Chicago]'),
      interval: 2,
      byMonth: [2, 6, 11],
      byMonthDay: [1, 15, -1],
      count: 12,
    };
    const target = zdt('2026-11-01T00:00[America/Chicago]');
    const expected = zdt('2026-11-01T01:30-05:00[America/Chicago]');
    const rule = new RRuleTemporal(options);
    expect(rule.next(target)?.epochNanoseconds).toBe(expected.epochNanoseconds);
    expect(rule.all(() => true).find((date) => date.epochNanoseconds > target.epochNanoseconds)?.epochNanoseconds).toBe(
      expected.epochNanoseconds,
    );
    checkWindow(options, '2026-11-01T00:00[America/Chicago]', '2026-11-02T00:00[America/Chicago]');
  });

  it('keeps non-ISO week-years in chronological order', () => {
    checkWindow(
      {
        freq: 'MONTHLY',
        dtstart: zdt('2024-01-01T09:17:23[America/Chicago]').withCalendar('hebrew'),
        interval: 3,
        byWeekNo: [1, -1],
        byDay: ['MO'],
        until: zdt('2027-11-20T09:17:23[America/Chicago]'),
      },
      '2025-09-01T00:00[America/Chicago]',
      '2026-06-05T08:17:23[America/Chicago]',
    );
  });

  it('seeks valid month ends without replaying decades of history', () => {
    const rule = new RRuleTemporal({freq: 'MONTHLY', dtstart: zdt('1970-01-31T09:00[UTC]'), maxIterations: 20});
    const target = zdt('2026-10-31T09:00[UTC]');
    expect(rule.next(target, true)?.epochNanoseconds).toBe(target.epochNanoseconds);
    expect(rule.previous(target, true)?.epochNanoseconds).toBe(target.epochNanoseconds);
  });

  it('still seeks distant dense UTC rules within a small iteration budget', () => {
    const rule = new RRuleTemporal({
      freq: 'SECONDLY',
      dtstart: zdt('1970-01-01T00:00[UTC]'),
      includeDtstart: true,
      maxIterations: 20,
    });
    const after = zdt('2026-09-17T12:00[UTC]');
    expect(rule.next(after)?.epochNanoseconds).toBe(after.add({seconds: 1}).epochNanoseconds);
    expect(rule.previous(after)?.epochNanoseconds).toBe(after.subtract({seconds: 1}).epochNanoseconds);
    expect(rule.between(after, after.add({seconds: 3}), true)).toHaveLength(4);
  });
});
