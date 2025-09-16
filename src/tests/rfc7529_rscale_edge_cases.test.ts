import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from '../index';

function iso(z: Temporal.ZonedDateTime) {
  return z.toString({smallestUnit: 'second'});
}

describe('RFC 7529 edge cases from PR comments', () => {
  const tz = 'UTC';

  test('SKIP before RSCALE is accepted (ordering not constrained)', () => {
    // Same as MONTHLY Jan 31 SKIP=BACKWARD case but with SKIP before RSCALE
    const rruleString = `DTSTART;TZID=${tz}:20250131T080000\nRRULE:SKIP=BACKWARD;RSCALE=GREGORIAN;FREQ=MONTHLY;COUNT=6`;
    const rule = new RRuleTemporal({rruleString});
    const out = rule.all();
    const got = out.map(iso);
    const expDates: Array<[number, number, number]> = [
      [2025, 1, 31],
      [2025, 2, 28],
      [2025, 3, 31],
      [2025, 4, 30],
      [2025, 5, 31],
      [2025, 6, 30],
    ];
    const exp = expDates.map(([y, m, d]) =>
      Temporal.ZonedDateTime.from({year: y, month: m, day: d, hour: 8, timeZone: tz}).toString({smallestUnit: 'second'})
    );
    expect(got).toEqual(exp);
  });

  test('RSCALE=INDIAN DAILY + BYMONTHDAY=-1 (via BYYEARDAY gating) picks last day-of-month', () => {
    // Pick a date that is the last day of an Indian month in 2024
    let probe = Temporal.ZonedDateTime.from('2024-01-01T06:00:00+00:00[UTC]');
    let target: Temporal.ZonedDateTime | null = null;
    for (let i = 0; i < 400; i++) {
      const iCal = probe.withCalendar('indian');
      const lastDay = iCal.with({day: 1}).add({months: 1}).subtract({days: 1}).day;
      if (iCal.day === lastDay) {
        target = probe;
        break;
      }
      probe = probe.add({days: 1});
    }
    expect(target).not.toBeNull();
    const dt = target!;
    const iDayOfYear = dt.withCalendar('indian').dayOfYear;
    const dtline = dt.toString({smallestUnit: 'second'}).replace(/[-:]/g, '').slice(0, 15);
    const rule = new RRuleTemporal({
      // Add BYYEARDAY so DAILY uses RSCALE engine; combine with BYMONTHDAY=-1
      rruleString: `DTSTART;TZID=${tz}:${dtline}\nRRULE:RSCALE=INDIAN;FREQ=DAILY;BYYEARDAY=${iDayOfYear};BYMONTHDAY=-1;COUNT=1`,
    });
    const out = rule.all();
    expect(out.length).toBe(1);
    const iCal = out[0]!.withCalendar('indian');
    const lastDay = iCal.with({day: 1}).add({months: 1}).subtract({days: 1}).day;
    expect(iCal.day).toBe(lastDay);
  });

  test('RSCALE=INDIAN MONTHLY + BYDAY=1MO yields first Monday of each Indian month', () => {
    const dt = Temporal.ZonedDateTime.from('2024-01-15T00:00:00+00:00[UTC]');
    const dtline = dt.toString({smallestUnit: 'second'}).replace(/[-:]/g, '').slice(0, 15);
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:${dtline}\nRRULE:RSCALE=INDIAN;FREQ=MONTHLY;BYDAY=1MO;COUNT=4`,
    });
    const out = rule.all();
    expect(out.length).toBe(4);
    for (const occ of out) {
      const iCal = occ.withCalendar('indian');
      // Monday in Temporal is 1
      expect(iCal.dayOfWeek).toBe(1);
      // First Monday should be within the first 7 days
      expect(iCal.day).toBeGreaterThanOrEqual(1);
      expect(iCal.day).toBeLessThanOrEqual(7);
    }
  });
});
