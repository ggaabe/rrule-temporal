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

### COUNT-bound queries

Measured September 3, 2026 on a MacBook Pro M2 Max with Node 25.2.1,
comparing the exact `v2.2.2` tag (`6be2251`) with this post-v2.2.2 candidate.
The table reports warmed median time per call from seven 300 ms samples after
a 250 ms warmup; lower is better. Both builds used the same harness.

| Scenario | v2.2.2 | Candidate | Speedup |
| --- | ---: | ---: | ---: |
| SECONDLY next, COUNT 128, rank 63 | 9.53 us | 2.33 us | 4.09x |
| SECONDLY next, COUNT 250k, rank 200k | 9.53 us | 2.47 us | 3.86x |
| DAILY next, COUNT 9k, rank 8.5k, UTC | 10.36 us | 3.11 us | 3.33x |
| DAILY previous, COUNT 9k, rank 8.5k, Chicago | 13.08 us | 3.41 us | 3.84x |
| DAILY weekdays next, COUNT 9k, distant, UTC | 11.01 us | 3.03 us | 3.63x |
| DAILY slots narrow between, COUNT 9k, UTC | 34.82 us | 19.49 us | 1.79x |
| WEEKLY M/W/F slots next, COUNT 9k, UTC | 10.58 us | 2.95 us | 3.59x |
| MONTHLY last weekday next, COUNT 9k, UTC | 31.34 us | 23.34 us | 1.34x |
| MONTHLY last weekday next, COUNT 128, rank 63 | 21.32 us | 14.03 us | 1.52x |
| SECONDLY `occursOn()`, COUNT 100k | 254.4 ms | 14.06 us | 18,094x |
| DAILY RDATE/EXDATE next, COUNT 9k, rank 8.5k | 52.4 ms | 3.68 us | 14,239x |
| YEARLY BYMONTH/BYMONTHDAY next, COUNT 9k, rank 8.5k | 382.2 ms | 9.86 us | 38,763x |
| SECONDLY `all()`, COUNT 3.6k, explicit Temporal output | 41.4 ms | 26.2 ms | 1.58x |

The named-zone cold call still includes lazy transition-table construction;
`query.mjs` prints cold timings and each sample's warm range when run locally.

### Full recurrence generation

Uncached median ops/s from the same MacBook Pro M2 Max with Node 25.2.1 using
the polyfill backend, `rrule` 2.8.1, and `rrule-rust` 3.1.1. Each result is the
median of five 200 ms samples after a 200 ms warmup; higher is better.

| Scenario | TZ | rrule-temporal median ops/s | rrule median ops/s | rrule-rust median ops/s |
| --- | --- | ---: | ---: | ---: |
| 30 daily occurrences | UTC | 17,699 | 14,844 | 173,855 |
| 30 daily occurrences | America/Chicago | 12,966 | 331 | 163,885 |
| Daily weekdays across many cycles | UTC | 998 | 742 | 10,597 |
| Daily weekdays across many cycles | America/Chicago | 747 | 18.9 | 9,700 |
| Daily time-slot expansion | UTC | 513 | 1,112 | 9,819 |
| Daily time-slot expansion | America/Chicago | 368 | 10.7 | 8,286 |
| 720 hourly occurrences | UTC | 703 | 727 | 6,283 |
| 720 hourly occurrences | America/Chicago | 505 | 13.8 | 6,181 |
| 1,440 minutely occurrences | UTC | 337 | 320 | 3,707 |
| 1,440 minutely occurrences | America/Chicago | 247 | 6.5 | 3,635 |
| 3,600 secondly occurrences | UTC | 123 | 127 | 1,614 |
| 3,600 secondly occurrences | America/Chicago | 96.6 | 2.7 | 1,624 |
| Weekly MO/WE/FR across many cycles | UTC | 531 | 1,054 | 7,957 |
| Weekly MO/WE/FR across many cycles | America/Chicago | 419 | 14.1 | 8,008 |
| Weekly day and time-slot expansion | UTC | 398 | 1,073 | 8,402 |
| Weekly day and time-slot expansion | America/Chicago | 343 | 11.0 | 7,775 |
| Monthly last weekday across 20 years | UTC | 1,151 | 1,090 | 10,286 |
| Monthly last weekday across 20 years | America/Chicago | 954 | 32.0 | 9,872 |
| Monthly first and last weekday across 20 years | UTC | 679 | 1,102 | 8,623 |
| Monthly first and last weekday across 20 years | America/Chicago | 532 | 23.7 | 7,642 |

Time-zone-aware iteration runs through an epoch-integer engine with a cached
per-zone offset table. In this run, named-zone generation was 22-40x faster
than `rrule`; UTC results were mixed, with expanded weekly cases still faster
in `rrule`.

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
from 2.0 to 26.5 million ops/s for `rrule-temporal`, 6,236 to 799,531 ops/s for
`rrule`, and 6.9 to 7.5 million ops/s for `rrule-rust`.
