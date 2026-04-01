import {Temporal} from '@js-temporal/polyfill';
import {RRuleSetTemporal, RRuleTemporal} from '../src';
import {zdt} from './helpers';

describe('RRuleSetTemporal skeleton', () => {
  it('stores constructor-provided rules and dates', () => {
    const includeRule = new RRuleTemporal({
      freq: 'DAILY',
      count: 2,
      dtstart: zdt(2026, 1, 1, 9, 'UTC'),
    });
    const excludeRule = new RRuleTemporal({
      freq: 'DAILY',
      count: 1,
      dtstart: zdt(2026, 1, 2, 9, 'UTC'),
    });
    const includeDate = Temporal.ZonedDateTime.from('2026-01-05T09:00:00[UTC]');
    const excludeDate = Temporal.ZonedDateTime.from('2026-01-06T09:00:00[UTC]');

    const set = new RRuleSetTemporal({
      includeRules: [includeRule],
      includeDates: [includeDate],
      excludeRules: [excludeRule],
      excludeDates: [excludeDate],
      maxIterations: 12,
    });

    const options = set.options();

    expect(options.includeRules).toEqual([includeRule]);
    expect(options.excludeRules).toEqual([excludeRule]);
    expect(options.includeDates?.map((date) => date.toString())).toEqual([includeDate.toString()]);
    expect(options.excludeDates?.map((date) => date.toString())).toEqual([excludeDate.toString()]);
    expect(options.maxIterations).toBe(12);
  });

  it('deduplicates added rules and dates', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 2,
      dtstart: zdt(2026, 1, 1, 9, 'UTC'),
    });
    const date = Temporal.ZonedDateTime.from('2026-01-05T09:00:00[UTC]');

    const set = new RRuleSetTemporal();
    set.rrule(rule);
    set.rrule(rule);
    set.exrule(rule);
    set.exrule(rule);
    set.rdate(date);
    set.rdate(Temporal.ZonedDateTime.from(date.toString()));
    set.exdate(date);
    set.exdate(Temporal.ZonedDateTime.from(date.toString()));

    expect(set.rrules()).toHaveLength(1);
    expect(set.exrules()).toHaveLength(1);
    expect(set.rdates()).toHaveLength(1);
    expect(set.exdates()).toHaveLength(1);
  });

  it('returns defensive copies for stored dates', () => {
    const original = Temporal.ZonedDateTime.from('2026-01-05T09:00:00[UTC]');
    const set = new RRuleSetTemporal({includeDates: [original]});

    const dates = set.rdates();

    expect(dates[0]).not.toBe(original);
    expect(dates[0]?.toString()).toBe(original.toString());
  });

  it('returns included rule occurrences and explicit dates within a window', () => {
    const includeRule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      dtstart: zdt(2026, 1, 1, 9, 'UTC'),
    });
    const includeDate = Temporal.ZonedDateTime.from('2026-01-04T09:00:00[UTC]');
    const set = new RRuleSetTemporal({
      includeRules: [includeRule],
      includeDates: [includeDate],
    });

    const results = set.between(new Date('2025-12-31T00:00:00.000Z'), new Date('2026-01-05T00:00:00.000Z'), true);

    expect(results.map((date) => date.toString())).toEqual([
      '2026-01-01T09:00:00+00:00[UTC]',
      '2026-01-02T09:00:00+00:00[UTC]',
      '2026-01-03T09:00:00+00:00[UTC]',
      '2026-01-04T09:00:00+00:00[UTC]',
    ]);
  });

  it('removes occurrences excluded by explicit dates', () => {
    const includeRule = new RRuleTemporal({
      freq: 'DAILY',
      count: 4,
      dtstart: zdt(2026, 1, 1, 9, 'UTC'),
    });
    const excludeDate = Temporal.ZonedDateTime.from('2026-01-02T09:00:00[UTC]');
    const set = new RRuleSetTemporal({
      includeRules: [includeRule],
      excludeDates: [excludeDate],
    });

    const results = set.between(new Date('2025-12-31T00:00:00.000Z'), new Date('2026-01-05T00:00:00.000Z'), true);

    expect(results.map((date) => date.toString())).toEqual([
      '2026-01-01T09:00:00+00:00[UTC]',
      '2026-01-03T09:00:00+00:00[UTC]',
      '2026-01-04T09:00:00+00:00[UTC]',
    ]);
  });

  it('deduplicates explicit dates already produced by an included rule', () => {
    const duplicateDate = Temporal.ZonedDateTime.from('2026-01-02T09:00:00[UTC]');
    const includeRule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      dtstart: zdt(2026, 1, 1, 9, 'UTC'),
    });
    const set = new RRuleSetTemporal({
      includeRules: [includeRule],
      includeDates: [duplicateDate],
    });

    const results = set.between(new Date('2025-12-31T00:00:00.000Z'), new Date('2026-01-05T00:00:00.000Z'), true);

    expect(results.map((date) => date.toString())).toEqual([
      '2026-01-01T09:00:00+00:00[UTC]',
      '2026-01-02T09:00:00+00:00[UTC]',
      '2026-01-03T09:00:00+00:00[UTC]',
    ]);
  });

  it('lets exclusion rules override inclusion rules', () => {
    const includeRule = new RRuleTemporal({
      freq: 'DAILY',
      count: 4,
      dtstart: zdt(2026, 1, 1, 9, 'UTC'),
    });
    const excludeRule = new RRuleTemporal({
      freq: 'DAILY',
      count: 2,
      dtstart: zdt(2026, 1, 2, 9, 'UTC'),
    });
    const set = new RRuleSetTemporal({
      includeRules: [includeRule],
      excludeRules: [excludeRule],
    });

    const results = set.between(new Date('2025-12-31T00:00:00.000Z'), new Date('2026-01-05T00:00:00.000Z'), true);

    expect(results.map((date) => date.toString())).toEqual([
      '2026-01-01T09:00:00+00:00[UTC]',
      '2026-01-04T09:00:00+00:00[UTC]',
    ]);
  });

  it('returns the merged finite recurrence set from all()', () => {
    const includeRule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      dtstart: zdt(2026, 1, 1, 9, 'UTC'),
    });
    const set = new RRuleSetTemporal({
      includeRules: [includeRule],
      includeDates: [Temporal.ZonedDateTime.from('2026-01-04T09:00:00[UTC]')],
      excludeDates: [Temporal.ZonedDateTime.from('2026-01-02T09:00:00[UTC]')],
    });

    expect(set.all().map((date) => date.toString())).toEqual([
      '2026-01-01T09:00:00+00:00[UTC]',
      '2026-01-03T09:00:00+00:00[UTC]',
      '2026-01-04T09:00:00+00:00[UTC]',
    ]);
  });

  it('supports the same early-stop iterator contract in all()', () => {
    const includeRule = new RRuleTemporal({
      freq: 'DAILY',
      count: 4,
      dtstart: zdt(2026, 1, 1, 9, 'UTC'),
    });
    const set = new RRuleSetTemporal({includeRules: [includeRule]});

    expect(set.all((_, index) => index < 2).map((date) => date.toString())).toEqual([
      '2026-01-01T09:00:00+00:00[UTC]',
      '2026-01-02T09:00:00+00:00[UTC]',
    ]);
  });

  it('counts the merged finite recurrence set', () => {
    const includeRule = new RRuleTemporal({
      freq: 'DAILY',
      count: 4,
      dtstart: zdt(2026, 1, 1, 9, 'UTC'),
    });
    const set = new RRuleSetTemporal({
      includeRules: [includeRule],
      excludeDates: [Temporal.ZonedDateTime.from('2026-01-03T09:00:00[UTC]')],
    });

    expect(set.count()).toBe(3);
  });
});
