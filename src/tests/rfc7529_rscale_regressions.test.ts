import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from '../index';

describe('RFC 7529 RSCALE regressions', () => {
  const tz = 'UTC';

  test('BYMONTHDAY=-1 respects the RSCALE month length (Hebrew calendar)', () => {
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:20240125T090000\nRRULE:RSCALE=HEBREW;FREQ=DAILY;BYMONTHDAY=-1;COUNT=6`,
    });
    const got = rule.all().map((z) => z.withCalendar('iso8601').toString({smallestUnit: 'second'}));
    const expDates: Array<[number, number, number]> = [
      [2024, 2, 9],
      [2024, 3, 10],
      [2024, 4, 8],
      [2024, 5, 8],
      [2024, 6, 6],
      [2024, 7, 6],
    ];
    const exp = expDates.map(([y, m, d]) =>
      Temporal.ZonedDateTime.from({year: y, month: m, day: d, hour: 9, timeZone: tz}).toString({smallestUnit: 'second'})
    );
    expect(got).toEqual(exp);
  });

  test('BYDAY=MO selects RSCALE Mondays rather than shifting weekdays', () => {
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:20240101T090000\nRRULE:RSCALE=HEBREW;FREQ=MONTHLY;BYDAY=MO;COUNT=3`,
    });
    const got = rule.all().map((z) => z.withCalendar('iso8601').toString({smallestUnit: 'second'}));
    const expDates: Array<[number, number, number]> = [
      [2024, 1, 1],
      [2024, 1, 8],
      [2024, 1, 15],
    ];
    const exp = expDates.map(([y, m, d]) =>
      Temporal.ZonedDateTime.from({year: y, month: m, day: d, hour: 9, timeZone: tz}).toString({smallestUnit: 'second'})
    );
    expect(got).toEqual(exp);
  });
});
