import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from '../index';

describe('between() – rruleString vs options consistency (regression)', () => {
  test('weekly MO–FR with distant UNTIL returns same results and does not over-iterate', () => {
    const queryStart = Temporal.ZonedDateTime.from('2025-09-01T00:00:00[UTC]');
    const queryEnd = Temporal.ZonedDateTime.from('2025-09-30T23:59:59[UTC]');

    // Using rruleString (DTSTART at 12:00)
    const rs = new RRuleTemporal({
      rruleString:
        'DTSTART;TZID=UTC:20250101T120000\nRRULE:FREQ=WEEKLY;UNTIL=99991231T000000Z;BYDAY=MO,TU,WE,TH,FR',
    });

    // Using options object (DTSTART at 00:00)
    const ro = new RRuleTemporal({
      freq: 'WEEKLY',
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
      dtstart: Temporal.ZonedDateTime.from({year: 2025, month: 1, day: 1, timeZone: 'UTC'}),
      until: Temporal.ZonedDateTime.from({year: 9999, month: 12, day: 31, timeZone: 'UTC'}),
      tzid: 'UTC',
    });

    const s = rs.between(queryStart, queryEnd, true);
    const o = ro.between(queryStart, queryEnd, true);

    // Same number of business-day occurrences in September 2025
    expect(s.length).toBe(22);
    expect(o.length).toBe(22);

    // Sanity: rruleString path should yield 12:00 occurrences (inherits DTSTART time)
    expect(new Set(s.map((d) => d.hour))).toEqual(new Set([12]));
  });
});

