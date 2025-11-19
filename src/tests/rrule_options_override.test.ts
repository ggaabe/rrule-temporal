import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from '../index';

describe('ICS options override missing COUNT/UNTIL', () => {
  const dtstart = Temporal.ZonedDateTime.from('2025-01-01T00:00:00[Europe/Paris]');

  it('honors UNTIL supplied outside the RRULE string', () => {
    const until = dtstart.add({days: 1, hours: 5});

    const rule = new RRuleTemporal({
      rruleString: 'RRULE:FREQ=DAILY;BYHOUR=5',
      dtstart,
      until,
    });

    const occurrences = rule.all().map((date) => date.toString());
    expect(occurrences).toEqual([
      '2025-01-01T05:00:00+01:00[Europe/Paris]',
      '2025-01-02T05:00:00+01:00[Europe/Paris]',
    ]);
  });

  it('honors COUNT supplied outside the RRULE string', () => {
    const rule = new RRuleTemporal({
      rruleString: 'RRULE:FREQ=DAILY;BYHOUR=5',
      dtstart,
      count: 2,
    });

    const occurrences = rule.all().map((date) => date.toString());
    expect(occurrences).toEqual([
      '2025-01-01T05:00:00+01:00[Europe/Paris]',
      '2025-01-02T05:00:00+01:00[Europe/Paris]',
    ]);
  });
});
