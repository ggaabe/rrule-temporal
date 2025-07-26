import {RRuleTemporal} from '../index';
import {assertDates, parse, zdt} from './helpers';

describe('General RRule tests', () => {
  it('testMonthlyNegByMonthDayJanFebForNonLeapYear', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 4,
      byMonthDay: [-1],
      dtstart: zdt(2013, 12, 1, 9, 'UTC'),
    });
    assertDates({rule}, [
      '2013-12-31T09:00:00.000Z',
      '2014-01-31T09:00:00.000Z',
      '2014-02-28T09:00:00.000Z',
      '2014-03-31T09:00:00.000Z',
    ]);
  });

  it('testMonthlyNegByMonthDayJanFebForLeapYear', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 4,
      byMonthDay: [-1],
      dtstart: zdt(2015, 12, 1, 9, 'UTC'),
    });
    assertDates({rule}, [
      '2015-12-31T09:00:00.000Z',
      '2016-01-31T09:00:00.000Z',
      '2016-02-29T09:00:00.000Z',
      '2016-03-31T09:00:00.000Z',
    ]);
  });

  it('testSecondlyBySetPos', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 4,
      bySecond: [0, 15, 30, 45],
      bySetPos: [1, -1],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, [
      '1997-09-02T09:00:00.000Z',
      '1997-09-02T09:00:45.000Z',
      '1997-09-02T09:01:00.000Z',
      '1997-09-02T09:01:45.000Z',
    ]);
  });

  it('testYearlyByNWeekDayLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byDay: ['13TU', '-13TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-10-02T09:00:00.000Z', '1998-03-31T09:00:00.000Z', '1998-10-08T09:00:00.000Z']);
  });

  it('does not mutate the passed-in options object', () => {
    const options = {
      freq: 'MONTHLY' as const,
      dtstart: zdt(2013, 1, 1, 0, 'UTC'),
      count: 3,
      byMonthDay: [28],
    };
    const rule = new RRuleTemporal(options);

    expect(options).toEqual({
      freq: 'MONTHLY',
      dtstart: zdt(2013, 1, 1, 0, 'UTC'),
      count: 3,
      byMonthDay: [28],
    });
    expect(rule.options()).toEqual(expect.objectContaining(options));
  });

  it('rrulestr parsing of WKST values other than MO or SU', () => {
    const rruleString = 'DTSTART:20240101000000\nRRULE:FREQ=WEEKLY;WKST=WE';
    const rule = new RRuleTemporal({rruleString, dtstart: zdt(2024, 1, 1, 0, 'UTC')});
    expect(rule.toString()).toContain('WKST=WE');
  });

  it('missing Feb 28 issue', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      dtstart: zdt(2013, 1, 1, 0, 'UTC'),
      count: 3,
      byMonthDay: [28],
    });
    assertDates({rule}, ['2013-01-28T00:00:00.000Z', '2013-02-28T00:00:00.000Z', '2013-03-28T00:00:00.000Z']);
  });

  it('testCountZero', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 0,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    expect(rule.all(() => true)).toEqual([]);
  });

  it('testBadBySetPos', () => {
    expect(
      () =>
        new RRuleTemporal({
          freq: 'MONTHLY',
          count: 1,
          bySetPos: [0],
          dtstart: zdt(1997, 9, 2, 9, 'UTC'),
        }),
    ).toThrow('bySetPos may not contain 0');
  });

  it('testBadBySetPosMany', () => {
    expect(
      () =>
        new RRuleTemporal({
          freq: 'MONTHLY',
          count: 1,
          bySetPos: [-1, 0, 1],
          dtstart: zdt(1997, 9, 2, 9, 'UTC'),
        }),
    ).toThrow('bySetPos may not contain 0');
  });

  it('testInvalidNthWeekday', () => {
    expect(() => new RRuleTemporal({freq: 'WEEKLY', byDay: ['0FR'], dtstart: zdt(1997, 9, 2, 9, 'UTC')})).toThrow(
      'Invalid BYDAY value',
    );
  });

  it('testStrInvalidByDay', () => {
    expect(() => new RRuleTemporal({freq: 'WEEKLY', byDay: ['-1OK'], dtstart: zdt(1997, 9, 2, 9, 'UTC')})).toThrow(
      'Invalid BYDAY value',
    );
  });

  it('testStrInvalidUntil', () => {
    expect(() => parse('DTSTART:19970902T090000\nRRULE:FREQ=YEARLY;UNTIL=TheCowsComeHome;BYDAY=1TU,-1TH')).toThrow(
      'Cannot parse: TheC-ow-sCTmeHome',
    );
  });

  it('testStrEmptyByDay', () => {
    const rule = parse('DTSTART:19970902T090000\nRRULE:FREQ=WEEKLY;BYDAY=;WKST=SU');
    expect(rule.toString()).toEqual('DTSTART;TZID=UTC:19970902T090000\nRRULE:FREQ=WEEKLY;WKST=SU');
  });

  it('testStrNoDTStart', () => {
    expect(() => parse('RRULE:FREQ=YEARLY;COUNT=3')).toThrow('dtstart required when parsing RRULE alone');
  });
});

describe('BYxxx evaluation order', () => {
  it('should return no dates when BYxxx parts conflict', () => {
    // The 100th day of 2025 is April 10th, which is in week 15.
    // The 10th week of 2025 is from March 3rd to March 9th.
    // Therefore, a rule that requires a date to be in week 10 AND be the
    // 100th day of the year should produce no results.
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      byYearDay: [100],
      byWeekNo: [10],
      count: 1,
      dtstart: zdt(2025, 1, 1, 0, 'UTC'),
    });
    const result = rule.all();
    expect(result).toEqual([]);
  });
});
