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
});
