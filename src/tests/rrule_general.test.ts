import {RRuleTemporal} from '../index';
import {assertDates, zdt} from './helpers';

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
});
