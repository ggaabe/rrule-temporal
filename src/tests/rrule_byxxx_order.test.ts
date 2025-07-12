import {RRuleTemporal} from '../index';
import {zdt} from './helpers';

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
