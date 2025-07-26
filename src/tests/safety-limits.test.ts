import {Temporal} from 'temporal-polyfill';
import {RRuleTemporal} from '../index';

describe('RRuleTemporal - Safety Limits', () => {
  test('all() should throw error when exceeding default maxIterations limit', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    // Create a rule that would generate infinite iterations without safety limits
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      // No count or until - would run forever without safety limits
    });

    expect(() => {
      rule.all(() => true); // Iterator that never stops
    }).toThrow('Maximum iterations (10000) exceeded in all()');
  });

  test('all() should respect custom maxIterations limit', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      maxIterations: 5, // Custom low limit
    });

    expect(() => {
      rule.all(() => true); // Iterator that never stops
    }).toThrow('Maximum iterations (5) exceeded in all()');
  });

  test('between() should throw error when exceeding maxIterations limit', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      dtstart,
      maxIterations: 100, // Low limit for testing
    });

    const after = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');
    const before = Temporal.ZonedDateTime.from('2030-01-01T10:00:00[UTC]'); // Far future

    expect(() => {
      rule.between(after.toPlainDate().toZonedDateTime('UTC'), before.toPlainDate().toZonedDateTime('UTC'));
    }).toThrow('Maximum iterations (100) exceeded in all()');
  });

  test('all() should work normally within safety limits', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      count: 5, // Small count within limits
      maxIterations: 1000,
    });

    const dates = rule.all();
    expect(dates).toHaveLength(5);
    expect(dates[0]?.toString()).toBe('2025-01-01T10:00:00+00:00[UTC]');
    expect(dates[4]?.toString()).toBe('2025-01-05T10:00:00+00:00[UTC]');
  });

  test('between() should work normally within safety limits', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      maxIterations: 1000,
    });

    const after = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');
    const before = Temporal.ZonedDateTime.from('2025-01-05T10:00:00[UTC]');

    const dates = rule.between(after.toPlainDate().toZonedDateTime('UTC'), before.toPlainDate().toZonedDateTime('UTC'));
    expect(dates).toHaveLength(4); // Includes start date but not end date by default
    expect(dates[0]?.toString()).toBe('2025-01-01T10:00:00+00:00[UTC]');
    expect(dates[3]?.toString()).toBe('2025-01-04T10:00:00+00:00[UTC]');
  });

  test('maxIterations should default to 10000 when not specified', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      count: 5,
    });

    // Access private property for testing
    expect((rule as any).maxIterations).toBe(10000);
  });

  test('next() and previous() should be protected by all() safety limits', () => {
    const dtstart = Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]');

    // Create a rule with complex constraints that would require many iterations
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      byDay: ['MO'], // Only Mondays - requires many iterations to find one
      maxIterations: 3, // Very low limit
    });

    const after = Temporal.ZonedDateTime.from('2030-01-01T10:00:00[UTC]'); // Far in future

    expect(() => {
      rule.next(after.toPlainDate().toZonedDateTime('UTC'));
    }).toThrow('Maximum iterations (3) exceeded in all()');
  });
});
