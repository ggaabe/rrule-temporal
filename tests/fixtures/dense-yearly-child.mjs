import {RRuleTemporal} from '../../dist/index.js';

const range = (start, end) => Array.from({length: end - start + 1}, (_, index) => start + index).join(',');
const rruleString = [
  'DTSTART:20250101T000000Z',
  [
    'RRULE:FREQ=YEARLY',
    'COUNT=1',
    `BYMONTH=${range(1, 12)}`,
    `BYMONTHDAY=${range(1, 31)}`,
    `BYHOUR=${range(0, 23)}`,
    `BYMINUTE=${range(0, 59)}`,
    `BYSECOND=${range(0, 59)}`,
  ].join(';'),
].join('\n');

const results = new RRuleTemporal({rruleString}).all();
const expected = '2025-01-01T00:00:00+00:00[UTC]';
if (results.length !== 1 || results[0]?.toString() !== expected) {
  throw new Error(`Unexpected dense recurrence result: ${results.map((value) => value.toString()).join(', ')}`);
}

process.stdout.write(expected);
