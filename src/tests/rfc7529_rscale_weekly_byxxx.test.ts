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

describe('RSCALE Weekly/BYYEARDAY/BYWEEKNO (Hebrew/Chinese)', () => {
  const tz = 'UTC';

  test('HEBREW: YEARLY BYYEARDAY=1 → Tishrei 1', () => {
    // Pick a Tishrei 1 (Hebrew M01 d1) in 2024
    let z = Temporal.ZonedDateTime.from('2024-01-01T00:00:00+00:00[UTC]');
    let dt: Temporal.ZonedDateTime | null = null;
    for (let i = 0; i < 800; i++) {
      const h = z.withCalendar('hebrew');
      if (h.monthCode === 'M01' && h.day === 1) {
        dt = z;
        break;
      }
      z = z.add({days: 1});
    }
    expect(dt).not.toBeNull();
    const dtline = dt!.toString({smallestUnit: 'second'}).replace(/[-:]/g, '').slice(0, 15);
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:${dtline}\nRRULE:RSCALE=HEBREW;FREQ=YEARLY;BYYEARDAY=1;COUNT=3`,
    });
    const out = rule.all();
    out.forEach((o) => {
      const h = o.withCalendar('hebrew');
      expect(h.dayOfYear).toBe(1);
    });
  });

  test('HEBREW: YEARLY BYWEEKNO=1;BYDAY=MO (wkst=MO)', () => {
    // Find a Hebrew date in 2024, then request first week, Mondays
    const dt = Temporal.ZonedDateTime.from('2024-01-01T00:00:00+00:00[UTC]');
    const dtline = dt.toString({smallestUnit: 'second'}).replace(/[-:]/g, '').slice(0, 15);
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:${dtline}\nRRULE:RSCALE=HEBREW;WKST=MO;FREQ=YEARLY;BYWEEKNO=1;BYDAY=MO;COUNT=3`,
    });
    const out = rule.all();
    out.forEach((o) => {
      expect(o.dayOfWeek).toBe(1);
      const pd = o.toPlainDate().withCalendar('hebrew');
      const idx = weekIndexHebrew(pd, 1);
      // Allow only week 1
      expect(idx).toBe(1);
    });
  });

  test('HEBREW: WEEKLY;BYDAY=MO;COUNT=3 returns Mondays', () => {
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:20240101T100000\nRRULE:RSCALE=HEBREW;FREQ=WEEKLY;BYDAY=MO;COUNT=3`,
    });
    const out = rule.all();
    out.forEach((o) => expect(o.dayOfWeek).toBe(1));
  });
});
