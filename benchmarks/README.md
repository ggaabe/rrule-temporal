# Benchmarks

This folder is an isolated benchmark project for comparing:

- `rrule-temporal`
- `rrule`
- `rrule-rust`

It benchmarks the same RFC 5545 strings across all three libraries and reports
median ops/sec, mean ops/sec, median microseconds per operation, and relative
speed versus `rrule-temporal`.

Included scenarios:

- `30 daily occurrences`
- `Daily weekdays across many cycles`
- `Daily time-slot expansion`
- `720 hourly occurrences`
- `1,440 minutely occurrences`
- `3,600 secondly occurrences`
- `Weekly MO/WE/FR across many cycles`
- `Weekly day and time-slot expansion`
- `Monthly last weekday across 20 years`
- `Monthly first and last weekday across 20 years`

Time zones:

- `UTC`
- `America/Chicago`

Run the full suite:

```bash
npm run benchmark
```

Run a quicker, noisier pass:

```bash
npm run benchmark:quick
```

Benchmark `next()`, `previous()`, and narrow `between()` queries against
distant COUNT-bound occurrences and on rules without COUNT:

```bash
npm run benchmark:query
```

The query suite includes COUNT 128, 9,000, 100,000, and 250,000; queries near
the beginning and deep into the recurrence; UTC and `America/Chicago`;
fixed-step, daily, daily BYDAY, expanded time-slot, weekly, monthly, Gregorian
yearly, RDATE/EXDATE, `occursOn()`, and explicit Temporal-output shapes.
Unbounded and UNTIL-bound rules, which calendar views usually query near the
present, cover weekly (including 40 EXDATEs), daily, monthly last-Friday,
yearly, and fixed-step HOURLY shapes. It reports both the first call
(including lazy query-plan construction) and warmed medians, and checksums
returned epoch nanoseconds so result production remains observable.

To compare another checkout or release build with the exact same harness:

```bash
node query.mjs --package-root=/absolute/path/to/built/package
```

Profile only `rrule-temporal` on a single scenario:

```bash
npm run profile:temporal -- --scenario monthly_last_weekday_240 --tzid UTC --iterations 20
```

## Latest Results

### Queries without COUNT and sub-daily rules (v2.2.7)

Measured September 23, 2026 on an Apple M2 Max with Node 25.2.1 and the
bundled Temporal polyfill, comparing a build of `v2.2.6` (`476c009`) with the
v2.2.7 implementation (`29a1369`). Every scenario returned identical results
from both builds before timing. These are local medians; the
[release measurements](results/v2.2.7-2026-09-23.json) include every run's
medians, sample ranges, fresh-process observations, and the source hash.

**Queries.** Unbounded and UNTIL-bound rules used to clone the rule at an
aligned start and replay it through the general engine on every call. They now
visit only the recurrence periods around the query, in integer time. The table
reports warm medians per call from `query.mjs`: seven 300 ms samples after a
250 ms warmup, with each build run three times in alternating processes and
the median run shown.

| Scenario | v2.2.6 | v2.2.7 | Speedup |
| --- | ---: | ---: | ---: |
| WEEKLY M/W/F next, no end, UTC | 61.25 us | 0.69 us | 88.77x |
| WEEKLY M/W/F next, 40 EXDATEs, no end, Chicago | 157.5 us | 1.33 us | 118x |
| WEEKLY M/W/F between one month, no end, UTC | 36.22 us | 6.40 us | 5.66x |
| WEEKLY M/W/F next, UNTIL 2030, UTC | 64.59 us | 0.89 us | 72.57x |
| DAILY between one month, no end, Chicago | 82.59 us | 35.89 us | 2.30x |
| MONTHLY last Friday next, no end, Chicago | 68.79 us | 1.39 us | 49.49x |
| YEARLY previous, no end, Chicago | 79.11 us | 2.23 us | 35.48x |
| HOURLY every 4 hours next, no end, UTC | 19.32 us | 0.61 us | 31.67x |

The 13 COUNT-bound scenarios measured 0.93-2.81x. UTC fixed-step and daily
queries gained from constructing UTC results directly: SECONDLY `next()` at
COUNT 128 went from 1.18 us to 0.42 us. The slowest case, Chicago DAILY
`previous()`, measured a 1.93 us median for both builds in five further
alternating runs.

