import {parse, assertDates} from './helpers';

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
});
