import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {SCENARIOS, TIMEZONES} from './scenarios.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
const config = {
  warmupMs: Number(args['warmup-ms'] ?? 200),
  sampleMs: Number(args['sample-ms'] ?? 300),
  samples: Number(args.samples ?? 7),
};
for (const [key, value] of Object.entries(config)) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
}
if (!args['baseline-root']) throw new Error('Pass --baseline-root=/absolute/path/to/built/baseline');

const {RRuleTemporal: Baseline} = await import(pathToFileURL(resolve(args['baseline-root'], 'dist/index.js')).href);
const {RRuleTemporal: Candidate} = await import(
  args['package-root'] ? pathToFileURL(resolve(args['package-root'], 'dist/index.js')).href : '../dist/index.js'
);
const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR'];
const scenarios = [
  {id: 'yearly_last_weekday_1000', options: {freq: 'YEARLY', count: 1000, byDay: weekdays, bySetPos: [-1]}},
  {id: 'yearly_dates_1000', options: {freq: 'YEARLY', count: 1000, byMonth: [1, 4, 7, 10], byMonthDay: [1, 15]}},
  {
    id: 'monthly_slots_1000',
    options: {freq: 'MONTHLY', count: 1000, byDay: weekdays, byHour: [9, 17], byMinute: [0, 30]},
  },
  {
    id: 'monthly_slot_positions_240',
    options: {freq: 'MONTHLY', count: 240, byDay: weekdays, byHour: [9, 17], byMinute: [0, 30], bySetPos: [1, -1]},
  },
  {
    id: 'yearly_dense_positions_2',
    startTime: '000000',
    options: {
      freq: 'YEARLY',
      count: 2,
      byDay: weekdays,
      byHour: Array.from({length: 24}, (_, index) => index),
      byMinute: Array.from({length: 60}, (_, index) => index),
      bySecond: Array.from({length: 60}, (_, index) => index),
      bySetPos: [1, -1],
      maxCandidateEvaluations: 2,
    },
  },
  {id: 'daily_exdate_1000', options: {freq: 'DAILY', count: 1000}, exceptions: true},
  {id: 'secondly_exdate_3600', options: {freq: 'SECONDLY', count: 3600}, exceptions: true},
  {id: 'daily_exdate_chicago_1000', zone: 'America/Chicago', options: {freq: 'DAILY', count: 1000}, exceptions: true},
  {
    id: 'yearly_callback_first_3',
    options: {freq: 'YEARLY', count: 1000, byDay: weekdays, bySetPos: [-1]},
    stop: 3,
  },
  ...SCENARIOS.flatMap((scenario) =>
    TIMEZONES.map((zone) => ({
      id: `${scenario.id}_${zone.id}`,
      ics: scenario.buildIcs(zone.id),
    })),
  ),
].filter(
  (scenario) => (!args.filter || scenario.id.includes(args.filter)) && (args.suite !== 'targeted' || !scenario.ics),
);

function build(Rule, scenario) {
  if (scenario.ics) return new Rule({rruleString: scenario.ics, cache: false});
  const dtstart = new Rule({
    rruleString: `DTSTART;TZID=${scenario.zone ?? 'UTC'}:20250101T${scenario.startTime ?? '090000'}\nRRULE:FREQ=DAILY;COUNT=1`,
  }).all()[0];
  return new Rule({
    ...scenario.options,
    dtstart,
    cache: false,
    ...(scenario.exceptions
      ? {
          exDate: [dtstart, dtstart.add({days: 20})],
          rDate: [dtstart.add({years: 5}), dtstart],
        }
      : {}),
  });
}

let checksum = 0n;
function execute(rule, scenario) {
  const result = rule.all(scenario.stop === undefined ? undefined : (_, index) => index < scenario.stop);
  checksum ^= BigInt(result.length) ^ (result[0]?.epochNanoseconds ?? 0n) ^ (result.at(-1)?.epochNanoseconds ?? 0n);
  return result;
}

function sample(fn, duration) {
  let iterations = 0;
  const start = performance.now();
  let now = start;
  do {
    fn();
    iterations++;
    now = performance.now();
  } while (now - start < duration);
  return (now - start) / iterations;
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    minMs: sorted[0],
    maxMs: sorted.at(-1),
  };
}

console.log(JSON.stringify({node: process.version, config, baselineRoot: args['baseline-root']}));
for (const scenario of scenarios) {
  const oldRule = build(Baseline, scenario);
  const newRule = build(Candidate, scenario);
  const keys = (dates) => dates.map((date) => date.toString());
  const coldStart = performance.now();
  const expected = execute(oldRule, scenario);
  const baselineColdMs = performance.now() - coldStart;
  const candidateStart = performance.now();
  const actual = execute(newRule, scenario);
  const candidateColdMs = performance.now() - candidateStart;
  assert.deepEqual(keys(actual), keys(expected), scenario.id);
  const fns = [() => execute(oldRule, scenario), () => execute(newRule, scenario)];
  for (const fn of fns) sample(fn, config.warmupMs);
  const samples = [[], []];
  // Alternate order to reduce thermal/JIT bias between the two builds.
  for (let index = 0; index < config.samples; index++) {
    for (const implementation of index % 2 ? [1, 0] : [0, 1]) {
      samples[implementation].push(sample(fns[implementation], config.sampleMs));
    }
  }
  const baseline = stats(samples[0]);
  const candidate = stats(samples[1]);
  console.log(
    JSON.stringify({
      id: scenario.id,
      count: actual.length,
      baselineColdMs,
      candidateColdMs,
      baseline,
      candidate,
      speedup: baseline.medianMs / candidate.medianMs,
    }),
  );
}
console.log(JSON.stringify({checksum: String(checksum)}));