**Generation.** Uncached `all()` from `utc.mjs`: seven samples of at least
300 ms after a 200 ms warmup, alternating the builds each sample. Sub-daily
rules with BYxxx parts now run on an integer engine that constructs only the
occurrences it emits, and UTC WEEKLY rules keep their fast path when
RDATE/EXDATE are present. Both builds return identical results for these
shapes. `MINUTELY;BYHOUR=9..16` alone is not compared because v2.2.6 skipped
09:00-09:58 after the first day.

| Scenario | TZ | v2.2.6 | v2.2.7 | Speedup |
| --- | --- | ---: | ---: | ---: |
| WEEKLY M/W/F with RDATE/EXDATE, COUNT 1,000 | UTC | 12.555 ms | 0.697 ms | 18.02x |
| HOURLY weekdays, COUNT 1,000 | UTC | 3.252 ms | 1.147 ms | 2.84x |
| HOURLY weekdays, COUNT 1,000 | America/Chicago | 3.818 ms | 1.918 ms | 1.99x |
| HOURLY quarter hours, COUNT 1,000 | UTC | 3.967 ms | 1.073 ms | 3.70x |
| HOURLY quarter hours, COUNT 1,000 | America/Chicago | 4.262 ms | 1.805 ms | 2.36x |
| MINUTELY 9:00-16:45 quarter hours, COUNT 1,000 | UTC | 3.964 ms | 1.299 ms | 3.05x |
| MINUTELY 9:00-16:45 quarter hours, COUNT 1,000 | America/Chicago | 4.516 ms | 2.034 ms | 2.22x |
| SECONDLY first minute of each hour, COUNT 1,000 | UTC | 2.845 ms | 1.082 ms | 2.63x |
| SECONDLY first minute of each hour, COUNT 1,000 | America/Chicago | 3.250 ms | 1.798 ms | 1.81x |

The 29 existing generation scenarios (9 targeted and 20 full-generation
controls) measured 0.93-1.18x in the same run. Isolated re-runs of those below
0.97x, in both baseline/candidate orientations, measured 0.98-1.05x;
`monthly_slots_1000` was about 2% slower in both.

**First call in a fresh process.** `cold.mjs` ran 15 trials per build, each in
a new process, so neither build could warm Intl, Temporal, or timezone tables
for the other. Timezone tables now come from Temporal's own transitions instead
of daily Intl probes.

| Scenario | v2.2.6 first `all()` | v2.2.7 first `all()` |
| --- | ---: | ---: |
| Chicago DAILY, COUNT 30 | 4.684 ms | 1.843 ms |
| Chicago weekdays, COUNT 520 | 23.282 ms | 4.593 ms |
| UTC DAILY, COUNT 30 | 0.317 ms | 0.366 ms |
| Chicago MONTHLY first/last time slots, COUNT 240 | 25.493 ms | 22.428 ms |

Rule construction, timed separately, was unchanged: about 13.5 ms for the first
Chicago rule in a process and 2.0 ms in UTC.

Build `v2.2.6` first, then run from the repository root:

```bash
npm --prefix benchmarks run benchmark:utc -- --baseline-root=/absolute/path/to/v2.2.6
npm --prefix benchmarks run benchmark:cold -- --baseline-root=/absolute/path/to/v2.2.6 --trials=15
node benchmarks/query.mjs --package-root=/absolute/path/to/v2.2.6 --warmup-ms=250 --sample-ms=300 --samples=7
node benchmarks/query.mjs --warmup-ms=250 --sample-ms=300 --samples=7
```

### Invalid-date and DST-gap audit (v2.2.6)

