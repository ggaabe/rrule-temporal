import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpus} from 'node:os';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {fileURLToPath, pathToFileURL} from 'node:url';

// A new process per observation prevents either build from warming Intl,
// Temporal, or the other build's transition tables before its first call.
const scenarios = {
  daily30_chicago: 'DTSTART;TZID=America/Chicago:20230221T235900\nRRULE:FREQ=DAILY;COUNT=30',
  daily520_chicago: 'DTSTART;TZID=America/Chicago:20230221T235900\nRRULE:FREQ=DAILY;COUNT=520;BYDAY=MO,TU,WE,TH,FR',
  daily30_utc: 'DTSTART;TZID=UTC:20230221T235900\nRRULE:FREQ=DAILY;COUNT=30',
  monthly_slots_chicago:
    'DTSTART;TZID=America/Chicago:20230221T235900\nRRULE:FREQ=MONTHLY;COUNT=240;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9,17;BYSETPOS=1,-1',
};

function summarize(rows) {
  return Object.fromEntries(
    ['constructionMs', 'allMs', 'totalMs'].map((key) => {
      const values = rows.map((row) => row[key]).sort((a, b) => a - b);
      const middle = Math.floor(values.length / 2);
      return [
        key,
        {
          median: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
          min: values[0],
          max: values.at(-1),
        },
      ];
    }),
  );
}

if (process.argv[2] === '--worker') {
  const {packageRoot, id} = JSON.parse(process.argv[3]);
  const {RRuleTemporal} = await import(pathToFileURL(resolve(packageRoot, 'dist/index.js')).href);
  const begin = performance.now();
  const rule = new RRuleTemporal({rruleString: scenarios[id], cache: false});
  const constructed = performance.now();
  const result = rule.all();
  const finished = performance.now();
  process.stdout.write(
    JSON.stringify({
      constructionMs: constructed - begin,
      allMs: finished - constructed,
      totalMs: finished - begin,
      values: result.map((date) => date.toString()),
    }),
  );
} else {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
  if (!args['baseline-root']) throw new Error('Pass --baseline-root=/absolute/path/to/built/baseline');
  const trials = Number(args.trials ?? 15);
  if (!Number.isSafeInteger(trials) || trials <= 0) throw new Error('trials must be a positive integer');
  const roots = [
    resolve(args['baseline-root']),
    args['package-root'] ? resolve(args['package-root']) : fileURLToPath(new URL('..', import.meta.url)),
  ];
  console.log(
    JSON.stringify({node: process.version, hardware: cpus()[0]?.model, trials, isolatedProcessPerCall: true}),
  );
  for (const id of Object.keys(scenarios)) {
    if (args.filter && !id.includes(args.filter)) continue;
    const samples = [[], []];
    for (let trial = 0; trial < trials; trial++) {
      const values = [];
      for (const version of trial % 2 ? [1, 0] : [0, 1]) {
        const output = spawnSync(
          process.execPath,
          [
            fileURLToPath(import.meta.url),
            '--worker',
            JSON.stringify({
              packageRoot: roots[version],
              id,
            }),
          ],
          {encoding: 'utf8', timeout: 30_000},
        );
        if (output.error) throw output.error;
        if (output.status !== 0) throw new Error(output.stderr || `Worker exited with ${output.status}`);
        const {values: result, ...timings} = JSON.parse(output.stdout);
        values[version] = result;
        samples[version].push(timings);
      }
      assert.deepEqual(values[1], values[0], id);
    }
    console.log(JSON.stringify({id, samples, baseline: summarize(samples[0]), candidate: summarize(samples[1])}));
  }
}
