import {RRuleTemporal} from '../index';
import {assertDates, zdt} from './helpers';

describe('Monthly frequency tests', () => {
  it('testMonthly', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-10-02T09:00:00.000Z', '1997-11-02T09:00:00.000Z']);
  });

  it('testMonthlyInterval', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      interval: 2,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-11-02T09:00:00.000Z', '1998-01-02T09:00:00.000Z']);
  });

  it('testMonthlyIntervalLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      interval: 18,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1999-03-02T09:00:00.000Z', '2000-09-02T09:00:00.000Z']);
  });

  it('testMonthlyByMonth', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byMonth: [1, 3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-02T09:00:00.000Z', '1998-03-02T09:00:00.000Z', '1999-01-02T09:00:00.000Z']);
  });

  it('testMonthlyByMonthDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byMonthDay: [1, 3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-03T09:00:00.000Z', '1997-10-01T09:00:00.000Z', '1997-10-03T09:00:00.000Z']);
  });

  it('testMonthlyByMonthAndMonthDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byMonth: [1, 3],
      byMonthDay: [5, 7],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-05T09:00:00.000Z', '1998-01-07T09:00:00.000Z', '1998-03-05T09:00:00.000Z']);
  });

  it('testMonthlyByWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-04T09:00:00.000Z', '1997-09-09T09:00:00.000Z']);
  });

  it('testMonthlyByNWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byDay: ['1TU', '-1TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:00.000Z', '1997-09-25T09:00:00.000Z', '1997-10-07T09:00:00.000Z']);
  });

  it('testMonthlyByNWeekDayLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byDay: ['3TU', '-3TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-11T09:00:00.000Z', '1997-09-16T09:00:00.000Z', '1997-10-16T09:00:00.000Z']);
  });

  it('testMonthlyByMonthAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-01-06T09:00:00.000Z', '1998-01-08T09:00:00.000Z']);
  });

  it('testMonthlyByMonthAndNWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['1TU', '-1TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-06T09:00:00.000Z', '1998-01-29T09:00:00.000Z', '1998-03-03T09:00:00.000Z']);
  });

  it('testMonthlyByMonthAndNWeekDayLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['3TU', '-3TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-15T09:00:00.000Z', '1998-01-20T09:00:00.000Z', '1998-03-12T09:00:00.000Z']);
  });

  it('testMonthlyByMonthDayAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byMonthDay: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-02-03T09:00:00.000Z', '1998-03-03T09:00:00.000Z']);
  });

  it('testMonthlyByMonthAndMonthDayAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byMonth: [1, 3],
      byMonthDay: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1998-01-01T09:00:00.000Z', '1998-03-03T09:00:00.000Z', '2001-03-01T09:00:00.000Z']);
  });

  it('testMonthlyByYearDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
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

  it('testMonthlyByYearDayNeg', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
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

  it('testMonthlyByMonthAndYearDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 4,
      byMonth: [4, 7],
      byYearDay: [1, 100, 200, 365],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, [
      '1998-04-10T09:00:00.000Z',
      '1998-07-19T09:00:00.000Z',
      '1999-04-10T09:00:00.000Z',
      '1999-07-19T09:00:00.000Z',
    ]);
  });

  it('testMonthlyByMonthAndYearDayNeg', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 4,
      byMonth: [4, 7],
      byYearDay: [-365, -266, -166, -1],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, [
      '1998-04-10T09:00:00.000Z',
      '1998-07-19T09:00:00.000Z',
      '1999-04-10T09:00:00.000Z',
      '1999-07-19T09:00:00.000Z',
    ]);
  });

  it('testMonthlyByHour', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byHour: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:00:00.000Z', '1997-10-02T06:00:00.000Z', '1997-10-02T18:00:00.000Z']);
  });

  it('testMonthlyByMinute', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byMinute: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:06:00.000Z', '1997-09-02T09:18:00.000Z', '1997-10-02T09:06:00.000Z']);
  });

  it('testMonthlyBySecond', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:00:06.000Z', '1997-09-02T09:00:18.000Z', '1997-10-02T09:00:06.000Z']);
  });

  it('testMonthlyByHourAndMinute', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byHour: [6, 18],
      byMinute: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:06:00.000Z', '1997-09-02T18:18:00.000Z', '1997-10-02T06:06:00.000Z']);
  });

  it('testMonthlyByHourAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byHour: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:00:06.000Z', '1997-09-02T18:00:18.000Z', '1997-10-02T06:00:06.000Z']);
  });

  it('testMonthlyByMinuteAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byMinute: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T09:06:06.000Z', '1997-09-02T09:06:18.000Z', '1997-09-02T09:18:06.000Z']);
  });

  it('testMonthlyByHourAndMinuteAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byHour: [6, 18],
      byMinute: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-02T18:06:06.000Z', '1997-09-02T18:06:18.000Z', '1997-09-02T18:18:06.000Z']);
  });

  it('testMonthlyBySetPos', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byMonthDay: [13, 17],
      byHour: [6, 18],
      bySetPos: [3, -3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertDates({rule}, ['1997-09-13T18:00:00.000Z', '1997-09-17T06:00:00.000Z', '1997-10-13T18:00:00.000Z']);
  });
});
