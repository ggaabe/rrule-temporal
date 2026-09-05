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
distant COUNT-bound occurrences:

```bash
npm run benchmark:query
```

The query suite includes COUNT 128, 9,000, 100,000, and 250,000; queries near
the beginning and deep into the recurrence; UTC and `America/Chicago`;
fixed-step, daily, daily BYDAY, expanded time-slot, weekly, monthly, Gregorian
yearly, RDATE/EXDATE, `occursOn()`, and explicit Temporal-output shapes. It
reports both the first call (including lazy query-plan construction) and warmed
medians, and checksums returned epoch nanoseconds so result production remains
observable.

To compare another checkout or release build with the exact same harness:

```bash
node query.mjs --package-root=/absolute/path/to/built/package
```

Profile only `rrule-temporal` on a single scenario:

```bash
npm run profile:temporal -- --scenario monthly_last_weekday_240 --tzid UTC --iterations 20
```

## Latest Results

### UTC generation improvements (unreleased)

Measured September 5, 2026 on an Apple M2 Max with Node 25.2.1 and the
bundled Temporal polyfill, comparing a build of `v2.2.3` (`474c88c`) with the
working-tree implementation. These are uncached `all()` calls: seven samples
of at least 300 ms after a 200 ms warmup, alternating baseline/candidate order
each sample. Rule construction is outside the timings. Every scenario's complete
result was compared against the baseline before timing.

| UTC scenario | v2.2.3 | Unreleased | Speedup |
| --- | ---: | ---: | ---: |
| YEARLY last weekday, COUNT 1,000 | 1,413.491 ms | 22.500 ms | 62.82x |
| YEARLY quarterly months / two month days, COUNT 1,000 | 18.116 ms | 1.505 ms | 12.04x |
| MONTHLY weekdays / four time slots, COUNT 1,000 | 5.478 ms | 1.050 ms | 5.22x |
| MONTHLY first/last weekday time slots, COUNT 240 | 15.748 ms | 0.793 ms | 19.86x |
| YEARLY dense time slots, BYSETPOS=1,-1, COUNT 2 | 1.544 ms | 0.024 ms | 64.95x |
| DAILY RDATE/EXDATE, COUNT 1,000 | 3.134 ms | 0.621 ms | 5.05x |
| SECONDLY RDATE/EXDATE, COUNT 3,600 | 4.451 ms | 2.309 ms | 1.93x |
| YEARLY last weekday, callback stops after 3 | 5.457 ms | 0.089 ms | 61.12x |

UTC monthly/yearly generation now selects calendar days and BYSETPOS ranks
using integers, then constructs only the Temporal candidates that the visitor
consumes. Simple UTC DAILY/HOURLY/MINUTELY/SECONDLY rules retain their fast
generators when RDATE/EXDATE are present; exceptions are applied afterward in
recurrence-set order. Unsupported shapes retain the general engine, including
expanded exception rules whose iteration limits differ.

The initial 20 UTC/Chicago full-generation controls and 13 query benchmarks
were broadly unchanged; the largest measured slowdown in that sweep was about
4%. Follow-up measurements did not reproduce a consistent named-zone
regression. The full 1,138-test suite passed on Node 25.2.1 with the polyfill
and Node 26.7.0 with native Temporal. These timings use the polyfill only.

The dense YEARLY case has over 22 million possible date/time combinations;
only its two selected candidates are constructed. Candidate-budget accounting
still includes the same logical forward/reverse visits as the general engine.
The callback case also remains lazy and stops before generating the remaining
years. The named-zone exception experiment was left out because transition-table
setup made one-shot calls slower; its control remains in the harness.

[Raw measurements](results/utc-2026-09-05.json) include medians, sample ranges,
and first-call timings. First-call timings exclude construction and are single
observations, so warmed medians are the repeatable comparison above.

Build the baseline checkout first, then run from the repository root:

