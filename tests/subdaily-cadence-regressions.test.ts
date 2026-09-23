import {readFileSync} from 'node:fs';
import {RRuleTemporal} from '../src';
import {Temporal} from '../src/temporal-impl';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/subdaily-dateutil.json', import.meta.url), 'utf8')) as {
  cases: Array<{rule: string; first: string; deltas: number[]}>;
};
const utc = (text: string) => Temporal.ZonedDateTime.from(`${text}[UTC]`);
const times = (dates: Array<{toString(): string}>) => dates.map((date) => date.toString().slice(0, 19));

describe('sub-daily rules keep the DTSTART + k * INTERVAL cadence', () => {
  it.each(fixture.cases)('matches python-dateutil for $rule', ({rule, first, deltas}) => {
    let epoch = Temporal.Instant.from(first).epochMilliseconds;
    const expected = [epoch, ...deltas.map((delta) => (epoch += delta * 1000))];
    const actual = new RRuleTemporal({rruleString: rule.replace('\\n', '\n')}).all();
    expect(actual.map((date) => date.epochMilliseconds)).toEqual(expected);
  });

  it('answers every query from the same cadence', () => {
    // 23:30 + 3k minutes reaches minutes 0 and 45, but never minute 17.
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART:20240131T233000Z\nRRULE:FREQ=MINUTELY;INTERVAL=3;BYMINUTE=0,17,45;UNTIL=20240201T013000Z',
    });
    const expected = ['2024-01-31T23:45:00', '2024-02-01T00:00:00', '2024-02-01T00:45:00', '2024-02-01T01:00:00'];
    expect(times(rule.all())).toEqual(expected);
    expect(times(rule.all(() => true))).toEqual(expected);
    expect(times(rule.between(utc('2024-01-31T23:00'), utc('2024-02-01T02:00')))).toEqual(expected);
    expect(String(rule.next(utc('2024-01-31T23:50'))).slice(0, 19)).toBe(expected[1]);
    expect(String(rule.previous(utc('2024-02-01T01:29'))).slice(0, 19)).toBe(expected[3]);
    expect(rule.matches(utc('2024-02-01T01:17'))).toBe(false);
  });

  it('continues the RFC 5545 twenty-minute example on the following days', () => {
    const rule = new RRuleTemporal({
      rruleString:
        'DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=MINUTELY;INTERVAL=20;BYHOUR=9,10,11,12,13,14,15,16;COUNT=50',
    });
    const dates = rule.all();
    expect(dates.filter((date) => date.day === 2)).toHaveLength(24);
    expect(dates[24]!.toString()).toBe('1997-09-03T09:00:00-04:00[America/New_York]');
  });

  it('never emits an occurrence before DTSTART', () => {
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART;TZID=Pacific/Apia:20111229T200000\nRRULE:FREQ=HOURLY;BYHOUR=0,1,2,3,4;COUNT=6',
    });
    // Samoa skipped 2011-12-30 entirely.
    expect(times(rule.all())).toEqual([
      '2011-12-31T00:00:00',
      '2011-12-31T01:00:00',
      '2011-12-31T02:00:00',
      '2011-12-31T03:00:00',
      '2011-12-31T04:00:00',
      '2012-01-01T00:00:00',
    ]);
  });

  it('visits both instances of a repeated hour for MINUTELY and SECONDLY', () => {
    const minutely = new RRuleTemporal({
      rruleString: 'DTSTART;TZID=America/Chicago:20241103T003000\nRRULE:FREQ=MINUTELY;BYMINUTE=0,30;COUNT=6',
    });
    expect(minutely.all().map(String)).toEqual([
      '2024-11-03T00:30:00-05:00[America/Chicago]',
      '2024-11-03T01:00:00-05:00[America/Chicago]',
      '2024-11-03T01:30:00-05:00[America/Chicago]',
      '2024-11-03T01:00:00-06:00[America/Chicago]',
      '2024-11-03T01:30:00-06:00[America/Chicago]',
      '2024-11-03T02:00:00-06:00[America/Chicago]',
    ]);
    const hourly = new RRuleTemporal({
      rruleString: 'DTSTART;TZID=America/Chicago:20241103T000000\nRRULE:FREQ=HOURLY;BYMINUTE=0,30;COUNT=6',
    });
    // HOURLY;INTERVAL=1 visits the repeated hour once, as without BYMINUTE.
    expect(times(hourly.all())).toEqual([
      '2024-11-03T00:00:00',
      '2024-11-03T00:30:00',
      '2024-11-03T01:00:00',
      '2024-11-03T01:30:00',
      '2024-11-03T02:00:00',
      '2024-11-03T02:30:00',
    ]);
  });

  it('keeps generated times that a 30-minute gap leaves intact', () => {
    // Lord Howe skips 02:00-02:29 on 2024-10-06; 02:30 still exists.
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART;TZID=Australia/Lord_Howe:20241006T010000\nRRULE:FREQ=HOURLY;BYMINUTE=0,30;COUNT=4',
    });
    expect(rule.all().map(String)).toEqual([
      '2024-10-06T01:00:00+10:30[Australia/Lord_Howe]',
      '2024-10-06T01:30:00+10:30[Australia/Lord_Howe]',
      '2024-10-06T02:30:00+11:00[Australia/Lord_Howe]',
      '2024-10-06T03:00:00+11:00[Australia/Lord_Howe]',
    ]);
  });

  it('applies BYSETPOS within each HOURLY period', () => {
    const rule = new RRuleTemporal({
      rruleString: 'DTSTART:20240101T090000Z\nRRULE:FREQ=HOURLY;BYHOUR=9,17;BYMINUTE=0,30;BYSETPOS=1;COUNT=4',
    });
    expect(times(rule.all())).toEqual([
      '2024-01-01T09:00:00',
      '2024-01-01T17:00:00',
      '2024-01-02T09:00:00',
      '2024-01-02T17:00:00',
    ]);
  });
});
