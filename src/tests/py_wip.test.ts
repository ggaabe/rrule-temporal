import {RRuleTemporal} from '../index';
import {assertDates, zdt} from './helpers';

it('testWeeklyByMonthAndYearDay', () => {
  const rule = new RRuleTemporal({
    freq: 'WEEKLY',
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
