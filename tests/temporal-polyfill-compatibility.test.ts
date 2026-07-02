import {describe, expect, test} from 'vitest';
import {Temporal as PolyfillTemporal} from 'temporal-polyfill';
import {RRuleTemporal} from '../src';

describe('temporal-polyfill compatibility', () => {
  test('accepts temporal-polyfill ZonedDateTime values in manual options', () => {
    const dtstart = PolyfillTemporal.ZonedDateTime.from('2026-01-01T09:00:00[UTC]');
    const until = dtstart.add({days: 2});
    const exDate = dtstart.add({days: 1});

    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart,
      until,
      exDate: [exDate],
    });

    expect(rule.options().until?.toString()).toBe(until.toString());
    expect(rule.options().exDate?.map((date) => date.toString())).toEqual([exDate.toString()]);
    expect(rule.all().map((date) => date.toString())).toEqual([
      '2026-01-01T09:00:00+00:00[UTC]',
      '2026-01-03T09:00:00+00:00[UTC]',
    ]);
  });

  test('accepts temporal-polyfill ZonedDateTime values in ICS overrides and date filters', () => {
    const dtstart = PolyfillTemporal.ZonedDateTime.from('2026-02-01T10:00:00[America/New_York]');
    const rDate = dtstart.add({days: 4});

    const rule = new RRuleTemporal({
      rruleString: 'FREQ=DAILY;COUNT=2',
      dtstart,
      rDate: [rDate],
    });

    expect(rule.options().dtstart.toString()).toBe(dtstart.toString());
    expect(rule.options().rDate?.map((date) => date.toString())).toEqual([rDate.toString()]);
    expect(rule.between(dtstart, dtstart.add({days: 5}), true).map((date) => date.toString())).toEqual([
      '2026-02-01T10:00:00-05:00[America/New_York]',
      '2026-02-02T10:00:00-05:00[America/New_York]',
    ]);
    expect(rule.next(dtstart, true)?.toString()).toBe('2026-02-01T10:00:00-05:00[America/New_York]');
    expect(rule.previous(dtstart.add({days: 2}), true)?.toString()).toBe('2026-02-02T10:00:00-05:00[America/New_York]');
    expect(rule.occursOn(dtstart.toPlainDate())).toBe(true);
  });
});
