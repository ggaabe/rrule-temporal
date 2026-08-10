import {Temporal as JsTemporal} from '@js-temporal/polyfill';
import {describe, expect, test} from 'vitest';
import {RRuleTemporal} from '../src';

describe('explicit Temporal output implementation', () => {
  const dtstart = JsTemporal.ZonedDateTime.from('2026-01-01T09:00:00+00:00[UTC]');
  const rDate = dtstart.add({days: 4});
  const exDate = dtstart.add({days: 1});

  const createRule = () =>
    new RRuleTemporal({
      temporal: JsTemporal,
      freq: 'DAILY',
      count: 3,
      dtstart,
      rDate: [rDate],
      exDate: [exDate],
    });

  test('returns values from the selected implementation across query methods', () => {
    const rule = createRule();
    const all = rule.all();
    const between = rule.between(dtstart.subtract({hours: 1}), rDate.add({hours: 1}));
    const next = rule.next(dtstart.subtract({nanoseconds: 1}));
    const previous = rule.previous(rDate.add({days: 1}));

    expect(all.map((date) => date.toString())).toEqual([
      '2026-01-01T09:00:00+00:00[UTC]',
      '2026-01-03T09:00:00+00:00[UTC]',
      '2026-01-05T09:00:00+00:00[UTC]',
    ]);
    expect(
      [...all, ...between, next, previous].filter(Boolean).every((date) => date instanceof JsTemporal.ZonedDateTime),
    ).toBe(true);
    expect(next?.toPlainDate()).toBeInstanceOf(JsTemporal.PlainDate);
  });

  test('uses selected values in iterators and resolved options', () => {
    const rule = createRule();
    const iterated: InstanceType<typeof JsTemporal.ZonedDateTime>[] = [];

    rule.all((date) => {
      iterated.push(date);
      return true;
    });

    const options = rule.options();
    expect(iterated.length).toBeGreaterThan(0);
    expect(iterated.every((date) => date instanceof JsTemporal.ZonedDateTime)).toBe(true);
    expect(options.temporal).toBe(JsTemporal);
    expect(options.dtstart).toBeInstanceOf(JsTemporal.ZonedDateTime);
    expect(options.rDate?.[0]).toBeInstanceOf(JsTemporal.ZonedDateTime);
    expect(options.exDate?.[0]).toBeInstanceOf(JsTemporal.ZonedDateTime);
  });

  test('preserves the selected implementation through with()', () => {
    const updated = createRule().with({count: 1});

    expect(updated.options().temporal).toBe(JsTemporal);
    expect(updated.all().every((date) => date instanceof JsTemporal.ZonedDateTime)).toBe(true);
  });

  test('supports the selected implementation with ICS options', () => {
    const rule = new RRuleTemporal({
      temporal: JsTemporal,
      rruleString: 'DTSTART;TZID=UTC:20260101T090000\nRRULE:FREQ=DAILY;COUNT=2',
    });

    expect(rule.all().every((date) => date instanceof JsTemporal.ZonedDateTime)).toBe(true);
    expect(rule.options().dtstart).toBeInstanceOf(JsTemporal.ZonedDateTime);
  });
});
