import {RRuleTemporal} from '../index';
import {assertDates, zdt} from './helpers';

describe('Minutely frequency tests', () => {
  it('testMinutely', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T09:01:00.000Z', '1997-09-02T09:02:00.000Z']);
  });

  it('testMinutelyInterval', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      interval: 2,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T09:02:00.000Z', '1997-09-02T09:04:00.000Z']);
  });

  it('testMinutelyIntervalLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      interval: 1501,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-03T10:01:00.000Z', '1997-09-04T11:02:00.000Z']);
  });

  it('testMinutelyByMonth', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byMonth: [1, 3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T00:01:00.000Z', '1998-01-01T00:02:00.000Z']);
  });

  it('testMinutelyByMonthDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byMonthDay: [1, 3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-03T00:00:00.000Z', '1997-09-03T00:01:00.000Z', '1997-09-03T00:02:00.000Z']);
  });

  it('testMinutelyByMonthAndMonthDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byMonth: [1, 3],
      byMonthDay: [5, 7],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-05T00:00:00.000Z', '1998-01-05T00:01:00.000Z', '1998-01-05T00:02:00.000Z']);
  });

  it('testMinutelyByWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T09:01:00.000Z', '1997-09-02T09:02:00.000Z']);
  });

  it('testMinutelyByNWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byDay: ['1TU', '-1TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-02T09:01:00.000Z', '1997-09-02T09:02:00.000Z']);
  });

  it('testMinutelyByMonthAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T00:01:00.000Z', '1998-01-01T00:02:00.000Z']);
  });

  it('testMinutelyByMonthAndNWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['1TU', '-1TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-06T00:00:00.000Z', '1998-01-06T00:01:00.000Z', '1998-01-06T00:02:00.000Z']);
  });

  it('testMinutelyByMonthDayAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byMonthDay: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T00:01:00.000Z', '1998-01-01T00:02:00.000Z']);
  });

  it('testMinutelyByMonthAndMonthDayAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byMonth: [1, 3],
      byMonthDay: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T00:00:00.000Z', '1998-01-01T00:01:00.000Z', '1998-01-01T00:02:00.000Z']);
  });

  it('testMinutelyByYearDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 4,
      byYearDay: [1, 100, 200, 365],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, [
      '1997-12-31T00:00:00.000Z',
      '1997-12-31T00:01:00.000Z',
      '1997-12-31T00:02:00.000Z',
      '1997-12-31T00:03:00.000Z',
    ]);
  });

  it('testMinutelyByYearDayNeg', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 4,
      byYearDay: [-365, -266, -166, -1],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, [
      '1997-12-31T00:00:00.000Z',
      '1997-12-31T00:01:00.000Z',
      '1997-12-31T00:02:00.000Z',
      '1997-12-31T00:03:00.000Z',
    ]);
  });

  it('testMinutelyByMonthAndYearDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 4,
      byMonth: [4, 7],
      byYearDay: [1, 100, 200, 365],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, [
      '1998-04-10T00:00:00.000Z',
      '1998-04-10T00:01:00.000Z',
      '1998-04-10T00:02:00.000Z',
      '1998-04-10T00:03:00.000Z',
    ]);
  });

  it('testMinutelyByMonthAndYearDayNeg', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 4,
      byMonth: [4, 7],
      byYearDay: [-365, -266, -166, -1],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, [
      '1998-04-10T00:00:00.000Z',
      '1998-04-10T00:01:00.000Z',
      '1998-04-10T00:02:00.000Z',
      '1998-04-10T00:03:00.000Z',
    ]);
  });

  it('testMinutelyByWeekNo', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byWeekNo: [20],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-05-11T00:00:00.000Z', '1998-05-11T00:01:00.000Z', '1998-05-11T00:02:00.000Z']);
  });

  it('testMinutelyByWeekNoAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byWeekNo: [1],
      byDay: ['MO'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-29T00:00:00.000Z', '1997-12-29T00:01:00.000Z', '1997-12-29T00:02:00.000Z']);
  });

  it('testMinutelyByWeekNoAndWeekDayLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byWeekNo: [52],
      byDay: ['SU'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-28T00:00:00.000Z', '1997-12-28T00:01:00.000Z', '1997-12-28T00:02:00.000Z']);
  });

  it('testMinutelyByWeekNoAndWeekDayLast', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byWeekNo: [-1],
      byDay: ['SU'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-28T00:00:00.000Z', '1997-12-28T00:01:00.000Z', '1997-12-28T00:02:00.000Z']);
  });

  it('testMinutelyByWeekNoAndWeekDay53', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byWeekNo: [53],
      byDay: ['MO'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-12-28T00:00:00.000Z', '1998-12-28T00:01:00.000Z', '1998-12-28T00:02:00.000Z']);
  });

  it('testMinutelyByHour', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byHour: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:00:00.000Z', '1997-09-02T18:01:00.000Z', '1997-09-02T18:02:00.000Z']);
  });

  it.skip('testMinutelyByMinute', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byMinute: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:06:00.000Z', '1997-09-02T09:18:00.000Z', '1997-09-02T10:06:00.000Z']);
  });

  it('testMinutelyBySecond', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:06.000Z', '1997-09-02T09:00:18.000Z', '1997-09-02T09:01:06.000Z']);
  });

  it.skip('testMinutelyByHourAndMinute', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byHour: [6, 18],
      byMinute: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:06:00.000Z', '1997-09-02T18:18:00.000Z', '1997-09-03T06:06:00.000Z']);
  });

  it.skip('testMinutelyByHourAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byHour: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:00:06.000Z', '1997-09-02T18:00:18.000Z', '1997-09-02T18:01:06.000Z']);
  });

  it('testMinutelyByMinuteAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byMinute: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:06:06.000Z', '1997-09-02T09:06:18.000Z', '1997-09-02T09:18:06.000Z']);
  });

  it('testMinutelyByHourAndMinuteAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      byHour: [6, 18],
      byMinute: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:06:06.000Z', '1997-09-02T18:06:18.000Z', '1997-09-02T18:18:06.000Z']);
  });

  it.skip('testMinutelyBySetPos', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      bySecond: [15, 30, 45],
      bySetPos: [3, -3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:15.000Z', '1997-09-02T09:00:45.000Z', '1997-09-02T09:01:15.000Z']);
  });
});
