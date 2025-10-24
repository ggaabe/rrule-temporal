import {describe, expect, it} from 'vitest';
import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from '../index';

describe('DTSTART separation (RFC 5545 compliance)', () => {
  const dtstart = Temporal.ZonedDateTime.from('2025-01-01T09:00:00[UTC]');

  it('should create rule from rruleString without DTSTART by providing dtstart parameter', () => {
    const rule = new RRuleTemporal({
      rruleString: 'FREQ=DAILY;COUNT=5',
      dtstart,
    });

    const occurrences = rule.all();
    expect(occurrences).toHaveLength(5);
    expect(occurrences[0]?.toString()).toBe('2025-01-01T09:00:00+00:00[UTC]');
    expect(occurrences[4]?.toString()).toBe('2025-01-05T09:00:00+00:00[UTC]');
  });

  it('should create rule from rruleString with RRULE: prefix', () => {
    const rule = new RRuleTemporal({
      rruleString: 'RRULE:FREQ=DAILY;COUNT=5',
      dtstart,
    });

    const occurrences = rule.all();
    expect(occurrences).toHaveLength(5);
    expect(occurrences[0]?.toString()).toBe('2025-01-01T09:00:00+00:00[UTC]');
  });

  it('should throw error when no dtstart is provided', () => {
    expect(() => {
      new RRuleTemporal({
        rruleString: 'FREQ=DAILY;COUNT=5',
      });
    }).toThrow('dtstart is required');
  });

  it('should use dtstart from rruleString when present', () => {
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART:20250101T100000Z\nRRULE:FREQ=DAILY;COUNT=3',
    });

    const occurrences = rule.all();
    expect(occurrences).toHaveLength(3);
    expect(occurrences[0]?.hour).toBe(10);
  });

  it('should prefer dtstart from rruleString over parameter', () => {
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART:20250101T100000Z\nRRULE:FREQ=DAILY;COUNT=3',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T09:00:00[UTC]'),
    });

    const occurrences = rule.all();
    expect(occurrences[0]?.hour).toBe(10); // From rruleString, not parameter
  });

  it('should work with complex BYDAY patterns', () => {
    const rule = new RRuleTemporal({
      rruleString: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR',
      dtstart: Temporal.ZonedDateTime.from('2025-10-23T16:48:00[UTC]'),
    });

    const occurrences = rule.all((_, i) => i < 5);
    expect(occurrences).toHaveLength(5);
    
    // October 23, 2025 is a Thursday, so first occurrence should be Friday Oct 24
    expect(occurrences[0]?.day).toBe(24);
    expect(occurrences[0]?.dayOfWeek).toBe(5); // Friday
    expect(occurrences[1]?.dayOfWeek).toBe(1); // Monday
    expect(occurrences[2]?.dayOfWeek).toBe(3); // Wednesday
  });

  it('should support database-style storage pattern', () => {
    // Simulating data from a database where RRULE is stored separately
    const dbRecord = {
      start_date: '2025-10-23T16:48:00',
      end_date: '2025-12-31T16:48:00',
      rrule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR',
    };

    const startDate = Temporal.ZonedDateTime.from(`${dbRecord.start_date}[UTC]`);
    const endDate = Temporal.ZonedDateTime.from(`${dbRecord.end_date}[UTC]`);

    const rule = new RRuleTemporal({
      rruleString: dbRecord.rrule,
      dtstart: startDate,
    });

    const occurrences = rule.between(startDate, endDate, true);
    expect(occurrences.length).toBeGreaterThan(0);
    
    // All occurrences should be MO, WE, or FR
    for (const occ of occurrences) {
      expect([1, 3, 5]).toContain(occ.dayOfWeek);
    }
  });

  it('should support iCalendar parser use case', () => {
    // Simulating parsing from an iCalendar file where DTSTART and RRULE are separate
    const vevent = {
      dtstart: 'DTSTART;TZID=America/New_York:20250101T090000',
      rrule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=1;COUNT=12',
    };

    // Parse DTSTART separately
    const dtstartMatch = vevent.dtstart.match(/DTSTART;TZID=([^:]+):(.+)/);
    if (!dtstartMatch) throw new Error('Invalid DTSTART');
    
    const tzid = dtstartMatch[1]!;
    const dateStr = dtstartMatch[2]!;
    const dtstart = Temporal.ZonedDateTime.from(
      `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${dateStr.slice(9, 11)}:${dateStr.slice(11, 13)}:${dateStr.slice(13, 15)}[${tzid}]`
    );

    const rule = new RRuleTemporal({
      rruleString: vevent.rrule,
      dtstart,
    });

    const occurrences = rule.all();
    expect(occurrences).toHaveLength(12);
    
    // All should be on the 1st of the month
    for (const occ of occurrences) {
      expect(occ.day).toBe(1);
    }
  });

  it('should preserve timezone when provided separately', () => {
    const rule = new RRuleTemporal({
      rruleString: 'FREQ=DAILY;COUNT=3',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T09:00:00[America/New_York]'),
    });

    const occurrences = rule.all();
    expect(occurrences).toHaveLength(3);
    
    for (const occ of occurrences) {
      expect(occ.timeZoneId).toBe('America/New_York');
    }

    expect(rule.toString()).toContain('DTSTART;TZID=America/New_York:20250101T090000');
  });

  it('should support tzid parameter with rruleString', () => {
    const rule = new RRuleTemporal({
      rruleString: 'FREQ=DAILY;COUNT=3',
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T09:00:00[UTC]'),
      tzid: 'Europe/Paris',
    });

    const occurrences = rule.all();
    expect(occurrences).toHaveLength(3);
    // The dtstart timezone should be preserved
    expect(occurrences[0]?.timeZoneId).toBe('UTC');
  });
});
