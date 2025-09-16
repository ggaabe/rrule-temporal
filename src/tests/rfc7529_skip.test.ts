import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from '../index';

describe('RFC 7529 RSCALE/SKIP (Gregorian)', () => {
  const tz = 'UTC';

  test('parses SKIP before RSCALE when provided later in rule', () => {
    expect(() => {
      const rule = new RRuleTemporal({
        rruleString: `DTSTART;TZID=${tz}:20250131T080000
RRULE:SKIP=BACKWARD;RSCALE=GREGORIAN;FREQ=MONTHLY;COUNT=3`,
      });
      rule.all();
    }).not.toThrow();
  });

  test('YEARLY Feb 29 with SKIP=OMIT (leap years only)', () => {
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:20160229T000000\nRRULE:RSCALE=GREGORIAN;SKIP=OMIT;FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=6`,
    });
    const out = rule.all();
    const got = out.map((z) => z.toString({smallestUnit: 'second'}));
    const expYears = [2016, 2020, 2024, 2028, 2032, 2036];
    const exp = expYears.map((y) => Temporal.ZonedDateTime.from({year: y, month: 2, day: 29, timeZone: tz}).toString({smallestUnit: 'second'}));
    expect(got).toEqual(exp);
  });

  test('YEARLY Feb 29 with SKIP=BACKWARD (Feb 28 in non-leap years)', () => {
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:20160229T000000\nRRULE:RSCALE=GREGORIAN;SKIP=BACKWARD;FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=6`,
    });
    const out = rule.all();
    const got = out.map((z) => z.toString({smallestUnit: 'second'}));
    const expDates = [
      [2016, 2, 29],
      [2017, 2, 28],
      [2018, 2, 28],
      [2019, 2, 28],
      [2020, 2, 29],
      [2021, 2, 28],
    ];
    const exp = expDates.map(([y, m, d]) => Temporal.ZonedDateTime.from({year: y, month: m, day: d, timeZone: tz}).toString({smallestUnit: 'second'}));
    expect(got).toEqual(exp);
  });

  test('YEARLY Feb 29 with SKIP=FORWARD (Mar 1 in non-leap years)', () => {
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:20160229T000000\nRRULE:RSCALE=GREGORIAN;SKIP=FORWARD;FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=6`,
    });
    const out = rule.all();
    const got = out.map((z) => z.toString({smallestUnit: 'second'}));
    const expDates = [
      [2016, 2, 29],
      [2017, 3, 1],
      [2018, 3, 1],
      [2019, 3, 1],
      [2020, 2, 29],
      [2021, 3, 1],
    ];
    const exp = expDates.map(([y, m, d]) => Temporal.ZonedDateTime.from({year: y, month: m, day: d, timeZone: tz}).toString({smallestUnit: 'second'}));
    expect(got).toEqual(exp);
  });

  test('MONTHLY Jan 31 with SKIP=OMIT (skip short months)', () => {
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:20250131T080000\nRRULE:RSCALE=GREGORIAN;SKIP=OMIT;FREQ=MONTHLY;COUNT=6`,
    });
    const out = rule.all();
    const got = out.map((z) => z.toString({smallestUnit: 'second'}));
    const expDates = [
      [2025, 1, 31],
      [2025, 3, 31],
      [2025, 5, 31],
      [2025, 7, 31],
      [2025, 8, 31],
      [2025, 10, 31],
    ];
    const exp = expDates.map(([y, m, d]) => Temporal.ZonedDateTime.from({year: y, month: m, day: d, hour: 8, timeZone: tz}).toString({smallestUnit: 'second'}));
    expect(got).toEqual(exp);
  });

  test('MONTHLY Jan 31 with SKIP=BACKWARD (clamp to month end)', () => {
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:20250131T080000\nRRULE:RSCALE=GREGORIAN;SKIP=BACKWARD;FREQ=MONTHLY;COUNT=6`,
    });
    const out = rule.all();
    const got = out.map((z) => z.toString({smallestUnit: 'second'}));
    const expDates = [
      [2025, 1, 31],
      [2025, 2, 28],
      [2025, 3, 31],
      [2025, 4, 30],
      [2025, 5, 31],
      [2025, 6, 30],
    ];
    const exp = expDates.map(([y, m, d]) => Temporal.ZonedDateTime.from({year: y, month: m, day: d, hour: 8, timeZone: tz}).toString({smallestUnit: 'second'}));
    expect(got).toEqual(exp);
  });

  test('MONTHLY Jan 31 with SKIP=FORWARD (first of next month)', () => {
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:20250131T080000\nRRULE:RSCALE=GREGORIAN;SKIP=FORWARD;FREQ=MONTHLY;COUNT=6`,
    });
    const out = rule.all();
    const got = out.map((z) => z.toString({smallestUnit: 'second'}));
    const expDates = [
      [2025, 1, 31],
      [2025, 3, 1],
      [2025, 3, 31],
      [2025, 5, 1],
      [2025, 5, 31],
      [2025, 7, 1],
    ];
    const exp = expDates.map(([y, m, d]) => Temporal.ZonedDateTime.from({year: y, month: m, day: d, hour: 8, timeZone: tz}).toString({smallestUnit: 'second'}));
    expect(got).toEqual(exp);
  });

  test('RSCALE and SKIP are serialized in RRULE', () => {
    const rruleString = `DTSTART;TZID=${tz}:20250131T080000\nRRULE:RSCALE=GREGORIAN;SKIP=BACKWARD;FREQ=MONTHLY;COUNT=2`;
    const rule = new RRuleTemporal({rruleString});
    const out = rule.toString();
    expect(out).toContain('RSCALE=GREGORIAN');
    expect(out).toContain('SKIP=BACKWARD');
  });
});
