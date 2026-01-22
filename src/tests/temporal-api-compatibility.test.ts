import {describe, test, expect} from 'vitest';
import {RRuleTemporal} from '../index';
import {Temporal} from '@js-temporal/polyfill';

/**
 * Tests for compatibility with native Temporal API implementations
 * (e.g., V8 14.4+ in Electron 40+, Node.js 24+)
 *
 * The native Temporal API has stricter requirements than the polyfill:
 * - ZonedDateTime.until() with largestUnit as a day-unit (days, weeks, months, years)
 *   requires both ZonedDateTime objects to have the same time zone
 * - Mixing native and polyfill Temporal objects can cause errors
 */
describe('Temporal API compatibility', () => {
  test('between() works with YEARLY recurrence across timezones', () => {
    const tz = 'Europe/Berlin';
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2030-07-01T10:00:00[Europe/Berlin]'),
      tzid: tz,
    });

    // Test a date range similar to what would be used in calendar applications
    const after = new Date('2029-12-27T12:30:00.000Z');
    const before = new Date('2057-05-19T12:30:00.000Z');

    const dates = rule.between(after, before, true);

    // Should return occurrences for 27 years (2030-2056 inclusive)
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.length).toBe(27);

    // First occurrence should be in 2030
    expect(dates[0]!.year).toBe(2030);
    expect(dates[0]!.month).toBe(7);
    expect(dates[0]!.day).toBe(1);
  });

  test('between() works with YEARLY full-day recurrence', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2030-10-01T00:00:00[UTC]'),
      tzid: tz,
    });

    const after = new Date('2029-12-27T12:30:00.000Z');
    const before = new Date('2057-05-19T12:30:00.000Z');

    const dates = rule.between(after, before, true);

    expect(dates.length).toBe(27);
    expect(dates[0]!.year).toBe(2030);
    expect(dates[0]!.month).toBe(10);
    expect(dates[0]!.day).toBe(1);
  });

  test('between() optimization preserves INTERVAL with YEARLY frequency', () => {
    const tz = 'America/New_York';
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      interval: 2, // Every 2 years
      dtstart: Temporal.ZonedDateTime.from('2020-01-01T12:00:00[America/New_York]'),
      tzid: tz,
    });

    // Query a range that starts well after dtstart
    const after = new Date('2030-01-01T00:00:00.000Z');
    const before = new Date('2040-12-31T23:59:59.000Z');

    const dates = rule.between(after, before, true);

    // Should return only even years: 2030, 2032, 2034, 2036, 2038, 2040
    expect(dates.length).toBe(6);

    // Verify the interval is preserved
    for (let i = 0; i < dates.length; i++) {
      expect(dates[i]!.year).toBe(2030 + i * 2);
    }
  });

  test('between() optimization works with MONTHLY frequency and large INTERVAL', () => {
    const tz = 'Asia/Tokyo';
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      interval: 3, // Every 3 months
      dtstart: Temporal.ZonedDateTime.from('2025-01-15T10:00:00[Asia/Tokyo]'),
      tzid: tz,
    });

    const after = new Date('2030-01-01T00:00:00.000Z');
    const before = new Date('2030-12-31T23:59:59.000Z');

    const dates = rule.between(after, before, true);

    // Should return 4 dates: Jan 15, Apr 15, Jul 15, Oct 15
    expect(dates.length).toBe(4);
    expect(dates[0]!.month).toBe(1);
    expect(dates[1]!.month).toBe(4);
    expect(dates[2]!.month).toBe(7);
    expect(dates[3]!.month).toBe(10);
  });

  test('between() handles timezone conversion correctly', () => {
    // Create a rule in one timezone
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart: Temporal.ZonedDateTime.from('2030-01-01T12:00:00[Europe/Berlin]'),
      tzid: 'Europe/Berlin',
      count: 10,
    });

    // Query with Date objects (which convert to UTC)
    const after = new Date('2030-01-01T00:00:00.000Z');
    const before = new Date('2030-01-15T00:00:00.000Z');

    const dates = rule.between(after, before, true);

    expect(dates.length).toBe(10);

    // All dates should be in Europe/Berlin timezone
    dates.forEach(date => {
      expect(date!.timeZoneId).toBe('Europe/Berlin');
    });
  });

  test('between() works when query range starts before dtstart', () => {
    const tz = 'UTC';
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      dtstart: Temporal.ZonedDateTime.from('2030-06-15T12:00:00[UTC]'),
      tzid: tz,
      count: 5,
    });

    // Query range starts before dtstart
    const after = new Date('2025-01-01T00:00:00.000Z');
    const before = new Date('2035-12-31T23:59:59.000Z');

    const dates = rule.between(after, before, true);

    expect(dates.length).toBe(5);

    // First occurrence should be dtstart
    expect(dates[0]!.year).toBe(2030);
    expect(dates[0]!.month).toBe(6);
    expect(dates[0]!.day).toBe(15);
  });

  test('between() optimization handles edge case with WEEKLY frequency', () => {
    const tz = 'Australia/Sydney';
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      interval: 4,
      dtstart: Temporal.ZonedDateTime.from('2025-01-06T09:00:00[Australia/Sydney]'), // Monday
      tzid: tz,
    });

    // Query a future range
    const after = new Date('2030-01-01T00:00:00.000Z');
    const before = new Date('2030-02-28T23:59:59.000Z');

    const dates = rule.between(after, before, true);

    expect(dates.length).toBeGreaterThan(0);

    // All occurrences should be on Mondays (weekday 1)
    dates.forEach(date => {
      expect(date!.dayOfWeek).toBe(1);
    });
  });
});
