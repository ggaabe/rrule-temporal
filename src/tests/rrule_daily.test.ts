import {RRuleTemporal} from '../index';
import {assertDates, zdt} from './helpers';

describe('Daily frequency tests', () => {
  it('testDaily', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-03T09:00:00.000Z', '1997-09-04T09:00:00.000Z']);
  });

  it('testDailyInterval', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      interval: 2,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-04T09:00:00.000Z', '1997-09-06T09:00:00.000Z']);
  });

  it('testDailyIntervalLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      interval: 92,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-12-03T09:00:00.000Z', '1998-03-05T09:00:00.000Z']);
  });

  it('testDailyByMonth', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byMonth: [1, 3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-01-02T09:00:00.000Z', '1998-01-03T09:00:00.000Z']);
  });

  it('testDailyByMonthDay', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byMonthDay: [1, 3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-03T09:00:00.000Z', '1997-10-01T09:00:00.000Z', '1997-10-03T09:00:00.000Z']);
  });

  it('testDailyByMonthAndMonthDay', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byMonth: [1, 3],
      byMonthDay: [5, 7],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-05T09:00:00.000Z', '1998-01-07T09:00:00.000Z', '1998-03-05T09:00:00.000Z']);
  });

  it('testDailyByWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-04T09:00:00.000Z', '1997-09-09T09:00:00.000Z']);
  });

  it('testDailyByNWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byDay: ['1TU', '-1TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-04T09:00:00.000Z', '1997-09-09T09:00:00.000Z']);
  });

  it('testDailyByMonthAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-01-06T09:00:00.000Z', '1998-01-08T09:00:00.000Z']);
  });

  it('testDailyByMonthAndNWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['1TU', '-1TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-01-06T09:00:00.000Z', '1998-01-08T09:00:00.000Z']);
  });

  it('testDailyByMonthDayAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byMonthDay: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-02-03T09:00:00.000Z', '1998-03-03T09:00:00.000Z']);
  });

  it('testDailyByMonthAndMonthDayAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byMonth: [1, 3],
      byMonthDay: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-03-03T09:00:00.000Z', '2001-03-01T09:00:00.000Z']);
  });

  it('testDailyByYearDay', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 4,
      byYearDay: [1, 100, 200, 365],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, [
      '1997-12-31T09:00:00.000Z',
      '1998-01-01T09:00:00.000Z',
      '1998-04-10T09:00:00.000Z',
      '1998-07-19T09:00:00.000Z',
    ]);
  });

  it('testDailyByYearDayNeg', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 4,
      byYearDay: [-365, -266, -166, -1],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, [
      '1997-12-31T09:00:00.000Z',
      '1998-01-01T09:00:00.000Z',
      '1998-04-10T09:00:00.000Z',
      '1998-07-19T09:00:00.000Z',
    ]);
  });

  it('testDailyByMonthAndYearDay', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 4,
      byMonth: [1, 7],
      byYearDay: [1, 100, 200, 365],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, [
      '1998-01-01T09:00:00.000Z',
      '1998-07-19T09:00:00.000Z',
      '1999-01-01T09:00:00.000Z',
      '1999-07-19T09:00:00.000Z',
    ]);
  });

  it('testDailyByMonthAndYearDayNeg', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 4,
      byMonth: [1, 7],
      byYearDay: [-365, -266, -166, -1],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, [
      '1998-01-01T09:00:00.000Z',
      '1998-07-19T09:00:00.000Z',
      '1999-01-01T09:00:00.000Z',
      '1999-07-19T09:00:00.000Z',
    ]);
  });

  it('testDailyByWeekNo', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byWeekNo: [20],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-05-11T09:00:00.000Z', '1998-05-12T09:00:00.000Z', '1998-05-13T09:00:00.000Z']);
  });

  it('testDailyByWeekNoAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byWeekNo: [1],
      byDay: ['MO'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-29T09:00:00.000Z', '1999-01-04T09:00:00.000Z', '2000-01-03T09:00:00.000Z']);
  });

  it('testDailyByWeekNoAndWeekDayLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byWeekNo: [52],
      byDay: ['SU'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-28T09:00:00.000Z', '1998-12-27T09:00:00.000Z', '2000-01-02T09:00:00.000Z']);
  });

  it('testDailyByWeekNoAndWeekDayLast', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byWeekNo: [-1],
      byDay: ['SU'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-12-28T09:00:00.000Z', '1999-01-03T09:00:00.000Z', '2000-01-02T09:00:00.000Z']);
  });

  it('testDailyByWeekNoAndWeekDay53', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byWeekNo: [53],
      byDay: ['MO'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-12-28T09:00:00.000Z', '2004-12-27T09:00:00.000Z', '2009-12-28T09:00:00.000Z']);
  });

  it('testDailyByHour', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byHour: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:00:00.000Z', '1997-09-03T06:00:00.000Z', '1997-09-03T18:00:00.000Z']);
  });

  it('testDailyByMinute', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byMinute: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:06:00.000Z', '1997-09-02T09:18:00.000Z', '1997-09-03T09:06:00.000Z']);
  });

  it('testDailyBySecond', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:06.000Z', '1997-09-02T09:00:18.000Z', '1997-09-03T09:00:06.000Z']);
  });

  it('testDailyByHourAndMinute', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byHour: [6, 18],
      byMinute: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:06:00.000Z', '1997-09-02T18:18:00.000Z', '1997-09-03T06:06:00.000Z']);
  });

  it('testDailyByHourAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byHour: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:00:06.000Z', '1997-09-02T18:00:18.000Z', '1997-09-03T06:00:06.000Z']);
  });

  it('testDailyByMinuteAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byMinute: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:06:06.000Z', '1997-09-02T09:06:18.000Z', '1997-09-02T09:18:06.000Z']);
  });

  it('testDailyByHourAndMinuteAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byHour: [6, 18],
      byMinute: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:06:06.000Z', '1997-09-02T18:06:18.000Z', '1997-09-02T18:18:06.000Z']);
  });

  it('testDailyBySetPos', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byHour: [6, 18],
      byMinute: [15, 45],
      bySetPos: [3, -3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:15:00.000Z', '1997-09-03T06:45:00.000Z', '1997-09-03T18:15:00.000Z']);
  });
});
