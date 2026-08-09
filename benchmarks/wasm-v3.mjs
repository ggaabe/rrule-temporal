import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';

import {RRuleTemporal} from '../dist/index.js';

const DEFAULTS = {sampleMs: 250, samples: 5};
const MS_PER_DAY = 86_400_000;
let sink = 0n;

function parseArgs(argv) {
  const config = {...DEFAULTS};
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token?.startsWith('--')) continue;
    const [key, inlineValue] = token.slice(2).split('=');
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue == null) index += 1;
    if (key === 'sample-ms') config.sampleMs = Number(value);
    if (key === 'samples') config.samples = Number(value);
  }
  return config;
}

function selectEngine(engine) {
  globalThis.__RRULE_TEMPORAL_FORCE_WASM__ = engine === 'wasm';
  globalThis.__RRULE_TEMPORAL_DISABLE_WASM__ = engine === 'js';
}

function consume(value) {
  const dates = Array.isArray(value) ? value : value ? [value] : [];
  let checksum = BigInt(dates.length);
  for (const date of dates) checksum = (checksum * 1_000_003n) ^ date.epochNanoseconds;
  sink ^= checksum;
  return dates;
}

function timedSample(fn, durationMs) {
  let iterations = 0;
  const start = performance.now();
  let now = start;
  do {
    consume(fn());
    iterations += 1;
    now = performance.now();
  } while (now - start < durationMs || iterations < 5);
  return (now - start) / iterations;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measurePair(jsFn, wasmFn, config) {
  selectEngine('js');
  consume(jsFn());
  selectEngine('wasm');
  consume(wasmFn());

  const js = [];
  const wasm = [];
  for (let sample = 0; sample < config.samples; sample++) {
    const order = sample % 2 === 0 ? ['js', 'wasm'] : ['wasm', 'js'];
    for (const engine of order) {
      selectEngine(engine);
      const value = timedSample(engine === 'js' ? jsFn : wasmFn, config.sampleMs);
      (engine === 'js' ? js : wasm).push(value);
    }
  }
  return {jsMs: median(js), wasmMs: median(wasm)};
}

function sameResult(left, right) {
  const normalize = (value) =>
    (Array.isArray(value) ? value : value ? [value] : []).map((date) => `${date.epochNanoseconds}:${date.timeZoneId}`);
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function buildCases() {
  const cases = [];
  for (const definition of [
    {
      label: 'all(): monthly last weekday, 240 results',
      ics: 'DTSTART;TZID=UTC:20230221T235900\nRRULE:FREQ=MONTHLY;COUNT=240;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
    },
    {
      label: 'all(): monthly first + last weekday, 480 results',
      ics: 'DTSTART;TZID=UTC:20230221T235900\nRRULE:FREQ=MONTHLY;COUNT=480;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1,-1',
    },
  ]) {
    const jsRule = new RRuleTemporal({rruleString: definition.ics, cache: false});
    const wasmRule = new RRuleTemporal({rruleString: definition.ics, cache: false});
    cases.push({label: definition.label, jsFn: () => jsRule.all(), wasmFn: () => wasmRule.all()});
  }

  for (const timeZone of ['UTC', 'America/Chicago']) {
    const ics = `DTSTART;TZID=${timeZone}:20000101T090000\nRRULE:FREQ=DAILY;COUNT=9000`;
    const target = new Date(Date.UTC(2000, 0, 1, 15) + 8_500 * MS_PER_DAY);
    const end = new Date(target.getTime() + 2 * MS_PER_DAY);
    for (const operation of ['next', 'previous', 'between']) {
      const jsRule = new RRuleTemporal({rruleString: ics, cache: false});
      const wasmRule = new RRuleTemporal({rruleString: ics, cache: false});
      const invoke = (rule) => {
        if (operation === 'next') return rule.next(target);
        if (operation === 'previous') return rule.previous(target);
        return rule.between(target, end, true);
      };
      cases.push({
        label: `${operation}(): daily COUNT=9000 near #8500 (${timeZone})`,
        jsFn: () => invoke(jsRule),
        wasmFn: () => invoke(wasmRule),
      });
    }
  }
  return cases;
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  const rows = [];
  for (const benchmark of buildCases()) {
    selectEngine('js');
    const expected = benchmark.jsFn();
    selectEngine('wasm');
    const actual = benchmark.wasmFn();
    if (!sameResult(expected, actual)) throw new Error(`Engine mismatch: ${benchmark.label}`);
    rows.push({...benchmark, ...measurePair(benchmark.jsFn, benchmark.wasmFn, config)});
  }

  console.log('# rrule-temporal v3 WASM candidate');
  console.log('');
  console.log(`${process.version}; ${process.platform}/${process.arch}; ${cpus()[0]?.model ?? 'unknown CPU'}`);
  console.log('');
  console.log(
    `Warm steady-state; ${config.samples} interleaved samples of at least ${config.sampleMs} ms and 5 operations. Results are eagerly checksummed.`,
  );
  console.log('');
  console.log('| Public operation | Forced JS ms/op | Forced WASM ms/op | Speedup |');
  console.log('| --- | ---: | ---: | ---: |');
  for (const row of rows) {
    console.log(
      `| ${row.label} | ${row.jsMs.toFixed(3)} | ${row.wasmMs.toFixed(3)} | ${(row.jsMs / row.wasmMs).toFixed(1)}× |`,
    );
  }
  if (sink === 0x7fffffffffffffffn) console.log('unreachable checksum guard');
}

main();
