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

The query suite includes COUNT 128, 9,000, and 250,000; queries near the
beginning and deep into the recurrence; UTC and `America/Chicago`; fixed-step,
daily, daily BYDAY, expanded time-slot, weekly, and monthly shapes. It reports
both the first call (including lazy query-plan construction) and warmed medians,
and checksums returned epoch nanoseconds so result production remains observable.

To compare another checkout or release build with the exact same harness:

```bash
node query.mjs --package-root=/absolute/path/to/built/package
```

Profile only `rrule-temporal` on a single scenario:

```bash
npm run profile:temporal -- --scenario monthly_last_weekday_240 --tzid UTC --iterations 20
```

## Latest Results

COUNT-bound query results from the same MacBook Pro M2 Max / Node 25 run,
comparing a detached `v2.0.3` build with the `v2.1.0` candidate. Times are
milliseconds per call; both builds used the same harness and result checksum.

| Scenario | v2.0.3 first | v2.1.0 first | First speedup | v2.0.3 warm | v2.1.0 warm | Warm speedup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SECONDLY next, COUNT 128, rank 63 | 3.10 | 0.584 | 5.3x | 0.242 | 0.00951 | 25.5x |
| SECONDLY next, COUNT 250k, rank 200k | 886.0 | 0.137 | 6,481x | 806.3 | 0.00950 | 84,874x |
| DAILY next, COUNT 9k, rank 8.5k, UTC | 50.6 | 0.291 | 174x | 47.6 | 0.00984 | 4,837x |
| DAILY previous, COUNT 9k, rank 8.5k, Chicago | 60.2 | 7.59 | 7.9x | 53.4 | 0.01250 | 4,272x |
| DAILY weekdays next, COUNT 9k, distant, UTC | 68.7 | 0.0895 | 768x | 61.4 | 0.01010 | 6,079x |
| DAILY slots narrow between, COUNT 9k, UTC | 32.6 | 0.326 | 100x | 30.4 | 0.03466 | 877x |
| WEEKLY M/W/F slots next, COUNT 9k, UTC | 122.5 | 0.353 | 347x | 81.8 | 0.01037 | 7,888x |
| MONTHLY last weekday next, COUNT 9k, UTC | 197.8 | 8.54 | 23.2x | 186.3 | 0.03191 | 5,838x |
| MONTHLY last weekday next, COUNT 128, rank 63 | 1.49 | 0.321 | 4.6x | 1.40 | 0.02155 | 65.0x |

The named-zone first call includes lazy transition-table construction. Its
warmed path reuses both that table and the immutable rule's numeric query plan.

Uncached median ops/s from the latest run on a MacBook Pro M2 Max (Node 25,
`rrule-temporal` v2.1.0 running on its bundled `temporal-polyfill` backend).
Each result is the median of five 200 ms samples after a 200 ms warmup:

| Scenario | TZ | rrule-temporal median ops/s | rrule median ops/s | rrule-rust median ops/s |
| --- | --- | ---: | ---: | ---: |
| 30 daily occurrences | UTC | 18,847 | 14,581 | 174,900 |
| 30 daily occurrences | America/Chicago | 12,796 | 328 | 164,890 |
| Daily weekdays across many cycles | UTC | 961 | 713 | 10,519 |
| Daily weekdays across many cycles | America/Chicago | 723 | 18.4 | 9,853 |
| Daily time-slot expansion | UTC | 488 | 1,006 | 10,067 |
| Daily time-slot expansion | America/Chicago | 371 | 10.7 | 9,462 |
| 720 hourly occurrences | UTC | 685 | 723 | 6,786 |
| 720 hourly occurrences | America/Chicago | 491 | 13.2 | 6,383 |
| 1,440 minutely occurrences | UTC | 326 | 332 | 3,922 |
| 1,440 minutely occurrences | America/Chicago | 245 | 6.8 | 3,837 |
| 3,600 secondly occurrences | UTC | 121 | 130 | 1,637 |
| 3,600 secondly occurrences | America/Chicago | 101 | 2.8 | 1,619 |
| Weekly MO/WE/FR across many cycles | UTC | 538 | 1,126 | 8,968 |
| Weekly MO/WE/FR across many cycles | America/Chicago | 418 | 13.8 | 8,259 |
| Weekly day and time-slot expansion | UTC | 426 | 1,197 | 8,914 |
| Weekly day and time-slot expansion | America/Chicago | 343 | 11.7 | 8,245 |
| Monthly last weekday across 20 years | UTC | 1,114 | 1,146 | 10,864 |
| Monthly last weekday across 20 years | America/Chicago | 921 | 43.5 | 9,839 |
| Monthly first and last weekday across 20 years | UTC | 664 | 1,287 | 8,461 |
| Monthly first and last weekday across 20 years | America/Chicago | 553 | 23.4 | 7,720 |

Time-zone-aware iteration now runs through an epoch-integer engine with a
cached per-zone offset table, so the historical UTC-vs-named-zone gap is gone
(e.g. monthly last weekday in Chicago went from 45.5 to 921 ops/s).

On runtimes with native Temporal (Node 26+), occurrence materialization is
much cheaper. rrule-temporal alone, the earlier core scenarios
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
from about 6,800 ops/s for `rrule` on the largest second-level set to 32.5
million ops/s for `rrule-temporal` on 30 daily occurrences; `rrule-rust`
clustered around 7.5–7.8 million ops/s.
