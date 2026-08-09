import {Temporal} from '../src/temporal-impl';
import {RRuleTemporal} from '../src';

describe('RRuleTemporal - exDate exclusions', () => {
  test('exDate excludes specific dates from daily recurrence', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');
    const exDate1 = Temporal.ZonedDateTime.from('2025-01-03T10:00:00[UTC]');
    const exDate2 = Temporal.ZonedDateTime.from('2025-01-05T10:00:00[UTC]');

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 10,
      dtstart,
      exDate: [exDate1, exDate2],
    });

    const dates = rule.all();
    expect(dates).toHaveLength(8); // 10 - 2 excluded = 8

    // Verify excluded dates are not in the result
    const dateStrings = dates.map((d) => d.toString());
    expect(dateStrings).not.toContain(exDate1.toString());
    expect(dateStrings).not.toContain(exDate2.toString());

    // Verify other dates are still present
    expect(dateStrings).toContain('2025-01-01T10:00:00+00:00[UTC]');
    expect(dateStrings).toContain('2025-01-02T10:00:00+00:00[UTC]');
    expect(dateStrings).toContain('2025-01-04T10:00:00+00:00[UTC]');
    expect(dateStrings).toContain('2025-01-06T10:00:00+00:00[UTC]');
  });

  test('exDate works with rDate combination', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');
    const rDate1 = Temporal.ZonedDateTime.from('2025-01-10T10:00:00[UTC]');
    const rDate2 = Temporal.ZonedDateTime.from('2025-01-15T10:00:00[UTC]');
    const exDate1 = Temporal.ZonedDateTime.from('2025-01-02T10:00:00[UTC]');
    const exDate2 = Temporal.ZonedDateTime.from('2025-01-15T10:00:00[UTC]'); // Exclude one of the rDates

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 10,
      dtstart,
      rDate: [rDate1, rDate2],
      exDate: [exDate1, exDate2],
    });

    const dates = rule.all();
    const dateStrings = dates.map((d) => d.toString());

    // Should include: Jan 1, 3, 4, 5, 6, 7, 8, 9, 10 (Jan 2 and 15 excluded)
    expect(dateStrings).toContain('2025-01-01T10:00:00+00:00[UTC]');
    expect(dateStrings).toContain('2025-01-03T10:00:00+00:00[UTC]');
    expect(dateStrings).toContain('2025-01-04T10:00:00+00:00[UTC]');
    expect(dateStrings).toContain('2025-01-05T10:00:00+00:00[UTC]');
    expect(dateStrings).toContain('2025-01-10T10:00:00+00:00[UTC]');

    // Should not include excluded dates
    expect(dateStrings).not.toContain('2025-01-02T10:00:00+00:00[UTC]');
    expect(dateStrings).not.toContain('2025-01-15T10:00:00+00:00[UTC]');

    // COUNT bounds the RRULE's 10 dates. Jan 10 is already one of them, then
    // EXDATE removes Jan 2 and the additional Jan 15 RDATE.
    expect(dates).toHaveLength(9);
  });

  test('applies COUNT before unioning RDATE and subtracting EXDATE', () => {
    const rule = new RRuleTemporal({
      rruleString: [
        'DTSTART;VALUE=DATE:20260401',
        'RRULE:FREQ=DAILY;COUNT=3',
        'RDATE;VALUE=DATE:20260405',
        'EXDATE;VALUE=DATE:20260402',
      ].join('\n'),
      strict: true,
    });
    const expected = ['2026-04-01', '2026-04-03', '2026-04-05'];

    expect(rule.all().map((date) => date.toPlainDate().toString())).toEqual(expected);
    expect(rule.all(() => true).map((date) => date.toPlainDate().toString())).toEqual(expected);
    expect(rule.next(Temporal.ZonedDateTime.from('2026-04-03T00:00:00[UTC]'))?.toPlainDate().toString()).toBe(
      '2026-04-05',
    );
  });

  test('applies UNTIL only to RRULE dates before recurrence-set operations', () => {
    const rule = new RRuleTemporal({
      rruleString: [
        'DTSTART;VALUE=DATE:20260401',
        'RRULE:FREQ=DAILY;UNTIL=20260403',
        'RDATE;VALUE=DATE:20260405',
        'EXDATE;VALUE=DATE:20260402',
      ].join('\n'),
      strict: true,
    });

    expect(rule.all().map((date) => date.toPlainDate().toString())).toEqual(['2026-04-01', '2026-04-03', '2026-04-05']);
  });

  test('keeps next() lazy for large bounded rules with EXDATE', () => {
    const dtstart = Temporal.ZonedDateTime.from('2026-01-01T00:00:00[UTC]');
    const exDate = Temporal.ZonedDateTime.from('2030-01-01T00:00:00[UTC]');
    const countRule = new RRuleTemporal({
      freq: 'SECONDLY',
      count: 10_000,
      dtstart,
      exDate: [exDate],
      maxIterations: 3,
    });
    const untilRule = new RRuleTemporal({
      freq: 'SECONDLY',
      until: dtstart.add({days: 1}),
      dtstart,
      exDate: [exDate],
      maxIterations: 3,
    });

    expect(countRule.next(dtstart)?.toString()).toBe('2026-01-01T00:00:01+00:00[UTC]');
    expect(untilRule.next(dtstart)?.toString()).toBe('2026-01-01T00:00:01+00:00[UTC]');
  });

  test('streams RDATE in order before applying an iterator limit', () => {
    const dtstart = Temporal.ZonedDateTime.from('2026-04-01T00:00:00[UTC]');
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      dtstart,
      rDate: [dtstart.subtract({days: 2})],
      exDate: [dtstart.add({days: 1})],
    });
    const visited: string[] = [];

    const dates = rule.all((date, index) => {
      visited.push(date.toPlainDate().toString());
      return index < 2;
    });

    expect(dates.map((date) => date.toPlainDate().toString())).toEqual(['2026-03-30', '2026-04-01']);
    expect(visited).toEqual(['2026-03-30', '2026-04-01', '2026-04-03']);
  });

  test('exDate works with between() method', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');
    const exDate1 = Temporal.ZonedDateTime.from('2025-01-03T10:00:00[UTC]');
    const exDate2 = Temporal.ZonedDateTime.from('2025-01-07T10:00:00[UTC]');

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      exDate: [exDate1, exDate2],
    });

    const start = new Date('2025-01-01T00:00:00Z');
    const end = new Date('2025-01-10T00:00:00Z');
    const dates = rule.between(start, end, true);
    const dateStrings = dates.map((d) => d.toString());

    // Verify excluded dates are not in the result
    expect(dateStrings).not.toContain(exDate1.toString());
    expect(dateStrings).not.toContain(exDate2.toString());

    // Verify other dates are present
    expect(dateStrings).toContain('2025-01-01T10:00:00+00:00[UTC]');
    expect(dateStrings).toContain('2025-01-02T10:00:00+00:00[UTC]');
    expect(dateStrings).toContain('2025-01-04T10:00:00+00:00[UTC]');
    expect(dateStrings).toContain('2025-01-05T10:00:00+00:00[UTC]');
    expect(dateStrings).toContain('2025-01-06T10:00:00+00:00[UTC]');
    expect(dateStrings).toContain('2025-01-08T10:00:00+00:00[UTC]');
    expect(dateStrings).toContain('2025-01-09T10:00:00+00:00[UTC]');
  });

  test('exDate with empty array has no effect', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      dtstart,
      exDate: [],
    });

    const dates = rule.all();
    expect(dates).toHaveLength(3);
    expect(dates.map((d) => d.toString())).toEqual([
      '2025-01-01T10:00:00+00:00[UTC]',
      '2025-01-02T10:00:00+00:00[UTC]',
      '2025-01-03T10:00:00+00:00[UTC]',
    ]);
  });

  test('exDate with no matches has no effect', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');
    const exDate1 = Temporal.ZonedDateTime.from('2025-02-01T10:00:00[UTC]'); // Not in range

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      dtstart,
      exDate: [exDate1],
    });

    const dates = rule.all();
    expect(dates).toHaveLength(3);
    expect(dates.map((d) => d.toString())).toEqual([
      '2025-01-01T10:00:00+00:00[UTC]',
      '2025-01-02T10:00:00+00:00[UTC]',
      '2025-01-03T10:00:00+00:00[UTC]',
    ]);
  });
});
