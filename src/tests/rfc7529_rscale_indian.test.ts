import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from '../index';

describe('RSCALE=INDIAN support', () => {
  const tz = 'UTC';

  function findIndianMonth1Day1InYear(gYear: number): Temporal.ZonedDateTime {
    let z = Temporal.ZonedDateTime.from(`${gYear}-01-01T00:00:00+00:00[UTC]`);
    for (let i = 0; i < 366; i++) {
      const iCal = z.withCalendar('indian');
      if (iCal.monthCode === 'M01' && iCal.day === 1) return z;
      z = z.add({days: 1});
    }
    throw new Error('Could not find Indian M01-01 in that year');
  }

  test('YEARLY Indian New Year (M01 D1)', () => {
    const dt = findIndianMonth1Day1InYear(2024);
    const dtline = dt.toString({smallestUnit: 'second'}).replace(/[-:]/g, '').slice(0, 15);
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:${dtline}\nRRULE:RSCALE=INDIAN;FREQ=YEARLY;COUNT=3`,
    });
    const out = rule.all();
    expect(out.length).toBe(3);
    for (const occ of out) {
      const iCal = occ.withCalendar('indian');
      expect(iCal.monthCode).toBe('M01');
      expect(iCal.day).toBe(1);
    }
  });

  test('DAILY + BYYEARDAY=1 (INDIAN): only Indian day-of-year 1', () => {
    // Choose a start day at 09:00 UTC around Indian New Year
    const dt = findIndianMonth1Day1InYear(2024).with({hour: 9});
    const dtline = dt.toString({smallestUnit: 'second'}).replace(/[-:]/g, '').slice(0, 15);
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:${dtline}\nRRULE:RSCALE=INDIAN;FREQ=DAILY;BYYEARDAY=1;COUNT=2`,
    });
    const out = rule.all();
    expect(out.length).toBe(2);
    for (const occ of out) {
      const iCal = occ.withCalendar('indian');
      expect(iCal.dayOfYear).toBe(1);
      expect(occ.hour).toBe(9);
    }
  });
});