```bash
npm --prefix benchmarks run benchmark:utc -- --baseline-root=/absolute/path/to/v2.2.3 --suite=targeted
```

Omit `--suite=targeted` to include the 20 existing full-generation controls.
Use `--filter=yearly` to select scenario IDs containing a substring, or
`--package-root=/absolute/path/to/candidate` to compare another candidate build.

### Regression follow-up

A follow-up on September 5 checked the small timing differences against the
same v2.2.3 build and unchanged candidate source. Fifteen alternating pairs of
fresh Node 25.2.1 processes were used per scenario, so neither implementation
could pre-warm the other's Intl, Temporal, or timezone state. Complete outputs
matched in every pair. Medians for the first `all()` call were:

| Scenario | v2.2.3 | Unreleased |
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

Measured September 3, 2026 on a MacBook Pro M2 Max with Node 25.2.1,
comparing the exact `v2.2.2` tag (`6be2251`) with `v2.2.3`. The table reports
warmed median time per call from seven 300 ms samples after a 250 ms warmup;
lower is better. Both builds used the same harness, and version 2.2.3 uses the
production-minified bundle described below.

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

Uncached median ops/s from the same MacBook Pro M2 Max with Node 25.2.1 using
the polyfill backend, `rrule` 2.8.1, and `rrule-rust` 3.1.1. Each result is the
median of five 200 ms samples after a 200 ms warmup; higher is better. The
production bundle is minified, which disables `temporal-polyfill`'s
development-only per-instance debug strings.

| Scenario | TZ | rrule-temporal median ops/s | rrule median ops/s | rrule-rust median ops/s |
| --- | --- | ---: | ---: | ---: |
| 30 daily occurrences | UTC | 75,108 | 15,200 | 169,722 |
| 30 daily occurrences | America/Chicago | 32,314 | 342 | 156,222 |
| Daily weekdays across many cycles | UTC | 3,889 | 739 | 10,080 |
| Daily weekdays across many cycles | America/Chicago | 1,784 | 18.5 | 9,912 |
| Daily time-slot expansion | UTC | 2,159 | 1,152 | 10,104 |
| Daily time-slot expansion | America/Chicago | 949 | 11.0 | 8,705 |
| 720 hourly occurrences | UTC | 2,862 | 729 | 6,789 |
| 720 hourly occurrences | America/Chicago | 1,207 | 14.1 | 5,494 |
| 1,440 minutely occurrences | UTC | 1,351 | 337 | 3,988 |
| 1,440 minutely occurrences | America/Chicago | 639 | 6.0 | 3,885 |
| 3,600 secondly occurrences | UTC | 534 | 126 | 1,662 |
| 3,600 secondly occurrences | America/Chicago | 245 | 2.6 | 1,624 |
| Weekly MO/WE/FR across many cycles | UTC | 2,193 | 1,095 | 8,987 |
| Weekly MO/WE/FR across many cycles | America/Chicago | 979 | 14.6 | 8,261 |
| Weekly day and time-slot expansion | UTC | 1,698 | 1,201 | 8,819 |
| Weekly day and time-slot expansion | America/Chicago | 834 | 11.0 | 8,218 |
| Monthly last weekday across 20 years | UTC | 2,042 | 1,023 | 10,754 |
| Monthly last weekday across 20 years | America/Chicago | 1,549 | 36.7 | 9,728 |
| Monthly first and last weekday across 20 years | UTC | 1,499 | 1,179 | 8,554 |
| Monthly first and last weekday across 20 years | America/Chicago | 1,015 | 22.0 | 7,550 |

Time-zone-aware iteration runs through an epoch-integer engine with a cached
per-zone offset table. In this run, named-zone generation was 42-107x faster
than `rrule`; UTC generation was 1.27-5.26x faster across every scenario.

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
from 1.5 to 25.5 million ops/s for `rrule-temporal`, 6,827 to 781,271 ops/s for
`rrule`, and 6.3 to 7.5 million ops/s for `rrule-rust`.
