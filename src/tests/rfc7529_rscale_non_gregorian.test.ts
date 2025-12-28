import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from '../index';

function isoStrings(zs: Temporal.ZonedDateTime[]) {
  return zs.map((z) => z.withCalendar('iso8601').toString({smallestUnit: 'second'}));
}

function supportsCalendar(calId: string) {
  try {
    const probe = Temporal.ZonedDateTime.from('2000-01-01T00:00:00+00:00[UTC]').withCalendar(calId);
    void probe.year;
    void probe.monthCode;
    void probe.day;
    return true;
  } catch {
    return false;
  }
}

describe('RFC 7529 RSCALE Chinese/Hebrew', () => {
  const tz = 'UTC';
  const chineseTest = supportsCalendar('chinese') ? test : test.skip;

  chineseTest('CHINESE: Chinese New Year yearly from Gregorian DTSTART', () => {
    // Example from RFC: DTSTART is 2013-02-10 (Gregorian), with RSCALE=CHINESE FREQ=YEARLY
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;VALUE=DATE:20130210\nRRULE:RSCALE=CHINESE;FREQ=YEARLY;COUNT=4`,
      tzid: tz,
    });
    const out = rule.all();
    // Validate in Chinese calendar that each occurrence is month=1 day=1
    for (const z of out) {
      const c = z.withCalendar('chinese');
      expect(c.monthCode).toBe('M01');
      expect(c.day).toBe(1);
    }
    // Basic sanity: ensure dates match known initial years from RFC table
    // 2013-02-10, 2014-01-31, 2015-02-19, 2016-02-08
    const expected = [
      '2013-02-10T00:00:00+00:00[UTC]',
      '2014-01-31T00:00:00+00:00[UTC]',
      '2015-02-19T00:00:00+00:00[UTC]',
      '2016-02-08T00:00:00+00:00[UTC]',
    ];
    expect(isoStrings(out)).toEqual(expected);
  });

  test('HEBREW: Yearly Tishrei 1 (Rosh Hashanah pattern)', () => {
    // Find a Gregorian date that corresponds to Hebrew monthCode M01 day 1 and use that as DTSTART
    // We search within 2024 for determinism.
    let found: Temporal.ZonedDateTime | null = null;
    let z = Temporal.ZonedDateTime.from('2024-01-01T00:00:00+00:00[UTC]');
    for (let i = 0; i < 800; i++) {
      const h = z.withCalendar('hebrew');
      if (h.monthCode === 'M01' && h.day === 1) {
        found = z;
        break;
      }
      z = z.add({days: 1});
    }
    expect(found).not.toBeNull();
    const dt = found!;
    const dtline = dt.toString({smallestUnit: 'second'}).replace(/[-:]/g, '').slice(0, 15);
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:${dtline}\nRRULE:RSCALE=HEBREW;FREQ=YEARLY;COUNT=3`,
    });
    const out = rule.all();
    // Validate that each is M01 day 1 in Hebrew calendar
    for (const occ of out) {
      const h = occ.withCalendar('hebrew');
      expect(h.monthCode).toBe('M01');
      expect(h.day).toBe(1);
    }
  });

  test('HEBREW: BYMONTH=5L (leap month) with SKIP behavior', () => {
    // Choose a Hebrew leap year to build DTSTART within leap month (Adar I ~ M05L in Hebrew calendar here)
    let testZ = Temporal.ZonedDateTime.from('2024-01-01T00:00:00+00:00[UTC]');
    let leapMonthStart: Temporal.ZonedDateTime | null = null;
    for (let i = 0; i < 1000; i++) {
      const h = testZ.withCalendar('hebrew');
      if (h.monthCode === 'M05L' && h.day === 1) {
        leapMonthStart = testZ;
        break;
      }
      testZ = testZ.add({days: 1});
    }
    expect(leapMonthStart).not.toBeNull();
    const dt = leapMonthStart!;
    const dtline = dt.toString({smallestUnit: 'second'}).replace(/[-:]/g, '').slice(0, 15);
    // YEARLY BYMONTH=5L;BYMONTHDAY=1;RSCALE=HEBREW; SKIP=OMIT should omit non-leap years
    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=${tz}:${dtline}\nRRULE:RSCALE=HEBREW;SKIP=OMIT;FREQ=YEARLY;BYMONTH=5L;BYMONTHDAY=1;COUNT=4`,
    });
    const out = rule.all();
    // All occurrences must be in Hebrew monthCode M05L day 1
    for (const occ of out) {
      const h = occ.withCalendar('hebrew');
      expect(h.monthCode).toBe('M05L');
      expect(h.day).toBe(1);
    }
  });
});
