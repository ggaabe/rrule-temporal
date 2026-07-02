import {Temporal as ForeignTemporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from '../src/index';

// The library normalizes user-supplied Temporal objects at the API boundary,
// so instances from a DIFFERENT Temporal implementation than the library's
// internal binding (native or temporal-polyfill) must work as inputs.
// This file deliberately imports @js-temporal/polyfill to provide foreign
// instances; assertions only use implementation-agnostic values
// (epochMilliseconds / ISO strings).
describe('cross-implementation Temporal inputs', () => {
  const foreignDtstart = ForeignTemporal.ZonedDateTime.from('2024-01-15T09:00:00-06:00[America/Chicago]');

  it('accepts a foreign ZonedDateTime as manual dtstart', () => {
    const rule = new RRuleTemporal({freq: 'DAILY', count: 3, dtstart: foreignDtstart});
    const dates = rule.all();
    expect(dates).toHaveLength(3);
    expect(dates[0]!.epochMilliseconds).toBe(foreignDtstart.epochMilliseconds);
    expect(dates[0]!.timeZoneId).toBe('America/Chicago');
    expect(dates[2]!.toString()).toBe('2024-01-17T09:00:00-06:00[America/Chicago]');
  });

  it('accepts foreign instances for until/rDate/exDate', () => {
    const until = ForeignTemporal.ZonedDateTime.from('2024-01-20T09:00:00-06:00[America/Chicago]');
    const rDate = ForeignTemporal.ZonedDateTime.from('2024-01-21T12:00:00-06:00[America/Chicago]');
    const exDate = ForeignTemporal.ZonedDateTime.from('2024-01-16T09:00:00-06:00[America/Chicago]');
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart: foreignDtstart,
      until,
      rDate: [rDate],
      exDate: [exDate],
    });
    const dates = rule.all();
    const isoDates = dates.map((d) => d.toString().slice(0, 10));
    expect(isoDates).toContain('2024-01-21'); // rDate merged
    expect(isoDates).not.toContain('2024-01-16'); // exDate excluded
    expect(dates.every((d) => d.timeZoneId === 'America/Chicago')).toBe(true);
  });

  it('accepts foreign instances in between()/next()/previous()/matches()', () => {
    const rule = new RRuleTemporal({freq: 'DAILY', count: 30, dtstart: foreignDtstart});
    const windowStart = ForeignTemporal.ZonedDateTime.from('2024-01-19T00:00:00-06:00[America/Chicago]');
    const windowEnd = ForeignTemporal.ZonedDateTime.from('2024-01-22T00:00:00-06:00[America/Chicago]');

    const between = rule.between(windowStart, windowEnd);
    expect(between.map((d) => d.toString().slice(0, 10))).toEqual(['2024-01-19', '2024-01-20', '2024-01-21']);

    const next = rule.next(windowStart);
    expect(next?.toString().slice(0, 10)).toBe('2024-01-19');

    const previous = rule.previous(windowStart);
    expect(previous?.toString().slice(0, 10)).toBe('2024-01-18');

    const occurrence = ForeignTemporal.ZonedDateTime.from('2024-01-19T09:00:00-06:00[America/Chicago]');
    expect(rule.matches(occurrence)).toBe(true);
  });
});
