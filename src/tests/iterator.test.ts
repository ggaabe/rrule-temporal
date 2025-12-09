import {Temporal} from '@js-temporal/polyfill';
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
    expect(formatISO(rule.next(new Date('2025-09-02T03:00:00.000Z')))).toEqual('2025-09-05T03:00:00.000Z');
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
    expect(formatISO(rule.previous(new Date('2025-09-09T03:00:00.000Z')))).toEqual('2025-09-05T03:00:00.000Z');
  });

  it('should surface mid-sequence rdates for next() when no COUNT is set', () => {
    const rule = parse(
      [
        'DTSTART;TZID=America/New_York:20251201T000000',
        'RRULE:FREQ=WEEKLY;BYDAY=WE',
        'RDATE:20251212T000000',
      ].join('\n'),
    );
    const dtstart = Temporal.ZonedDateTime.from('2025-12-01T00:00:00[America/New_York]');

    const dates: string[] = [];
    let occurrence = rule.next(dtstart, true);
    while (occurrence && dates.length < 5) {
      dates.push(occurrence.toPlainDate().toString());
      occurrence = rule.next(occurrence, false);
    }

    expect(dates).toEqual(['2025-12-03', '2025-12-10', '2025-12-12', '2025-12-17', '2025-12-24']);
  });

  it('should surface mid-sequence rdates for previous() when no COUNT is set', () => {
    const rule = parse(
      [
        'DTSTART;TZID=America/New_York:20251201T000000',
        'RRULE:FREQ=WEEKLY;BYDAY=WE',
        'RDATE:20251212T000000',
      ].join('\n'),
    );

    const checkpoint = Temporal.ZonedDateTime.from('2025-12-15T00:00:00[America/New_York]');
    const prev = rule.previous(checkpoint, false);
    const prev2 = prev ? rule.previous(prev, false) : null;

    expect(prev?.toPlainDate().toString()).toEqual('2025-12-12');
    expect(prev2?.toPlainDate().toString()).toEqual('2025-12-10');
  });
});
