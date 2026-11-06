import {RRuleTemporal} from '../../dist/index.js';

const days = Array.from({length: 31}, (_, index) => index + 1).join(',');

// In functions, so that no stack frame of this module holds on to the rule
const buildAndDropRule = () => {
  const rule = new RRuleTemporal({
    rruleString: `DTSTART:20250101T000000Z\nRRULE:FREQ=YEARLY;BYMONTHDAY=${days};BYHOUR=9,10,11,12;BYMINUTE=0,1,2,3,4,5,6;COUNT=100`,
  });
  rule.all();
  rule.next(new Date('2025-01-01T00:00:00Z'));
  return new WeakRef(rule);
};
const dropped = buildAndDropRule();
const isKept = () => dropped.deref() !== undefined;

// A WeakRef keeps its target until the current job ends, and collecting it can take a few rounds
for (let round = 0; round < 20 && isKept(); round += 1) {
  await new Promise((resolve) => setTimeout(resolve, 20));
  globalThis.gc();
}

process.stdout.write(isKept() ? 'kept' : 'collected');