The [#140/#141 audit](../docs/optimization-audit-140-141.md) validates RFC
omission semantics with direct regressions and an independent calendar oracle.
Its [measurements](results/issues-140-141-2026-09-17.json) compare 29 unchanged
generation workloads with PR #142 on Node 25.2.1, using five alternating warm
samples. The Chicago DAILY exception workload measured 3.813 ms before and
1.354 ms after; other warm timings ranged from 1.43x faster to 1.13x slower.
These are local measurements, not universal performance guarantees.

### UTC generation improvements (v2.2.4)

Measured September 5, 2026 on an Apple M2 Max with Node 25.2.1 and the
bundled Temporal polyfill, comparing a build of `v2.2.3` (`474c88c`) with the
v2.2.4 implementation after the DST fix (`0274381`). These are uncached
`all()` calls: seven samples of at least 300 ms after a 200 ms warmup,
alternating baseline/candidate order each sample. Rule construction is outside
the timings. Every scenario's complete result was compared against the baseline
before timing. These are local medians; sample ranges are recorded with the raw
results, and timings vary with machine load.

| UTC scenario | v2.2.3 | v2.2.4 | Speedup |
| --- | ---: | ---: | ---: |
| YEARLY last weekday, COUNT 1,000 | 1,866.627 ms | 27.755 ms | 67.25x |
| YEARLY quarterly months / two month days, COUNT 1,000 | 22.255 ms | 2.046 ms | 10.88x |
| MONTHLY weekdays / four time slots, COUNT 1,000 | 6.402 ms | 1.192 ms | 5.37x |
| MONTHLY first/last weekday time slots, COUNT 240 | 20.788 ms | 0.825 ms | 25.20x |
| YEARLY dense time slots, BYSETPOS=1,-1, COUNT 2 | 1.903 ms | 0.028 ms | 67.75x |
| DAILY RDATE/EXDATE, COUNT 1,000 | 3.645 ms | 0.720 ms | 5.06x |
| SECONDLY RDATE/EXDATE, COUNT 3,600 | 4.731 ms | 2.450 ms | 1.93x |
| YEARLY last weekday, callback stops after 3 | 5.474 ms | 0.093 ms | 58.88x |

UTC monthly/yearly generation now selects calendar days and BYSETPOS ranks
using integers, then constructs only the Temporal candidates that the visitor
consumes. Simple UTC DAILY/HOURLY/MINUTELY/SECONDLY rules retain their fast
generators when RDATE/EXDATE are present; exceptions are applied afterward in
recurrence-set order. Unsupported shapes retain the general engine, including
expanded exception rules whose iteration limits differ.

The release passed all 1,167 tests on both Temporal backends, plus CI on
Node 20, 24, and 26. The timings above use the polyfill only. The general
calendar engine now restores DTSTART's time after DST gaps; this has a cost
in fallback cases. The Chicago DAILY exception control measured 3.960 ms
for v2.2.3 and 4.840 ms for v2.2.4, about 22% slower in this run.

The dense YEARLY case has over 22 million possible date/time combinations;
only its two selected candidates are constructed. Candidate-budget accounting
still includes the same logical forward/reverse visits as the general engine.
The callback case also remains lazy and stops before generating the remaining
years.

[Release measurements](results/utc-v2.2.4-2026-09-05.json) include medians,
sample ranges, first-call timings, and the exact source hash. First-call timings
exclude construction and are single observations, so warmed medians are the
repeatable comparison above. The [initial UTC measurements](results/utc-2026-09-05.json)
are retained separately; they preceded the DST fix.

Build the baseline checkout first, then run from the repository root:

```bash
npm --prefix benchmarks run benchmark:utc -- --baseline-root=/absolute/path/to/v2.2.3 --suite=targeted
```

Omit `--suite=targeted` to include the 20 existing full-generation controls.
Use `--filter=yearly` to select scenario IDs containing a substring, or
`--package-root=/absolute/path/to/candidate` to compare another candidate build.

### Earlier UTC-only regression follow-up

Before the DST fix, a follow-up on September 5 checked small timing differences
against v2.2.3 and the UTC optimization at `5696658`. These historical controls
do not include the subsequent DST changes in v2.2.4. Fifteen alternating pairs of
fresh Node 25.2.1 processes were used per scenario, so neither implementation
could pre-warm the other's Intl, Temporal, or timezone state. Complete outputs
matched in every pair. Medians for the first `all()` call were:

| Scenario | v2.2.3 | `5696658` (before DST fix) |
| --- | ---: | ---: |
| Chicago DAILY, COUNT 30 | 2.428 ms | 2.422 ms |
| Chicago weekdays, COUNT 520 | 6.925 ms | 6.907 ms |
| UTC DAILY, COUNT 30 | 0.388 ms | 0.403 ms |
| Chicago MONTHLY first/last time slots, COUNT 240 | 32.948 ms | 32.885 ms |

Named-zone first-call medians were within 0.3% of the baseline. Construction
was measured separately; construction plus first-call medians were within
1.1% for these named-zone cases. Longer paired warm runs did not reproduce
the earlier UTC daily/weekday/time-slot slowdowns. The short Chicago daily
case varied: three additional comparisons with each build warmed in a separate
process measured 6.4% slower, 1.8% slower, and 3.2% faster. This supports treating
the small differences as inconclusive timing variation, rather than claiming
an established regression or a precise zero-overhead guarantee.

No library changes were made during this follow-up. The discarded named-zone
exception optimization remains excluded. [Raw follow-up measurements](results/utc-regression-2026-09-05.json)
include each fresh-process observation and the warm-run samples.

To reproduce the fresh-process check with an already-built baseline:

```bash
npm --prefix benchmarks run benchmark:cold -- --baseline-root=/absolute/path/to/v2.2.3 --trials=15
```

Use `--filter=chicago` to restrict the scenarios. For longer paired warm runs:

```bash
node benchmarks/utc.mjs --baseline-root=/absolute/path/to/v2.2.3 --filter=daily_30 --warmup-ms=500 --sample-ms=500 --samples=11
```

### COUNT-bound queries

Measured September 24, 2026 on an Apple M2 Max with Node 25.2.1, comparing
the exact `v2.2.2` tag (`6be2251`) with v2.2.7. The table reports warmed median
time per call from seven 300 ms samples after a 250 ms warmup; lower is better.
Each build ran three times in alternating processes, and the table shows the
median run. Both builds returned identical results, and v2.2.7 uses the
production-minified bundle described below.
[Raw measurements](results/count-queries-2026-09-24.json) include every run's
median.

| Scenario | v2.2.2 | v2.2.7 | Speedup |
| --- | ---: | ---: | ---: |
| SECONDLY next, COUNT 128, rank 63 | 9.44 us | 0.49 us | 19.27x |
| SECONDLY next, COUNT 250k, rank 200k | 9.38 us | 0.52 us | 18.04x |
| DAILY next, COUNT 9k, rank 8.5k, UTC | 9.80 us | 1.11 us | 8.83x |
| DAILY previous, COUNT 9k, rank 8.5k, Chicago | 12.64 us | 2.39 us | 5.29x |
| DAILY weekdays next, COUNT 9k, distant, UTC | 10.00 us | 1.22 us | 8.20x |
| DAILY slots narrow between, COUNT 9k, UTC | 32.88 us | 5.86 us | 5.61x |
| WEEKLY M/W/F slots next, COUNT 9k, UTC | 10.58 us | 1.27 us | 8.33x |
| MONTHLY last weekday next, COUNT 9k, UTC | 31.55 us | 21.28 us | 1.48x |
| MONTHLY last weekday next, COUNT 128, rank 63 | 21.99 us | 11.70 us | 1.88x |
| SECONDLY `occursOn()`, COUNT 100k | 254.7 ms | 9.35 us | 27,241x |
| DAILY RDATE/EXDATE next, COUNT 9k, rank 8.5k | 53.0 ms | 1.61 us | 32,919x |
| YEARLY BYMONTH/BYMONTHDAY next, COUNT 9k, rank 8.5k | 388.9 ms | 7.41 us | 52,483x |
| SECONDLY `all()`, COUNT 3.6k, explicit Temporal output | 42.9 ms | 18.7 ms | 2.29x |

The v2.2.3 release measured the same scenarios on September 3, 2026, with
the same harness and settings:

| Scenario | v2.2.2 | v2.2.3 | Speedup |
| --- | ---: | ---: | ---: |
| SECONDLY next, COUNT 128, rank 63 | 9.53 us | 1.10 us | 8.66x |
| SECONDLY next, COUNT 250k, rank 200k | 9.53 us | 1.15 us | 8.29x |
| DAILY next, COUNT 9k, rank 8.5k, UTC | 10.36 us | 1.68 us | 6.17x |
| DAILY previous, COUNT 9k, rank 8.5k, Chicago | 13.08 us | 2.25 us | 5.81x |
| DAILY weekdays next, COUNT 9k, distant, UTC | 11.01 us | 1.93 us | 5.70x |
| DAILY slots narrow between, COUNT 9k, UTC | 34.82 us | 9.70 us | 3.59x |
| WEEKLY M/W/F slots next, COUNT 9k, UTC | 10.58 us | 1.78 us | 5.94x |
| MONTHLY last weekday next, COUNT 9k, UTC | 31.34 us | 22.88 us | 1.37x |
| MONTHLY last weekday next, COUNT 128, rank 63 | 21.32 us | 12.14 us | 1.76x |
| SECONDLY `occursOn()`, COUNT 100k | 254.4 ms | 7.84 us | 32,449x |
| DAILY RDATE/EXDATE next, COUNT 9k, rank 8.5k | 52.4 ms | 2.20 us | 23,818x |
| YEARLY BYMONTH/BYMONTHDAY next, COUNT 9k, rank 8.5k | 382.2 ms | 7.94 us | 48,136x |
| SECONDLY `all()`, COUNT 3.6k, explicit Temporal output | 41.4 ms | 19.6 ms | 2.11x |

The named-zone cold call still includes lazy transition-table construction;
`query.mjs` prints cold timings and each sample's warm range when run locally.

### Full recurrence generation

Measured September 23, 2026 with v2.2.7: uncached median ops/s on the same
Apple M2 Max with Node 25.2.1, using the polyfill backend, `rrule` 2.8.1, and
`rrule-rust` 3.1.1. Each result is the median of five 200 ms samples after a
200 ms warmup; higher is better. The production bundle is minified, which
disables `temporal-polyfill`'s development-only per-instance debug strings.

| Scenario | TZ | rrule-temporal median ops/s | rrule median ops/s | rrule-rust median ops/s |
| --- | --- | ---: | ---: | ---: |
| 30 daily occurrences | UTC | 80,644 | 15,625 | 181,503 |
| 30 daily occurrences | America/Chicago | 34,793 | 288 | 163,250 |
| Daily weekdays across many cycles | UTC | 4,015 | 747 | 10,264 |
| Daily weekdays across many cycles | America/Chicago | 2,021 | 19.4 | 10,024 |
| Daily time-slot expansion | UTC | 2,365 | 1,045 | 10,665 |
| Daily time-slot expansion | America/Chicago | 1,076 | 11.5 | 8,972 |
| 720 hourly occurrences | UTC | 2,744 | 705 | 7,310 |
| 720 hourly occurrences | America/Chicago | 1,382 | 13.4 | 6,724 |
| 1,440 minutely occurrences | UTC | 1,740 | 337 | 4,156 |
| 1,440 minutely occurrences | America/Chicago | 771 | 7.1 | 3,273 |
| 3,600 secondly occurrences | UTC | 532 | 129 | 1,742 |
| 3,600 secondly occurrences | America/Chicago | 296 | 2.9 | 1,656 |
| Weekly MO/WE/FR across many cycles | UTC | 2,842 | 1,116 | 9,346 |
| Weekly MO/WE/FR across many cycles | America/Chicago | 1,235 | 14.5 | 8,558 |
| Weekly day and time-slot expansion | UTC | 1,784 | 1,174 | 9,073 |
| Weekly day and time-slot expansion | America/Chicago | 987 | 11.2 | 8,396 |
| Monthly last weekday across 20 years | UTC | 2,252 | 1,027 | 11,233 |
| Monthly last weekday across 20 years | America/Chicago | 1,681 | 44.2 | 10,139 |
| Monthly first and last weekday across 20 years | UTC | 1,757 | 1,042 | 8,479 |
| Monthly first and last weekday across 20 years | America/Chicago | 1,068 | 23.1 | 7,983 |

Time-zone-aware iteration runs through an epoch-integer engine with a cached
per-zone offset table. In this run, named-zone generation was 38-121x faster
than `rrule`; UTC generation was 1.52-5.37x faster across every scenario.

Earlier Node 26+ native-Temporal reference measurements were not rerun in this
pass. They remain useful for showing how much cheaper occurrence
materialization becomes when Temporal is provided by the runtime
(ops/s = 1000 / ms-per-call):

| Scenario | TZ | rrule-temporal on Node 26 (native Temporal) |
| --- | --- | ---: |
| 30 daily occurrences | America/Chicago | 50,000 |
| Daily weekdays across many cycles | America/Chicago | 2,809 |
| 720 hourly occurrences | America/Chicago | 2,000 |
| 1,440 minutely occurrences | America/Chicago | 1,170 |
| Weekly MO/WE/FR across many cycles | America/Chicago | 1,969 |
| Monthly last weekday across 20 years | America/Chicago | 2,198 |
| Monthly first and last weekday across 20 years | America/Chicago | 1,582 |

Repeated `all()` calls on the same rule instance are served from an internal
cache (disable per rule with `cache: false`). In this run, cached medians ranged
from 1.5 to 25.7 million ops/s for `rrule-temporal`, 6,965 to 809,723 ops/s for
`rrule`, and 6.1 to 8.1 million ops/s for `rrule-rust`.
