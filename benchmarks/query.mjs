import {performance} from 'node:perf_hooks';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {Temporal} from 'temporal-polyfill';

const BENCHMARK_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGE_ROOT = path.resolve(BENCHMARK_DIR, '..');
const DEFAULTS = {
  packageRoot: DEFAULT_PACKAGE_ROOT,
  warmupMs: 100,
  sampleMs: 150,
  samples: 5,
  scenario: null,
};

function parseArgs(argv) {
  const args = {...DEFAULTS};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token?.startsWith('--')) continue;
    const [rawKey, rawValue] = token.slice(2).split('=');
    const value = rawValue ?? argv[index + 1];
    if (value == null) continue;
    if (rawValue == null) index += 1;
    if (rawKey === 'package-root') args.packageRoot = path.resolve(value);
    if (rawKey === 'warmup-ms') args.warmupMs = Number(value);
    if (rawKey === 'sample-ms') args.sampleMs = Number(value);
    if (rawKey === 'samples') args.samples = Number(value);
    if (rawKey === 'scenario') args.scenario = value;
  }
  return args;
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    min: sorted[0],
    max: sorted.at(-1),
  };
}

let checksumSink = 0n;

function consume(result) {
  if (typeof result === 'boolean') {
    checksumSink = BigInt.asUintN(64, checksumSink + (result ? 1n : 0n));
    return 1;
  }
  const values = Array.isArray(result) ? result : result ? [result] : [];
  let checksum = 0n;
  for (const value of values) checksum ^= value.epochNanoseconds;
  checksumSink = BigInt.asUintN(64, checksumSink + checksum + BigInt(values.length));
  return values.length;
}

function measure(fn, config) {
  const warmupEnd = performance.now() + config.warmupMs;
  while (performance.now() < warmupEnd) consume(fn());

  const microsecondsPerOperation = [];
  for (let sample = 0; sample < config.samples; sample++) {
    let iterations = 0;
    const start = performance.now();
    let now = start;
    do {
      consume(fn());
      iterations += 1;
      now = performance.now();
    } while (now - start < config.sampleMs);
    microsecondsPerOperation.push(((now - start) * 1_000) / iterations);
  }
  return summarize(microsecondsPerOperation);
}

function utc(value) {
  return Temporal.ZonedDateTime.from(`${value}[UTC]`);
}

function chicago(value) {
  return Temporal.ZonedDateTime.from(`${value}[America/Chicago]`);
}

