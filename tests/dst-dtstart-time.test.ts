import {RRuleTemporal} from '../src/index';
import {Temporal} from '../src/temporal-impl';

const berlin = (date: string) => Temporal.ZonedDateTime.from(`${date}[Europe/Berlin]`);
const strings = (dates: {toString(): string}[]) => dates.map((date) => date.toString());

describe('DTSTART time after a daylight-saving gap (issue #136)', () => {
  it('restores the implicit DAILY time after the reported Berlin transition', () => {
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART;TZID=Europe/Berlin:20260320T023000\nRRULE:FREQ=DAILY;COUNT=13',
    });
    const dates = rule.all();
    expect(dates).toHaveLength(13);
    expect(strings(dates.slice(8))).toEqual([
      '2026-03-28T02:30:00+01:00[Europe/Berlin]',
      '2026-03-29T03:30:00+02:00[Europe/Berlin]',
      '2026-03-30T02:30:00+02:00[Europe/Berlin]',
      '2026-03-31T02:30:00+02:00[Europe/Berlin]',
      '2026-04-01T02:30:00+02:00[Europe/Berlin]',
    ]);
    expect(strings(rule.all(() => true))).toEqual(strings(dates));
  });

  it.each([
    {freq: 'DAILY', interval: 1, start: '2026-03-28T02:30', unit: 'days'},
    {freq: 'DAILY', interval: 3, start: '2026-03-26T02:30', unit: 'days'},
    {freq: 'YEARLY', interval: 1, start: '2025-03-29T02:30', unit: 'years'},
    {freq: 'YEARLY', interval: 2, start: '2024-03-29T02:30', unit: 'years'},
    {freq: 'MONTHLY', interval: 12, start: '2025-03-29T02:30', unit: 'months'},
    {freq: 'WEEKLY', interval: 1, start: '2026-03-22T02:30', unit: 'weeks'},
  ] as const)('$freq INTERVAL=$interval retains the original wall time', ({freq, interval, start, unit}) => {
    const dtstart = berlin(start);
    // Resolve each calendar offset independently from the original DTSTART.
    const expected = Array.from({length: 4}, (_, index) => dtstart.add({[unit]: index * interval}));
    const rule = new RRuleTemporal({freq, interval, dtstart, count: 4});
    expect(strings(rule.all())).toEqual(strings(expected));
    expect(strings(rule.all(() => true))).toEqual(strings(expected));
  });

  it('does not let a filtered-out gap day shift subsequent weekdays', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart: berlin('2026-03-27T02:30'),
      byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
      count: 3,
    });
    expect(strings(rule.all())).toEqual([
      '2026-03-27T02:30:00+01:00[Europe/Berlin]',
      '2026-03-30T02:30:00+02:00[Europe/Berlin]',
      '2026-03-31T02:30:00+02:00[Europe/Berlin]',
    ]);
  });

  it.each([{}, {byMinute: [30]}, {bySecond: [45]}, {byHour: [2]}])(
    'preserves unspecified time fields and subsecond precision with %j',
    (overrides) => {
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        dtstart: berlin('2026-03-28T02:30:45.123456789'),
        count: 3,
        ...overrides,
      });
      expect(strings(rule.all())).toEqual([
        '2026-03-28T02:30:45.123456789+01:00[Europe/Berlin]',
        '2026-03-29T03:30:45.123456789+02:00[Europe/Berlin]',
        '2026-03-30T02:30:45.123456789+02:00[Europe/Berlin]',
      ]);
    },
  );

  it.each([{}, {byHour: [2]}])('restores minutes after a half-hour gap with %j', (overrides) => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart: Temporal.ZonedDateTime.from('2026-10-03T02:15:00[Australia/Lord_Howe]'),
      count: 3,
      ...overrides,
    });
    expect(strings(rule.all())).toEqual([
      '2026-10-03T02:15:00+10:30[Australia/Lord_Howe]',
      '2026-10-04T02:45:00+11:00[Australia/Lord_Howe]',
      '2026-10-05T02:15:00+11:00[Australia/Lord_Howe]',
    ]);
  });

  it.each([true, false])('queries retain the DAILY time with COUNT present=%s', (bounded) => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart: berlin('2026-03-20T02:30'),
      ...(bounded ? {count: 13} : {}),
    });
    const gap = berlin('2026-03-29T03:30');
    const next = berlin('2026-03-30T02:30');
    expect(rule.next(gap)?.toString()).toBe(next.toString());
    expect(rule.previous(berlin('2026-03-30T04:00'))?.toString()).toBe(next.toString());
    expect(strings(rule.between(gap, berlin('2026-03-31T04:00')))).toEqual([
      next.toString(),
      '2026-03-31T02:30:00+02:00[Europe/Berlin]',
    ]);
    expect(rule.matches(next)).toBe(true);
    expect(rule.matches(berlin('2026-03-30T03:30'))).toBe(false);
    expect(strings(rule.between(next, next, true))).toEqual([next.toString()]);
  });

  it('retains the YEARLY time when a query starts on the gap occurrence', () => {
    const rule = new RRuleTemporal({freq: 'YEARLY', dtstart: berlin('2025-03-29T02:30')});
    const gap = berlin('2026-03-29T03:30');
    const next = berlin('2027-03-29T02:30');
    expect(rule.next(gap)?.toString()).toBe(next.toString());
    expect(strings(rule.between(gap, berlin('2027-03-29T04:00')))).toEqual([next.toString()]);
  });

  it.each([
    {freq: 'DAILY', interval: 364},
    {freq: 'WEEKLY', interval: 52},
  ] as const)('queries preserve the time after consecutive gap occurrences ($freq)', ({freq, interval}) => {
    // These Sunday occurrences land in Berlin's spring gaps from 2019 to
    // 2023. Backing up only one or two intervals still leaves a shifted time.
    const dtstart = berlin('2018-04-01T02:30');
    const gap = berlin('2023-03-26T03:30');
    const next = berlin('2024-03-24T02:30');
    const rule = new RRuleTemporal({freq, interval, dtstart});
    expect(rule.next(gap)?.toString()).toBe(next.toString());
    expect(strings(rule.between(gap, berlin('2024-03-24T04:00')))).toEqual([next.toString()]);
    expect(rule.previous(berlin('2024-03-24T02:00'))?.toString()).toBe(gap.toString());
  });

  it('applies inclusive UNTIL and recurrence exceptions to the restored occurrences', () => {
    const dtstart = berlin('2026-03-28T02:30');
    const until = berlin('2026-03-31T02:30');
    const gap = berlin('2026-03-29T03:30');
    const extra = berlin('2026-04-02T12:00');
    const rule = new RRuleTemporal({freq: 'DAILY', dtstart, until, exDate: [gap], rDate: [extra]});
    const expected = [
      dtstart.toString(),
      '2026-03-30T02:30:00+02:00[Europe/Berlin]',
      until.toString(),
      extra.toString(),
    ];
    expect(strings(rule.all())).toEqual(expected);
    expect(strings(rule.all(() => true))).toEqual(expected);
    const countRule = new RRuleTemporal({freq: 'DAILY', dtstart, count: 4, exDate: [gap], rDate: [extra]});
    expect(strings(countRule.all())).toEqual(expected);
    expect(strings(countRule.all(() => true))).toEqual(expected);
  });

  it.each([
    {freq: 'HOURLY', interval: 1, start: '2026-03-29T01:30', unit: 'hours'},
    {freq: 'MINUTELY', interval: 30, start: '2026-03-29T01:45', unit: 'minutes'},
    {freq: 'SECONDLY', interval: 1, start: '2026-03-29T01:59:59', unit: 'seconds'},
  ] as const)('keeps elapsed-time advancement for $freq', ({freq, interval, start, unit}) => {
    const dtstart = berlin(start);
    const expected = Array.from({length: 4}, (_, index) => dtstart.add({[unit]: index * interval}));
    const rule = new RRuleTemporal({freq, interval, dtstart, count: 4});
    expect(strings(rule.all())).toEqual(strings(expected));
    expect(strings(rule.all(() => true))).toEqual(strings(expected));
  });
});
