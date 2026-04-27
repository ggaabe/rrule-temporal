import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from '../src';

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

  it('honors EXDATE supplied outside the RRULE string', () => {
    const utcDtstart = Temporal.Instant.from('2026-04-28T16:00:00.000Z').toZonedDateTimeISO('UTC');
    const exception = Temporal.Instant.from('2026-05-02T16:00:00Z').toZonedDateTimeISO('UTC');

    const rule = new RRuleTemporal({
      rruleString: 'RRULE:FREQ=DAILY',
      dtstart: utcDtstart,
      exDate: [exception],
      count: 10,
    });

    const occurrences = rule.all().map((date) => date.toString());
    expect(rule.options().exDate?.map((date) => date.toString())).toEqual([exception.toString()]);
    expect(occurrences).not.toContain(exception.toString());
    expect(occurrences).toHaveLength(9);
  });

  it('merges parsed and supplied RDATE/EXDATE values', () => {
    const rDateFromParams = Temporal.Instant.from('2026-04-30T18:00:00Z').toZonedDateTimeISO('UTC');
    const exDateFromParams = Temporal.Instant.from('2026-05-01T16:00:00Z').toZonedDateTimeISO('UTC');

    const rule = new RRuleTemporal({
      rruleString: [
        'DTSTART:20260428T160000Z',
        'RRULE:FREQ=DAILY;COUNT=5',
        'RDATE:20260429T180000Z',
        'EXDATE:20260430T160000Z',
      ].join('\n'),
      rDate: [rDateFromParams],
      exDate: [exDateFromParams],
    });

    const occurrences = rule.all().map((date) => date.toString());
    expect(rule.options().rDate?.map((date) => date.toString())).toEqual([
      '2026-04-29T18:00:00+00:00[UTC]',
      rDateFromParams.toString(),
    ]);
    expect(rule.options().exDate?.map((date) => date.toString())).toEqual([
      '2026-04-30T16:00:00+00:00[UTC]',
      exDateFromParams.toString(),
    ]);
    expect(occurrences).toEqual([
      '2026-04-28T16:00:00+00:00[UTC]',
      '2026-04-29T16:00:00+00:00[UTC]',
      '2026-04-29T18:00:00+00:00[UTC]',
      '2026-04-30T18:00:00+00:00[UTC]',
      '2026-05-02T16:00:00+00:00[UTC]',
    ]);
  });
});
