import {Temporal as JsTemporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from '../src';
import {Temporal} from '../src/temporal-impl';

const utc = (date: string) => Temporal.ZonedDateTime.from(`${date}[UTC]`);

/** Compare point queries against the complete, independently generated recurrence set. */
function expectPreviousMatchesAll(rule: RRuleTemporal) {
  const dates = rule.all();
  expect(dates.length).toBeGreaterThan(0);
  for (const date of dates) {
    for (const offset of [-1, 0, 1]) {
      const target = date.add({nanoseconds: offset});
      for (const inclusive of [false, true]) {
        const expected = dates.findLast((candidate) =>
          inclusive
            ? candidate.epochNanoseconds <= target.epochNanoseconds
            : candidate.epochNanoseconds < target.epochNanoseconds,
        );
        expect(rule.previous(target, inclusive)?.epochNanoseconds ?? null, `${target}, inclusive=${inclusive}`).toBe(
          expected?.epochNanoseconds ?? null,
        );
      }
    }
  }
}

describe('previous() recurrence-set boundaries', () => {
  it.each([
    {freq: 'SECONDLY', unit: 'seconds'},
    {freq: 'MINUTELY', unit: 'minutes'},
    {freq: 'HOURLY', unit: 'hours'},
    {freq: 'DAILY', unit: 'days'},
    {freq: 'WEEKLY', unit: 'weeks'},
    {freq: 'MONTHLY', unit: 'months'},
    {freq: 'YEARLY', unit: 'years'},
  ] as const)('$freq preserves intervals, UNTIL, duplicates, EXDATE, and nanoseconds', ({freq, unit}) => {
    const dtstart = utc('2026-01-01T09:00:00.000000123');
    const old = dtstart.subtract({hours: 1});
    const extra = dtstart.add({[unit]: 5, nanoseconds: 7});
    const excluded = dtstart.add({[unit]: 7, nanoseconds: 9});
    const rule = new RRuleTemporal({
      freq,
      interval: 2,
      dtstart,
      until: dtstart.add({[unit]: 12}),
      rDate: [excluded, extra, old, old, dtstart.add({[unit]: 4}), dtstart.add({[unit]: 13})],
      exDate: [dtstart.add({[unit]: 8}), excluded.withTimeZone('America/New_York')],
    });
    const dates = rule.all();
    expect(dates).toHaveLength(9);
    expect(dates.at(-1)?.epochNanoseconds).toBe(dtstart.add({[unit]: 13}).epochNanoseconds);
    expectPreviousMatchesAll(rule);
  });

  it.each([0, 1, 4])('keeps COUNT=%i scoped to the rule, including the fallback path', (count) => {
    const dtstart = utc('2026-09-09T00:00:00.000000123');
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      dtstart,
      count,
      strict: true,
      rDate: [dtstart.subtract({hours: 1}), dtstart.add({hours: 10})],
      exDate: [dtstart.add({hours: 1})],
    });
    expect(rule.all()).toHaveLength(2 + count - (count > 1 ? 1 : 0));
    expectPreviousMatchesAll(rule);
  });

  it.each([false, true])(
    'keeps includeDtstart=%s with a filtered start and excluded later periods',
    (includeDtstart) => {
      const dtstart = utc('2026-09-09T09:00');
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        dtstart,
        until: utc('2026-10-01T09:00'),
        byDay: ['MO'],
        includeDtstart,
        rDate: [utc('2026-09-08T09:30')],
        exDate: [utc('2026-09-21T09:00'), utc('2026-09-28T09:00')],
      });
      expect(rule.all()).toHaveLength(includeDtstart ? 3 : 2);
      expectPreviousMatchesAll(rule);
    },
  );

  it.each([
    {start: '2026-03-27T02:30', interval: 1, periods: 6},
    {start: '2026-10-23T02:30', interval: 1, periods: 6},
    {start: '2018-04-01T02:30', interval: 364, periods: 6},
  ])('preserves DST gap/fold behavior from $start at interval $interval', ({start, interval, periods}) => {
    const dtstart = Temporal.ZonedDateTime.from(`${start}[Europe/Berlin]`);
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      interval,
      dtstart,
      until: dtstart.add({days: interval * periods}),
      rDate: [dtstart.subtract({hours: 1}), dtstart.add({days: interval, hours: 1})],
      exDate: [dtstart.add({days: interval * 2})],
    });
    expectPreviousMatchesAll(rule);
  });

  it.each([
    {calendar: 'hebrew', untilCalendar: 'hebrew', withRDate: true},
    {calendar: 'hebrew', untilCalendar: 'iso8601', withRDate: true},
    {calendar: 'hebrew', untilCalendar: 'iso8601', withRDate: false},
    {calendar: 'gregory', untilCalendar: 'iso8601', withRDate: true},
    {calendar: 'indian', untilCalendar: 'iso8601', withRDate: true},
  ])(
    'retains $calendar dates with $untilCalendar UNTIL and RDATE=$withRDate',
    ({calendar, untilCalendar, withRDate}) => {
      const dtstart = utc('2026-01-01T09:00').withCalendar(calendar);
      const rule = new RRuleTemporal({
        freq: 'MONTHLY',
        dtstart,
        until: dtstart.add({months: 6}).withCalendar(untilCalendar).withTimeZone('America/New_York'),
        rDate: withRDate ? [dtstart.subtract({days: 1}), dtstart.add({months: 2, days: 3})] : undefined,
      });
      expectPreviousMatchesAll(rule);
    },
  );

  it.each([
    {freq: 'WEEKLY', byDay: ['MO', 'WE', 'FR'], bySetPos: [1, -1]},
    {freq: 'MONTHLY', byDay: ['MO', 'TU', 'WE', 'TH', 'FR'], bySetPos: [-1]},
    {freq: 'YEARLY', byMonth: [2, 6, 11], byMonthDay: [1, 15, -1], bySetPos: [1, -1]},
  ] as const)('$freq preserves BYSETPOS within each complete period', (parts) => {
    const dtstart = utc('2026-01-01T09:00');
    const rule = new RRuleTemporal({
      ...parts,
      byDay: 'byDay' in parts ? [...parts.byDay] : undefined,
      byMonth: 'byMonth' in parts ? [...parts.byMonth] : undefined,
      byMonthDay: 'byMonthDay' in parts ? [...parts.byMonthDay] : undefined,
      bySetPos: [...parts.bySetPos],
      byHour: [9, 17],
      dtstart,
      interval: 2,
      until: dtstart.add({years: 2}),
      rDate: [dtstart.subtract({hours: 1}), dtstart.add({months: 3, hours: 2})],
      exDate: [utc('2026-01-30T17:00')],
    });
    expectPreviousMatchesAll(rule);
  });

  it('returns null when every rule occurrence and RDATE is excluded', () => {
    const dtstart = utc('2026-09-09T00:00');
    const old = dtstart.subtract({hours: 1});
    const rule = new RRuleTemporal({freq: 'HOURLY', dtstart, until: dtstart, rDate: [old], exDate: [old, dtstart]});
    expect(rule.previous(dtstart.add({hours: 1}))).toBeNull();
  });

  it.each([false, true])('does not search dense history older than the winning RDATE (inclusive=%s)', (inclusive) => {
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART:20260901T000000Z\nRRULE:FREQ=SECONDLY;BYMONTHDAY=1\nRDATE:20260928T120000Z',
    });
    expect(rule.previous(utc('2026-09-29T12:00'), inclusive)?.epochNanoseconds).toBe(
      utc('2026-09-28T12:00').epochNanoseconds,
    );
    expect(rule.previous(utc('2026-09-28T12:00'), true)?.epochNanoseconds).toBe(
      utc('2026-09-28T12:00').epochNanoseconds,
    );
  });

  it('keeps a later RRULE occurrence when a dense rule also has an earlier RDATE', () => {
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART:20260901T000000Z\nRRULE:FREQ=SECONDLY;BYMONTHDAY=1\nRDATE:20260928T120000Z',
    });
    expect(rule.previous(utc('2026-10-01T00:00:02'))?.epochNanoseconds).toBe(
      utc('2026-10-01T00:00:01').epochNanoseconds,
    );
  });

  it('uses the selected Temporal implementation for both rule and RDATE answers', () => {
    const rule = new RRuleTemporal({
      temporal: JsTemporal,
      rruleString: 'DTSTART:20260909T000000Z\nRRULE:FREQ=HOURLY\nRDATE:20260909T103012Z',
    });
    for (const [target, expected] of [
      ['2026-09-09T12:00:00', '2026-09-09T11:00:00'],
      ['2026-09-09T11:00:00', '2026-09-09T10:30:12'],
    ]) {
      const result = rule.previous(utc(target!));
      expect(result).toBeInstanceOf(JsTemporal.ZonedDateTime);
      expect(result?.epochNanoseconds).toBe(utc(expected!).epochNanoseconds);
    }
  });

  it.each([
    {freq: 'SECONDLY', unit: 'seconds'},
    {freq: 'MINUTELY', unit: 'minutes'},
    {freq: 'HOURLY', unit: 'hours'},
  ] as const)('keeps distant $freq queries within a small iteration budget', ({freq, unit}) => {
    const dtstart = utc('1970-01-01T00:00');
    const target = utc('2026-09-09T12:00');
    const rule = new RRuleTemporal({
      freq,
      dtstart,
      rDate: [dtstart.add({seconds: 30})],
      maxIterations: 8,
      maxCandidateEvaluations: 8,
    });
    expect(rule.previous(target)?.epochNanoseconds).toBe(target.subtract({[unit]: 1}).epochNanoseconds);
    expect(rule.previous(target, true)?.epochNanoseconds).toBe(target.epochNanoseconds);
  });

  it.each(
    (['MINUTELY', 'SECONDLY'] as const).flatMap((freq) => [1, 24, 72, 480].map((hoursAgo) => ({freq, hoursAgo}))),
  )('finds the last $freq occurrence spent $hoursAgo hours ago without replaying history', ({freq, hoursAgo}) => {
    const dtstart = utc('1970-01-01T00:00');
    const target = utc('2026-09-09T12:00');
    const until = target.subtract({hours: hoursAgo});
    const rule = new RRuleTemporal({
      freq,
      dtstart,
      until,
      rDate: [dtstart.add({seconds: 30})],
      maxIterations: 8,
      maxCandidateEvaluations: 8,
    });
    expect(rule.previous(target)?.epochNanoseconds).toBe(until.epochNanoseconds);
  });
});
