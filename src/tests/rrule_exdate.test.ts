import {Temporal} from 'temporal-polyfill';
import {RRuleTemporal} from '../index';

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
      count: 10, // Generate more than we need so rDates can be added
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

    // Should have 10 dates total: 10 rule-generated minus 1 excluded (Jan 2) = 9, plus 1 rDate (Jan 10) = 10
    expect(dates).toHaveLength(10);
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
