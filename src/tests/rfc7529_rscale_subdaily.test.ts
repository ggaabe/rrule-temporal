import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from '../index';

function weekIndexHebrew(pd: Temporal.PlainDate, wkst: number) {
  const weekStart = pd.subtract({days: (pd.dayOfWeek - wkst + 7) % 7});
  const thursday = weekStart.add({days: (4 - wkst + 7) % 7});
  const weekYear = thursday.year;
  const jan4 = Temporal.PlainDate.from({calendar: 'hebrew', year: weekYear, month: 1, day: 4});
  const firstStart = jan4.subtract({days: (jan4.dayOfWeek - wkst + 7) % 7});
  return Math.floor(pd.since(firstStart).days / 7) + 1;
}

describe('RSCALE sub-daily intersections (BYYEARDAY/BYWEEKNO)', () => {
  const tz = 'UTC';

  test('HOURLY + BYYEARDAY (HEBREW): occurrences on Hebrew day-of-year 1 only', () => {
    // Find Hebrew day-of-year 1 in 2024 for DTSTART @ 09:00 UTC
    let z = Temporal.ZonedDateTime.from('2024-01-01T09:00:00+00:00[UTC]');
    let dt: Temporal.ZonedDateTime | null = null;
    for (let i = 0; i < 1000; i++) {
      const h = z.withCalendar('hebrew');
      if (h.dayOfYear === 1) {
        dt = z;
        break;
      }
      z = z.add({days: 1});
    }
    expect(dt).not.toBeNull();
    const dtline = dt!.toString({smallestUnit: 'second'}).replace(/[-:]/g, '').slice(0, 15);
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:${dtline}\nRRULE:RSCALE=HEBREW;FREQ=HOURLY;INTERVAL=24;BYYEARDAY=1;COUNT=2`,
    });
    const out = rule.all();
    expect(out.length).toBe(2);
    for (const occ of out) {
      const h = occ.withCalendar('hebrew');
      expect(h.dayOfYear).toBe(1);
      expect(occ.hour).toBe(dt!.hour);
      expect(occ.minute).toBe(dt!.minute);
    }
  });

  test('MINUTELY + BYWEEKNO/ BYDAY (HEBREW): Mondays in week 1 only', () => {
    const dt = Temporal.ZonedDateTime.from('2024-01-01T06:00:00+00:00[UTC]');
    const dtline = dt.toString({smallestUnit: 'second'}).replace(/[-:]/g, '').slice(0, 15);
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:${dtline}\nRRULE:RSCALE=HEBREW;WKST=MO;FREQ=MINUTELY;INTERVAL=1440;BYWEEKNO=1;BYDAY=MO;COUNT=2`,
    });
    const out = rule.all();
    expect(out.length).toBe(2);
    for (const occ of out) {
      expect(occ.dayOfWeek).toBe(1);
      const pd = occ.toPlainDate().withCalendar('hebrew');
      const idx = weekIndexHebrew(pd, 1);
      expect(idx).toBe(1);
    }
  });
});

