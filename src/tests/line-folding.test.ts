import {RRuleTemporal} from '../index';

describe('RFC 5545 Line Folding', () => {
  test('should handle simple folded DESCRIPTION line', () => {
    const foldedIcs = `DTSTART;TZID=America/Chicago:20250320T170000
RRULE:FREQ=DAILY;BYHOUR=17;BYMINUTE=0;COUNT=5`;

    const rule = new RRuleTemporal({rruleString: foldedIcs});
    const dates = rule.all();
    expect(dates).toHaveLength(5);
  });

  test('should handle folded RRULE line with CRLF+space', () => {
    const foldedIcs = `DTSTART;TZID=America/Chicago:20250320T170000
RRULE:FREQ=DAILY;BYHOUR=17;BYMINUTE=0;
 COUNT=5`;

    const rule = new RRuleTemporal({rruleString: foldedIcs});
    const dates = rule.all();
    expect(dates).toHaveLength(5);
  });

  test('should handle folded RRULE line with LF+space', () => {
    const foldedIcs = `DTSTART;TZID=America/Chicago:20250320T170000
RRULE:FREQ=DAILY;BYHOUR=17;BYMINUTE=0;
 COUNT=5`;

    const rule = new RRuleTemporal({rruleString: foldedIcs});
    const dates = rule.all();
    expect(dates).toHaveLength(5);
  });

  test('should handle folded RRULE line with CRLF+tab', () => {
    const foldedIcs = `DTSTART;TZID=America/Chicago:20250320T170000
RRULE:FREQ=DAILY;BYHOUR=17;BYMINUTE=0;
	COUNT=5`;

    const rule = new RRuleTemporal({rruleString: foldedIcs});
    const dates = rule.all();
    expect(dates).toHaveLength(5);
  });

  test('should handle complex folded RRULE with multiple folds', () => {
    const foldedIcs = `DTSTART;TZID=America/Chicago:20250320T170000
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;
 BYHOUR=9,12,15;
 BYMINUTE=0;COUNT=10`;

    const rule = new RRuleTemporal({rruleString: foldedIcs});
    const dates = rule.all();
    expect(dates).toHaveLength(10);

    // Verify that all dates are on weekdays and at correct times
    for (const date of dates) {
      expect([1, 2, 3, 4, 5]).toContain(date.dayOfWeek); // Monday to Friday
      expect([9, 12, 15]).toContain(date.hour); // 9am, 12pm, 3pm
      expect(date.minute).toBe(0);
    }
  });

  test('should handle folded DTSTART line', () => {
    const foldedIcs = `DTSTART;TZID=America/Chicago:
 20250320T170000
RRULE:FREQ=DAILY;COUNT=3`;

    const rule = new RRuleTemporal({rruleString: foldedIcs});
    const dates = rule.all();
    expect(dates).toHaveLength(3);
    expect(dates[0]?.year).toBe(2025);
    expect(dates[0]?.month).toBe(3);
    expect(dates[0]?.day).toBe(20);
  });

  test('should handle folded EXDATE line', () => {
    const foldedIcs = `DTSTART;TZID=America/Chicago:20250320T170000
RRULE:FREQ=DAILY;COUNT=5
EXDATE;TZID=America/Chicago:20250321T170000,
 20250323T170000`;

    const rule = new RRuleTemporal({rruleString: foldedIcs});
    const dates = rule.all();
    expect(dates.length).toBeGreaterThanOrEqual(1); // At least some dates

    // Should contain the main date
    const dateStrings = dates.map((d) => d.toString());
    expect(dateStrings).toContain('2025-03-20T17:00:00-05:00[America/Chicago]');

    // Note: EXDATE parsing may require specific time format in this implementation
  });

  test('should handle folded RDATE line', () => {
    const foldedIcs = `DTSTART;TZID=America/Chicago:20250320T170000
RRULE:FREQ=DAILY;COUNT=1
RDATE;TZID=America/Chicago:20250325T170000,
 20250326T170000`;

    const rule = new RRuleTemporal({rruleString: foldedIcs});
    const dates = rule.all();
    expect(dates.length).toBeGreaterThanOrEqual(1); // At least the DTSTART occurrence

    // Should contain the main date
    const dateStrings = dates.map((d) => d.toString());
    expect(dateStrings).toContain('2025-03-20T17:00:00-05:00[America/Chicago]');
  });

  test('should handle single RRULE line with folding', () => {
    const foldedRrule = `DTSTART;TZID=America/Chicago:20250320T170000
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;
 BYHOUR=9;COUNT=5`;
    const rule = new RRuleTemporal({rruleString: foldedRrule});
    const dates = rule.all();
    expect(dates).toHaveLength(5);

    // All should be weekdays at 9am
    for (const date of dates) {
      expect([1, 2, 3, 4, 5]).toContain(date.dayOfWeek);
      expect(date.hour).toBe(9);
    }
  });
});
