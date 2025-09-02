import {formatISO, parse} from './helpers';

describe('all() iterator', function () {
  it('should enforce exdate for next()', () => {
    const rule = parse(
      [
        'DTSTART;TZID=Australia/Sydney:20250901T130000',
        'RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=MO,TU,WE',
        'EXDATE:20250909T030000Z',
      ].join('\n'),
    );
    // next date should skip over exdate
    expect(formatISO(rule.next(new Date('2025-09-08T03:00:00.000Z')))).toEqual('2025-09-10T03:00:00.000Z');
  });
  it('should enforce exdate for previous()', () => {
    const rule = parse(
      [
        'DTSTART;TZID=Australia/Sydney:20250901T130000',
        'RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=MO,TU,WE',
        'EXDATE:20250909T030000Z',
      ].join('\n'),
    );
    // previous date should skip over exdate
    expect(formatISO(rule.previous(new Date('2025-09-10T03:00:00.000Z')))).toEqual('2025-09-08T03:00:00.000Z');
  });
  it('should enforce rdate for next()', () => {
    const rule = parse(
      [
        'DTSTART;TZID=Australia/Sydney:20250901T130000',
        'RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=MO,TU,WE',
        'RDATE:20250905T030000Z',
      ].join('\n'),
    );
    expect(formatISO(rule.next(new Date('2025-09-03T03:00:00.000Z')))).toEqual('2025-09-05T03:00:00.000Z');
  });
  it('should enforce rdate for previous()', () => {
    const rule = parse(
      [
        'DTSTART;TZID=Australia/Sydney:20250901T130000',
        'RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=MO,TU,WE',
        'RDATE:20250905T030000Z',
      ].join('\n'),
    );
    expect(formatISO(rule.previous(new Date('2025-09-08T03:00:00.000Z')))).toEqual('2025-09-05T03:00:00.000Z');
  });
  it('should handle rdate and exdate for next()', ()=>{
    const rule = parse(
      [
        'DTSTART;TZID=Australia/Sydney:20250901T130000',
        'RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=MO,TU,WE',
        'EXDATE:20250903T030000Z',
        'RDATE:20250905T030000Z',
      ].join('\n'),
    );
    expect(formatISO(rule.next(new Date('2025-09-02T03:00:00.000Z')))).toEqual('2025-09-05T03:00:00.000Z')
  });
  it('should handle rdate and exdate for previous()', ()=>{
    const rule = parse(
      [
        'DTSTART;TZID=Australia/Sydney:20250901T130000',
        'RRULE:FREQ=WEEKLY;COUNT=10;BYDAY=MO,TU,WE',
        'EXDATE:20250908T030000Z',
        'RDATE:20250905T030000Z',
      ].join('\n'),
    );
    expect(formatISO(rule.previous(new Date('2025-09-09T03:00:00.000Z')))).toEqual('2025-09-05T03:00:00.000Z')
  });
});
