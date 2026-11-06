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

const queried = new RRuleTemporal({rruleString});
const window = queried.between(new Date('2025-01-01T00:00:00Z'), new Date('2025-01-02T00:00:00Z'), true);
if (window.length !== 1 || window[0]?.toString() !== expected) {
  throw new Error(`Unexpected dense between() result: ${window.map((value) => value.toString()).join(', ')}`);
}

const following = new RRuleTemporal({rruleString}).next(new Date('2024-12-31T00:00:00Z'));
if (following?.toString() !== expected) {
  throw new Error(`Unexpected dense next() result: ${following?.toString()}`);
}

const preceding = new RRuleTemporal({rruleString}).previous(new Date('2026-01-01T00:00:00Z'));
if (preceding?.toString() !== expected) {
  throw new Error(`Unexpected dense previous() result: ${preceding?.toString()}`);
}

if (!new RRuleTemporal({rruleString}).matches(new Date('2025-01-01T00:00:00Z'))) {
  throw new Error('Dense matches() missed its occurrence');
}

if (!new RRuleTemporal({rruleString}).occursOn('2025-01-01')) {
  throw new Error('Dense occursOn() missed its occurrence');
}

process.stdout.write(expected);
