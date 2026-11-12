// Builds and keeps the numeric query plans of many dense COUNT rules at once.
// Run with a small --max-old-space-size: a plan that holds its period's
// candidates takes tens of megabytes per rule here.
import {RRuleTemporal} from '../../dist/index.js';

const range = (start, end) => Array.from({length: end - start + 1}, (_, index) => start + index).join(',');
const everySecond = `BYHOUR=${range(0, 23)};BYMINUTE=${range(0, 59)};BYSECOND=${range(0, 59)}`;
const shapes = [
  // About a million candidates in the first year.
  [
    'yearly',
    '20250101T000000Z',
    `FREQ=YEARLY;BYMONTHDAY=${range(1, 31)};BYHOUR=${range(0, 23)};BYMINUTE=${range(0, 37)};BYSECOND=0,1,2;COUNT=1000`,
    4,
  ],
  // About 2.7 million candidates in the first month.
  ['monthly', '20250101T000000Z', `FREQ=MONTHLY;BYMONTHDAY=${range(1, 31)};${everySecond};COUNT=30000000`, 61],
  // 604,800 candidates a week.
  ['weekly', '20250105T235900Z', `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;${everySecond};COUNT=500000`, 61],
  // 86,400 candidates a day, in a cycle of seven days.
  ['daily', '20250101T235900Z', `FREQ=DAILY;${everySecond};COUNT=500000`, 61],
];
const copies = Number(process.argv[2] ?? 8);
const only = process.argv[3];

const kept = [];
for (const [kind, start, rrule, windowLength] of shapes) {
  if (only && kind !== only) continue;
  for (let copy = 0; copy < copies; copy += 1) {
    const rule = new RRuleTemporal({rruleString: `DTSTART:${start}\nRRULE:${rrule}`});
    const from = new Date(start.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z'));
    const dates = rule.between(from, new Date(from.getTime() + 60_000), true);
    const expectedFirst = from.toISOString().replace('.000Z', '+00:00[UTC]');
    if (dates.length !== windowLength || dates[0].toString() !== expectedFirst) {
      throw new Error(`${kind}: unexpected window ${dates.length} ${dates[0]?.toString()}`);
    }
    if (rule.numericQueryPlanCache?.kind !== kind) {
      throw new Error(`${kind}: no cached plan (${rule.numericQueryPlanCache?.kind})`);
    }
    kept.push(rule);
  }
}

// Every plan is still cached and answers from it.
for (const rule of kept) {
  if (!rule.numericQueryPlanCache || !rule.next(new Date('2025-01-01T00:00:00Z'))) {
    throw new Error('a plan was dropped');
  }
}

process.stdout.write(String(kept.length));
