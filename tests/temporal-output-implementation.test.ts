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

  test('constructs primitive-backed outputs once and caches the converted all() result', () => {
    class TrackingZonedDateTime {
      static constructions = 0;
      static fromCalls = 0;
      readonly value: InstanceType<typeof JsTemporal.ZonedDateTime>;

      constructor(epochNanoseconds: bigint, timeZone: string, calendar = 'iso8601') {
        TrackingZonedDateTime.constructions += 1;
        this.value = new JsTemporal.ZonedDateTime(epochNanoseconds, timeZone, calendar);
      }

      static from(value: string): TrackingZonedDateTime {
        TrackingZonedDateTime.fromCalls += 1;
        const date = JsTemporal.ZonedDateTime.from(value);
        return new TrackingZonedDateTime(date.epochNanoseconds, date.timeZoneId, date.calendarId);
      }

      get timeZoneId(): string {
        return this.value.timeZoneId;
      }

      toString(): string {
        return this.value.toString();
      }
    }

    const temporal = {ZonedDateTime: TrackingZonedDateTime};
    const rule = new RRuleTemporal({temporal, freq: 'DAILY', count: 3, dtstart});
    const first = rule.all();
    const second = rule.all();

    expect(first).not.toBe(second);
    expect(first.every((date) => date instanceof TrackingZonedDateTime)).toBe(true);
    expect(TrackingZonedDateTime.constructions).toBe(3);
    expect(TrackingZonedDateTime.fromCalls).toBe(0);

    TrackingZonedDateTime.constructions = 0;
    const iterated = new RRuleTemporal({temporal, freq: 'DAILY', count: 3, dtstart, cache: false}).all(() => true);
    expect(iterated).toHaveLength(3);
    expect(TrackingZonedDateTime.constructions).toBe(3);
  });

  test('retains the from(string) fallback for non-constructable adapters', () => {
    let fromCalls = 0;
    const temporal = {
      ZonedDateTime: {
        from(value: string) {
          fromCalls += 1;
          return JsTemporal.ZonedDateTime.from(value);
        },
      },
    };
    const rule = new RRuleTemporal({temporal, freq: 'DAILY', count: 3, dtstart, cache: false});

    expect(rule.all().every((date) => date instanceof JsTemporal.ZonedDateTime)).toBe(true);
    expect(fromCalls).toBe(3);
  });
});
