import { performance } from 'node:perf_hooks';

import { RRuleTemporal } from '../dist/index.js';

import { findScenario, findTimezone } from './scenarios.mjs';

function parseArgs(argv) {
  const args = {
    scenario: 'monthly_last_weekday_240',
    tzid: 'UTC',
    iterations: 20,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token?.startsWith('--')) continue;

    const [rawKey, rawValue] = token.slice(2).split('=');
    const key = rawKey?.trim();
    const value = rawValue ?? argv[i + 1];

    if (!key || value == null) continue;
    if (rawValue == null) i += 1;

    if (key === 'scenario') args.scenario = value;
    if (key === 'tzid') args.tzid = value;
    if (key === 'iterations') args.iterations = Number(value);
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scenario = findScenario(args.scenario);
  const timezone = findTimezone(args.tzid);

  if (!scenario) {
    throw new Error(`Unknown scenario: ${args.scenario}`);
  }

  if (!timezone) {
    throw new Error(`Unknown timezone: ${args.tzid}`);
  }

  const ics = scenario.buildIcs(timezone.id);
  const rule = new RRuleTemporal({ rruleString: ics });

  const warm = rule.all();
  if (warm.length !== scenario.expectedCount) {
    throw new Error(`Warmup returned ${warm.length}, expected ${scenario.expectedCount}`);
  }

  const start = performance.now();
  for (let i = 0; i < args.iterations; i++) {
    const result = rule.all();
    if (result.length !== scenario.expectedCount) {
      throw new Error(`Iteration ${i} returned ${result.length}, expected ${scenario.expectedCount}`);
    }
  }
  const elapsedMs = performance.now() - start;

  console.log(
    JSON.stringify(
      {
        scenario: scenario.id,
        timezone: timezone.id,
        iterations: args.iterations,
        elapsedMs,
        avgMsPerIteration: elapsedMs / args.iterations,
      },
      null,
      2,
    ),
  );
}

main();