const SCENARIOS = [
  {
    id: 'fixed_small_next_128_rank_63',
    label: 'SECONDLY next, COUNT 128, rank 63',
    build: (RRuleTemporal) => {
      const dtstart = utc('2025-01-01T00:00:00');
      const target = dtstart.add({seconds: 63});
      const rule = new RRuleTemporal({freq: 'SECONDLY', count: 128, dtstart, cache: false});
      return {run: () => rule.next(target, true), expectedLength: 1};
    },
  },
  {
    id: 'fixed_next_250000_rank_200000',
    label: 'SECONDLY next, COUNT 250k, rank 200k',
    build: (RRuleTemporal) => {
      const dtstart = utc('2025-01-01T00:00:00');
      const target = dtstart.add({seconds: 200_000});
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 250_000,
        maxIterations: 300_000,
        dtstart,
        cache: false,
      });
      return {run: () => rule.next(target, true), expectedLength: 1};
    },
  },
  {
    id: 'daily_next_9000_rank_8500_utc',
    label: 'DAILY next, COUNT 9k, rank 8.5k, UTC',
    build: (RRuleTemporal) => {
      const dtstart = utc('2000-01-01T09:00:00');
      const target = dtstart.add({days: 8_500});
      const rule = new RRuleTemporal({freq: 'DAILY', count: 9_000, dtstart, cache: false});
      return {run: () => rule.next(target, true), expectedLength: 1};
    },
  },
  {
    id: 'daily_previous_9000_rank_8500_chicago',
    label: 'DAILY previous, COUNT 9k, rank 8.5k, Chicago',
    build: (RRuleTemporal) => {
      const dtstart = chicago('2000-01-01T09:00:00');
      const target = dtstart.add({days: 8_500});
      const rule = new RRuleTemporal({freq: 'DAILY', count: 9_000, dtstart, cache: false});
      return {run: () => rule.previous(target, true), expectedLength: 1};
    },
  },
  {
    id: 'daily_weekdays_next_9000_distant_utc',
    label: 'DAILY weekdays next, COUNT 9k, distant, UTC',
    build: (RRuleTemporal) => {
      const dtstart = utc('2000-01-03T09:00:00');
      const target = utc('2032-01-01T09:00:00');
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
        count: 9_000,
        maxIterations: 20_000,
        dtstart,
        cache: false,
      });
      return {run: () => rule.next(target, true), expectedLength: 1};
    },
  },
  {
    id: 'daily_slots_between_9000_distant_utc',
    label: 'DAILY slots narrow between, COUNT 9k, UTC',
    build: (RRuleTemporal) => {
      const dtstart = utc('2000-01-01T12:00:00');
      const start = utc('2005-10-01T08:59:59');
      const end = utc('2005-10-02T17:00:01');
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        byHour: [9, 17],
        byMinute: [0, 30],
        count: 9_000,
        dtstart,
        cache: false,
      });
      return {run: () => rule.between(start, end), expectedLength: 7};
    },
  },
  {
    id: 'weekly_slots_next_9000_distant_utc',
    label: 'WEEKLY M/W/F slots next, COUNT 9k, UTC',
    build: (RRuleTemporal) => {
      const dtstart = utc('2000-01-03T09:00:00');
      const target = utc('2027-01-01T12:00:00');
      const rule = new RRuleTemporal({
        freq: 'WEEKLY',
        byDay: ['MO', 'WE', 'FR'],
        byHour: [9, 17],
        count: 9_000,
        dtstart,
        cache: false,
      });
      return {run: () => rule.next(target), expectedLength: 1};
    },
  },
  {
    id: 'monthly_last_weekday_next_9000_distant_utc',
    label: 'MONTHLY last weekday next, COUNT 9k, UTC',
    build: (RRuleTemporal) => {
      const dtstart = utc('2023-02-21T09:00:00');
      const target = utc('2700-01-01T09:00:00');
      const rule = new RRuleTemporal({
        freq: 'MONTHLY',
        byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
        bySetPos: [-1],
        count: 9_000,
        dtstart,
        cache: false,
      });
      return {run: () => rule.next(target), expectedLength: 1};
    },
  },
  {
    id: 'monthly_last_weekday_next_128_rank_63',
    label: 'MONTHLY last weekday next, COUNT 128, rank 63',
    build: (RRuleTemporal) => {
      const dtstart = utc('2023-02-21T09:00:00');
      const target = utc('2028-05-01T09:00:00');
      const rule = new RRuleTemporal({
        freq: 'MONTHLY',
        byDay: ['MO', 'TU', 'WE', 'TH', 'FR'],
        bySetPos: [-1],
        count: 128,
        dtstart,
        cache: false,
      });
      return {run: () => rule.next(target), expectedLength: 1};
    },
  },
  {
    id: 'secondly_occurs_on_100000',
    label: 'SECONDLY occursOn, COUNT 100k, first day',
    build: (RRuleTemporal) => {
      const dtstart = utc('2025-01-01T00:00:00');
      const rule = new RRuleTemporal({
        freq: 'SECONDLY',
        count: 100_000,
        maxIterations: 100_001,
        dtstart,
        cache: false,
      });
      return {run: () => rule.occursOn(dtstart.toPlainDate()), expectedLength: 1};
    },
  },
  {
    id: 'daily_exceptions_next_9000_rank_8500',
    label: 'DAILY RDATE/EXDATE next, COUNT 9k, rank 8.5k',
    build: (RRuleTemporal) => {
      const dtstart = utc('2000-01-01T09:00:00');
      const target = dtstart.add({days: 8_500});
      const rule = new RRuleTemporal({
        freq: 'DAILY',
        count: 9_000,
        dtstart,
        exDate: [target],
        rDate: [dtstart.add({days: 10_000})],
        cache: false,
      });
      return {run: () => rule.next(target, true), expectedLength: 1};
    },
  },
  {
    id: 'yearly_month_day_next_9000_rank_8500',
    label: 'YEARLY BYMONTH/BYMONTHDAY next, COUNT 9k, rank 8.5k',
    build: (RRuleTemporal) => {
      const dtstart = utc('2000-01-01T09:00:00');
      const target = utc('6250-03-15T09:00:00');
      const rule = new RRuleTemporal({
        freq: 'YEARLY',
        byMonth: [3, 9],
        byMonthDay: [15],
        count: 9_000,
        dtstart,
        cache: false,
      });
      return {run: () => rule.next(target, true), expectedLength: 1};
    },
  },
  {
    id: 'explicit_temporal_output_all_3600',
    label: 'SECONDLY all, COUNT 3.6k, explicit Temporal output',
    build: (RRuleTemporal) => {
      const dtstart = chicago('2025-01-01T00:00:00');
      const rule = new RRuleTemporal({
        temporal: Temporal,
        freq: 'SECONDLY',
        count: 3_600,
        dtstart,
        cache: false,
      });
      return {run: () => rule.all(), expectedLength: 3_600};
    },
  },
];

function formatMicroseconds(value) {
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)} ms`;
  return `${value.toFixed(value >= 100 ? 1 : 2)} us`;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const moduleUrl = pathToFileURL(path.join(config.packageRoot, 'dist/index.js')).href;
  const {RRuleTemporal} = await import(moduleUrl);
  const scenarios = config.scenario ? SCENARIOS.filter((scenario) => scenario.id === config.scenario) : SCENARIOS;
  if (scenarios.length === 0) throw new Error(`Unknown scenario: ${config.scenario}`);

  console.log('# COUNT-bound query benchmark');
  console.log('');
  console.log(`Package: ${config.packageRoot}`);
  console.log(`Node: ${process.version}`);
  console.log(
    `Warmup ${config.warmupMs} ms, sample ${config.sampleMs} ms, ${config.samples} samples; result epoch nanoseconds are checksummed.`,
  );
  console.log('');
  console.log('| Scenario | First call | Warm median | Warm min | Warm max |');
  console.log('| --- | ---: | ---: | ---: | ---: |');

  for (const scenario of scenarios) {
    const first = scenario.build(RRuleTemporal);
    const firstStart = performance.now();
    const firstLength = consume(first.run());
    const firstMicroseconds = (performance.now() - firstStart) * 1_000;
    if (firstLength !== first.expectedLength) {
      throw new Error(`${scenario.id} returned ${firstLength} values, expected ${first.expectedLength}`);
    }

    const warm = scenario.build(RRuleTemporal);
    const warmLength = consume(warm.run());
    if (warmLength !== warm.expectedLength) {
      throw new Error(`${scenario.id} returned ${warmLength} values, expected ${warm.expectedLength}`);
    }
    const stats = measure(warm.run, config);
    console.log(
      `| ${scenario.label} | ${formatMicroseconds(firstMicroseconds)} | ${formatMicroseconds(stats.median)} | ${formatMicroseconds(stats.min)} | ${formatMicroseconds(stats.max)} |`,
    );
  }

  // Keep the checksum observable without flooding benchmark output.
  console.log('');
  console.log(`Checksum: ${checksumSink.toString(16)}`);
}

await main();
