import {RRuleTemporal} from '../../dist/index.js';

const range = (start, end) => Array.from({length: end - start + 1}, (_, index) => start + index).join(',');
const everySecond = `BYHOUR=${range(0, 23)};BYMINUTE=${range(0, 59)};BYSECOND=${range(0, 59)}`;
const rules = [
  [
    '20250101T000000Z',
    `FREQ=YEARLY;BYMONTHDAY=${range(1, 31)};BYHOUR=${range(0, 23)};BYMINUTE=${range(0, 37)};BYSECOND=0,1,2;COUNT=1000`,
  ],
  ['20250101T000000Z', `FREQ=MONTHLY;BYMONTHDAY=${range(1, 11)};${everySecond};COUNT=100`],
  ['20250105T235900Z', `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;${everySecond};COUNT=500000`],
];

const kept = [];
for (const [start, rrule] of rules) {
  for (let index = 0; index < 8; index += 1) {
    const rule = new RRuleTemporal({rruleString: `DTSTART:${start}\nRRULE:${rrule}`});
    const from = new Date(`${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}T23:59:00Z`);
    rule.between(from, new Date(from.getTime() + 60_000), true);
    kept.push(rule);
  }
}

process.stdout.write(String(kept.length));
