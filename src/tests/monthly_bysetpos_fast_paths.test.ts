import {parse, assertDates} from './helpers';

describe('Monthly BYSETPOS regressions', () => {
  it('keeps last-weekday monthly selection in UTC', () => {
    const rule = parse(`DTSTART;TZID=UTC:20250101T120000
RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=4`.trim());

    assertDates({rule}, [
      '2025-01-31T12:00:00.000Z',
      '2025-02-28T12:00:00.000Z',
      '2025-03-31T12:00:00.000Z',
      '2025-04-30T12:00:00.000Z',
    ]);
  });

  it('keeps first-and-last weekday selection when there is a single expanded time slot', () => {
    const rule = parse(`DTSTART;TZID=UTC:20250101T120000
RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1,-1;BYHOUR=8;BYMINUTE=0;COUNT=6`.trim());

    assertDates({rule}, [
      '2025-01-31T08:00:00.000Z',
      '2025-02-03T08:00:00.000Z',
      '2025-02-28T08:00:00.000Z',
      '2025-03-03T08:00:00.000Z',
      '2025-03-31T08:00:00.000Z',
      '2025-04-01T08:00:00.000Z',
    ]);
  });

  it('still applies BYSETPOS after time expansion when multiple BYHOUR values are present', () => {
    const rule = parse(`DTSTART;TZID=UTC:20250101T000000
RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;BYHOUR=8,20;BYMINUTE=0;COUNT=3`.trim());

    assertDates({rule}, [
      '2025-01-31T20:00:00.000Z',
      '2025-02-28T20:00:00.000Z',
      '2025-03-31T20:00:00.000Z',
    ]);
  });
});
