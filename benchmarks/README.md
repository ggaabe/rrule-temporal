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
- `720 hourly occurrences`
- `1,440 minutely occurrences`
- `Weekly MO/WE/FR across many cycles`
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

Profile only `rrule-temporal` on a single scenario:

```bash
npm run profile:temporal -- --scenario monthly_last_weekday_240 --tzid UTC --iterations 20
```

## Latest Results

Uncached median ops/s from the latest run on a MacBook Pro M2 Max (Node 25,
`rrule-temporal` running on its bundled `temporal-polyfill` backend):

| Scenario | TZ | rrule-temporal median ops/s | rrule median ops/s | rrule-rust median ops/s |
| --- | --- | ---: | ---: | ---: |
| 30 daily occurrences | UTC | 19,443 | 15,825 | 172,889 |
| 30 daily occurrences | America/Chicago | 13,525 | 347 | 169,396 |
| Daily weekdays across many cycles | UTC | 997 | 759 | 10,749 |
| Daily weekdays across many cycles | America/Chicago | 751 | 17.9 | 9,638 |
| 720 hourly occurrences | UTC | 713 | 653 | 6,796 |
| 720 hourly occurrences | America/Chicago | 502 | 14.1 | 6,444 |
| 1,440 minutely occurrences | UTC | 343 | 333 | 4,005 |
| 1,440 minutely occurrences | America/Chicago | 259 | 6.6 | 3,880 |
| Weekly MO/WE/FR across many cycles | UTC | 632 | 1,068 | 8,975 |
| Weekly MO/WE/FR across many cycles | America/Chicago | 471 | 13.1 | 8,252 |
| Monthly last weekday across 20 years | UTC | 1,120 | 1,010 | 11,003 |
| Monthly last weekday across 20 years | America/Chicago | 980 | 36.7 | 9,877 |
| Monthly first and last weekday across 20 years | UTC | 723 | 1,277 | 8,581 |
| Monthly first and last weekday across 20 years | America/Chicago | 562 | 22.2 | 7,735 |

Time-zone-aware iteration now runs through an epoch-integer engine with a
cached per-zone offset table, so the historical UTC-vs-named-zone gap is gone
(e.g. monthly last weekday in Chicago went from 45.5 to 980 ops/s).

On runtimes with native Temporal (Node 26+), occurrence materialization is
much cheaper. rrule-temporal alone, same scenarios (ops/s = 1000 / ms-per-call):

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
cache (disable per rule with `cache: false`); cached rows in the full report
run at tens of millions of ops/s for every library that supports caching.
