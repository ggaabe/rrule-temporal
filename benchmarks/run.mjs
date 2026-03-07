import { performance } from 'node:perf_hooks';

import RRulePkg from 'rrule';
import * as Rust from 'rrule-rust';

import { RRuleTemporal } from '../dist/index.js';
import { SCENARIOS, TIMEZONES } from './scenarios.mjs';

const { rrulestr } = RRulePkg;

const DEFAULTS = {
  warmupMs: 200,
  sampleMs: 200,
  samples: 5,
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token?.startsWith('--')) continue;

    const [rawKey, rawValue] = token.slice(2).split('=');
    const key = rawKey?.trim();
    const value = rawValue ?? argv[i + 1];

    if (!key || value == null) continue;
    if (rawValue == null) i += 1;

    if (key === 'warmup-ms') args.warmupMs = Number(value);
    if (key === 'sample-ms') args.sampleMs = Number(value);
    if (key === 'samples') args.samples = Number(value);
  }

  return args;
}

function assertCount(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} returned ${actual} occurrences, expected ${expected}`);
  }
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const midpoint = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

  return {
    mean,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    stddev: Math.sqrt(variance),
  };
}

function measure(fn, config) {
  const warmupEnd = performance.now() + config.warmupMs;
  while (performance.now() < warmupEnd) fn();

  const opsPerSec = [];
  const nsPerOp = [];

  for (let sample = 0; sample < config.samples; sample++) {
    let iterations = 0;
    const start = performance.now();
    let now = start;

    do {
      fn();
      iterations += 1;
      now = performance.now();
    } while (now - start < config.sampleMs);

    const elapsedMs = now - start;
    opsPerSec.push(iterations / (elapsedMs / 1000));
    nsPerOp.push((elapsedMs * 1e6) / iterations);
  }

  return {
    opsPerSec: summarize(opsPerSec),
    nsPerOp: summarize(nsPerOp),
  };
}

function buildBenchmarks(ics, expectedCount) {
  const temporal = new RRuleTemporal({ rruleString: ics });

  const nodeNoCache = rrulestr(ics, { forceset: true, cache: false });
  const nodeCached = rrulestr(ics, { forceset: true, cache: true });
  nodeCached.all();

  const rustNoCache = Rust.RRuleSet.fromString(ics);
  rustNoCache.cache.disable();

  const rustCached = Rust.RRuleSet.fromString(ics);
  rustCached.all();

  return [
    {
      library: 'rrule-temporal',
      cache: 'n/a',
      fn: () => assertCount('rrule-temporal', temporal.all().length, expectedCount),
    },
    {
      library: 'rrule',
      cache: 'off',
      fn: () => assertCount('rrule', nodeNoCache.all().length, expectedCount),
    },
    {
      library: 'rrule',
      cache: 'on',
      fn: () => assertCount('rrule (cache)', nodeCached.all().length, expectedCount),
    },
    {
      library: 'rrule-rust',
      cache: 'off',
      fn: () => assertCount('rrule-rust', rustNoCache.all().length, expectedCount),
    },
    {
      library: 'rrule-rust',
      cache: 'on',
      fn: () => assertCount('rrule-rust (cache)', rustCached.all().length, expectedCount),
    },
  ];
}

function formatNumber(value, fractionDigits = 0) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value);
}

function formatOps(value) {
  return formatNumber(value, value >= 100 ? 0 : 1);
}

function formatUs(value) {
  return formatNumber(value / 1e3, value / 1e3 >= 100 ? 0 : 1);
}

function printSuiteTable(title, rows) {
  const baseline = rows.find((row) => row.library === 'rrule-temporal');
  const baselineMedian = baseline?.stats.opsPerSec.median ?? null;

  console.log(`\n## ${title}`);
  console.log('');
  console.log('| Library | Cache | Median ops/s | Mean ops/s | Median us/op | vs rrule-temporal |');
  console.log('| --- | --- | ---: | ---: | ---: | ---: |');

  for (const row of rows) {
    const median = row.stats.opsPerSec.median;
    const relative = baselineMedian ? `${formatNumber(median / baselineMedian, 2)}x` : 'n/a';
    console.log(
      `| ${row.library} | ${row.cache} | ${formatOps(median)} | ${formatOps(
        row.stats.opsPerSec.mean,
      )} | ${formatUs(row.stats.nsPerOp.median)} | ${relative} |`,
    );
  }
}

function printSummary(results) {
  console.log(`# RRULE Benchmark Comparison`);
  console.log('');
  console.log(
    `Config: warmup ${results.config.warmupMs} ms, sample ${results.config.sampleMs} ms, samples ${results.config.samples}.`,
  );
  console.log('');
  console.log(
    `rrule-temporal has no internal occurrence cache, so its cache column is marked \`n/a\`. Cached variants for \`rrule\` and \`rrule-rust\` are pre-warmed before timing.`,
  );

  for (const suite of results.suites) {
    printSuiteTable(
      `${suite.scenario.label} | ${suite.timezone.label}`,
      suite.rows,
    );
  }
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  const suites = [];

  for (const scenario of SCENARIOS) {
    for (const timezone of TIMEZONES) {
      const ics = scenario.buildIcs(timezone.id);
      const rows = [];

      for (const benchmark of buildBenchmarks(ics, scenario.expectedCount)) {
        rows.push({
          ...benchmark,
          stats: measure(benchmark.fn, config),
        });
      }

      suites.push({
        scenario,
        timezone,
        rows,
      });
    }
  }

  printSummary({ config, suites });
}

main();
