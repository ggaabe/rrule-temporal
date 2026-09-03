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
