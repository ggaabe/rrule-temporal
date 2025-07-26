import {RRuleTemporal} from '../index';
import {parse, zdt} from './helpers';
import {Temporal} from 'temporal-polyfill';

function assertRuleReverseRest(rule: RRuleTemporal) {
  const newRule = parse(rule.toString());
  expect(newRule.all()).toEqual(rule.all());
}

describe('reverse', () => {
  it('testToStrYearly', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyInterval', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      interval: 2,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByMonth', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonth: [1, 3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByMonthDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonthDay: [1, 3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByMonthAndMonthDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonth: [1, 3],
      byMonthDay: [5, 7],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByNWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byDay: ['1TU', '-1TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByNWeekDayLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byDay: ['3TU', '-3TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByMonthAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByMonthAndNWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['1TU', '-1TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByMonthAndNWeekDayLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonth: [1, 3],
      byDay: ['3TU', '-3TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByMonthDayAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonthDay: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByMonthAndMonthDayAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonth: [1, 3],
      byMonthDay: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByYearDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 4,
      byYearDay: [1, 100, 200, 365],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByYearDayNeg', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 4,
      byYearDay: [-365, -266, -166, -1],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByWeekNo', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byWeekNo: [20],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByWeekNoAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byWeekNo: [1],
      byDay: ['MO'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByWeekNoAndWeekDayLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byWeekNo: [52],
      byDay: ['SU'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByWeekNoAndWeekDayLast', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byWeekNo: [-1],
      byDay: ['SU'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByWeekNoAndWeekDay53', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byWeekNo: [53],
      byDay: ['MO'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByHour', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byHour: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByMinute', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMinute: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyBySecond', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByHourAndMinute', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byHour: [6, 18],
      byMinute: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByHourAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byHour: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByMinuteAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMinute: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyByHourAndMinuteAndSecond', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byHour: [6, 18],
      byMinute: [6, 18],
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrYearlyBySetPos', () => {
    const rule = new RRuleTemporal({
      freq: 'YEARLY',
      count: 3,
      byMonthDay: [15],
      byHour: [6, 18],
      bySetPos: [3, -3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrMonthly', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrMonthlyInterval', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      interval: 2,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrMonthlyIntervalLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      interval: 18,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrMonthlyByMonthDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byMonthDay: [1, 3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrMonthlyByWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrMonthlyByNWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byDay: ['1TU', '-1TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrMonthlyByNWeekDayLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byDay: ['3TU', '-3TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrMonthlyByMonthDayAndWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byMonthDay: [1, 3],
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrMonthlyBySetPos', () => {
    const rule = new RRuleTemporal({
      freq: 'MONTHLY',
      count: 3,
      byMonthDay: [13, 17],
      byHour: [6, 18],
      bySetPos: [3, -3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrWeekly', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrWeeklyInterval', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      interval: 2,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrWeeklyIntervalLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      interval: 20,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrWeeklyByMonthDay', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byMonthDay: [1, 3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrWeeklyByWeekDay', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byDay: ['TU', 'TH'],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrWeeklyBySetPos', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      byDay: ['TU', 'TH'],
      byHour: [6, 18],
      bySetPos: [3, -3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrDaily', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrDailyInterval', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      interval: 2,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrDailyIntervalLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      interval: 92,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrDailyByHour', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byHour: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrDailyByMinute', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byMinute: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrDailyBySecond', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrDailyBySetPos', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 3,
      byHour: [6, 18],
      byMinute: [15, 45],
      bySetPos: [3, -3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrHourly', () => {
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      count: 3,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrHourlyInterval', () => {
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      count: 3,
      interval: 2,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrHourlyIntervalLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      count: 3,
      interval: 769,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrHourlyByMinute', () => {
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      count: 3,
      byMinute: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrHourlyBySecond', () => {
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      count: 3,
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrHourlyBySetPos', () => {
    const rule = new RRuleTemporal({
      freq: 'HOURLY',
      count: 3,
      byMinute: [15, 45],
      bySecond: [15, 45],
      bySetPos: [3, -3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrMinutely', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrMinutelyInterval', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      interval: 2,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrMinutelyIntervalLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      interval: 1501,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrMinutelyBySecond', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      bySecond: [6, 18],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrMinutelyBySetPos', () => {
    const rule = new RRuleTemporal({
      freq: 'MINUTELY',
      count: 3,
      bySecond: [15, 30, 45],
      bySetPos: [3, -3],
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrSecondly', () => {
    const rule = new RRuleTemporal({
      freq: 'SECONDLY',
      count: 3,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrSecondlyInterval', () => {
    const rule = new RRuleTemporal({
      freq: 'SECONDLY',
      count: 3,
      interval: 2,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrSecondlyIntervalLarge', () => {
    const rule = new RRuleTemporal({
      freq: 'SECONDLY',
      count: 3,
      interval: 90061,
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrSecondlyByHourAndMinuteAndSecondBug', () => {
    const rule = new RRuleTemporal({
      freq: 'SECONDLY',
      count: 3,
      bySecond: [0],
      byMinute: [1],
      dtstart: zdt(2010, 3, 22, 12, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('testToStrWithWkSt', () => {
    const rule = new RRuleTemporal({
      freq: 'WEEKLY',
      count: 3,
      wkst: 'SU',
      dtstart: zdt(1997, 9, 2, 9, 'UTC'),
    });
    assertRuleReverseRest(rule);
  });

  it('test rDate and exDate', () => {
    const rDate1 = Temporal.ZonedDateTime.from('2025-01-10T10:00:00[UTC]');
    const rDate2 = Temporal.ZonedDateTime.from('2025-01-15T10:00:00[UTC]');
    const exDate1 = Temporal.ZonedDateTime.from('2025-01-02T10:00:00[UTC]');
    const exDate2 = Temporal.ZonedDateTime.from('2025-01-15T10:00:00[UTC]'); // Exclude one of the rDates
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      count: 10, // Generate more than we need so rDates can be added
      dtstart: Temporal.ZonedDateTime.from('2025-01-01T10:00:00[UTC]'),
      rDate: [rDate1, rDate2],
      exDate: [exDate1, exDate2],
    });
    assertRuleReverseRest(rule);
  });
});
