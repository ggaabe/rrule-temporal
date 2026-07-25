import {parse, assertDates} from './helpers';
import {Temporal} from '../src/temporal-impl';
import {RRuleTemporal} from '../src';

describe('UTC simple generator regressions', () => {
  it('preserves UTC daily cadence without generic filtering', () => {
    const rule = parse(`DTSTART;TZID=UTC:20250101T235959
RRULE:FREQ=DAILY;COUNT=3`.trim());

    assertDates({rule}, [
      '2025-01-01T23:59:59.000Z',
      '2025-01-02T23:59:59.000Z',
      '2025-01-03T23:59:59.000Z',
    ]);
  });

  it('keeps DAILY interval semantics when simple BYDAY filters are present', () => {
    const rule = parse(`DTSTART;TZID=UTC:20250107T093000
RRULE:FREQ=DAILY;INTERVAL=2;BYDAY=MO,WE,FR;COUNT=6`.trim());

    assertDates({rule}, [
      '2025-01-13T09:30:00.000Z',
      '2025-01-15T09:30:00.000Z',
      '2025-01-17T09:30:00.000Z',
      '2025-01-27T09:30:00.000Z',
      '2025-01-29T09:30:00.000Z',
      '2025-01-31T09:30:00.000Z',
    ]);
  });

  it('keeps HOURLY UTC UNTIL bounds inclusive', () => {
    const rule = parse(`DTSTART;TZID=UTC:20250101T220000
RRULE:FREQ=HOURLY;INTERVAL=1;UNTIL=20250102T020000Z`.trim());

    assertDates({rule}, [
      '2025-01-01T22:00:00.000Z',
      '2025-01-01T23:00:00.000Z',
      '2025-01-02T00:00:00.000Z',
      '2025-01-02T01:00:00.000Z',
      '2025-01-02T02:00:00.000Z',
    ]);
  });

  it('keeps MINUTELY UTC cadence with second precision', () => {
    const rule = parse(`DTSTART;TZID=UTC:20250101T235958
RRULE:FREQ=MINUTELY;COUNT=4`.trim());

    assertDates({rule}, [
      '2025-01-01T23:59:58.000Z',
      '2025-01-02T00:00:58.000Z',
      '2025-01-02T00:01:58.000Z',
      '2025-01-02T00:02:58.000Z',
    ]);
  });

  it('keeps SECONDLY UTC cadence with sub-millisecond precision', () => {
    const rule = parse(`DTSTART;TZID=UTC:20250101T235958
RRULE:FREQ=SECONDLY;INTERVAL=2;COUNT=4`.trim()).with({
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T23:59:58.000123456[UTC]'),
    });

    expect(rule.all().map((date) => date.toString())).toEqual([
      '2025-01-01T23:59:58.000123456+00:00[UTC]',
      '2025-01-02T00:00:00.000123456+00:00[UTC]',
      '2025-01-02T00:00:02.000123456+00:00[UTC]',
      '2025-01-02T00:00:04.000123456+00:00[UTC]',
    ]);
  });

  it('expands DAILY time slots in chronological order', () => {
    const rule = parse(`DTSTART;TZID=UTC:20250101T120000
RRULE:FREQ=DAILY;INTERVAL=2;BYDAY=MO,WE,FR;BYHOUR=9,17;BYMINUTE=0,30;COUNT=7`.trim());

    assertDates({rule}, [
      '2025-01-01T17:00:00.000Z',
      '2025-01-01T17:30:00.000Z',
      '2025-01-03T09:00:00.000Z',
      '2025-01-03T09:30:00.000Z',
      '2025-01-03T17:00:00.000Z',
      '2025-01-03T17:30:00.000Z',
      '2025-01-13T09:00:00.000Z',
    ]);
  });

  it('defers duplicate DAILY time slots to the legacy generator', () => {
    for (const timeZone of ['UTC', 'America/Chicago']) {
      const fastEligibleRule = new RRuleTemporal({
        freq: 'DAILY',
        count: 7,
        byHour: [9, 9, 17],
        dtstart: Temporal.ZonedDateTime.from(`2025-01-01T00:00:00[${timeZone}]`),
        cache: false,
      });
      const forcedGeneralRule = fastEligibleRule.with({exDate: []});

      expect(fastEligibleRule.all().map((date) => date.toString())).toEqual(
        forcedGeneralRule.all().map((date) => date.toString()),
      );
    }
  });

  it('keeps WEEKLY UTC ordering with explicit WKST and multiple BYDAY values', () => {
    const rule = parse(`DTSTART;TZID=UTC:20250101T090000
RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=SU,WE;COUNT=6`.trim());

    assertDates({rule}, [
      '2025-01-01T09:00:00.000Z',
      '2025-01-05T09:00:00.000Z',
      '2025-01-08T09:00:00.000Z',
      '2025-01-12T09:00:00.000Z',
      '2025-01-15T09:00:00.000Z',
      '2025-01-19T09:00:00.000Z',
    ]);
  });

  it('expands WEEKLY days and time slots in chronological order', () => {
    const rule = parse(`DTSTART;TZID=UTC:20250101T120000
RRULE:FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=SU,WE;BYHOUR=9,17;COUNT=7`.trim());

    assertDates({rule}, [
      '2025-01-01T17:00:00.000Z',
      '2025-01-12T09:00:00.000Z',
      '2025-01-12T17:00:00.000Z',
      '2025-01-15T09:00:00.000Z',
      '2025-01-15T17:00:00.000Z',
      '2025-01-26T09:00:00.000Z',
      '2025-01-26T17:00:00.000Z',
    ]);
  });
});
