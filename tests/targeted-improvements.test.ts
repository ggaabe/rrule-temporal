import {RRuleTemporal} from '../src';
import {assertDates, zdt} from './helpers';

describe('targeted parser and options improvements', () => {
  it('parses DTSTART parameters regardless of order', () => {
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART;TZID=Europe/Brussels;VALUE=DATE-TIME:19970902T090000\nRRULE:FREQ=YEARLY;COUNT=2',
    });

    assertDates({rule}, ['1997-09-02T07:00:00.000Z', '1998-09-02T07:00:00.000Z']);
  });

  it('parses EXDATE and RDATE parameters regardless of order', () => {
    const rule = new RRuleTemporal({
      rruleString:
        'DTSTART;TZID=Europe/Brussels:19970902T090000\nRRULE:FREQ=DAILY;COUNT=3\nEXDATE;TZID=Europe/Brussels;VALUE=DATE-TIME:19970903T090000\nRDATE;TZID=Europe/Brussels;VALUE=DATE-TIME:19970905T090000',
    });

    assertDates({rule}, [
      '1997-09-02T07:00:00.000Z',
      '1997-09-04T07:00:00.000Z',
      '1997-09-05T07:00:00.000Z',
    ]);
  });

  it('returns a defensive options snapshot', () => {
    const rule = new RRuleTemporal({
      freq: 'DAILY',
      dtstart: zdt(2025, 1, 1, 9, 'UTC'),
      count: 3,
      byHour: [9],
    });

    const options = rule.options();
    options.count = 99;
    options.byHour?.push(12);

    expect(rule.options().count).toBe(3);
    expect(rule.options().byHour).toEqual([9]);
    expect(rule.all().map((date) => date.hour)).toEqual([9, 9, 9]);
  });

  it.each([
    ['INTERVAL', 'DTSTART:20250101T000000Z\nRRULE:FREQ=DAILY;INTERVAL=2x;COUNT=1', 'Invalid INTERVAL value: 2x'],
    ['COUNT', 'DTSTART:20250101T000000Z\nRRULE:FREQ=DAILY;COUNT=1x', 'Invalid COUNT value: 1x'],
    ['BYHOUR', 'DTSTART:20250101T000000Z\nRRULE:FREQ=DAILY;COUNT=1;BYHOUR=9x', 'Invalid BYHOUR value: 9x'],
    ['BYMONTH', 'DTSTART:20250101T000000Z\nRRULE:FREQ=DAILY;COUNT=1;BYMONTH=1foo', 'Invalid BYMONTH value: 1foo'],
  ])('strict rejects malformed numeric token for %s', (_part, rruleString, message) => {
    expect(() => new RRuleTemporal({rruleString, strict: true})).toThrow(message);
  });

  it('keeps malformed numeric tokens lenient outside strict mode', () => {
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART:20250101T000000Z\nRRULE:FREQ=DAILY;COUNT=1;BYHOUR=9x',
    });

    expect(rule.toString()).toContain('BYHOUR=9');
  });
});
