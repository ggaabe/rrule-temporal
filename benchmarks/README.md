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

Profile only `rrule-temporal` on a single scenario:

```bash
npm run profile:temporal -- --scenario monthly_last_weekday_240 --tzid UTC --iterations 20
```

## Latest Results

Uncached median ops/s from the latest run on a MacBook Pro M2 Max (Node 25,
`rrule-temporal` running on its bundled `temporal-polyfill` backend):

| Scenario | TZ | rrule-temporal median ops/s | rrule median ops/s | rrule-rust median ops/s |
| --- | --- | ---: | ---: | ---: |
| 30 daily occurrences | UTC | 22,308 | 17,932 | 196,403 |
| 30 daily occurrences | America/Chicago | 15,358 | 384 | 181,821 |
| Daily weekdays across many cycles | UTC | 1,192 | 830 | 11,449 |
| Daily weekdays across many cycles | America/Chicago | 873 | 20.9 | 10,629 |
| Daily time-slot expansion | UTC | 611 | 1,199 | 11,060 |
| Daily time-slot expansion | America/Chicago | 448 | 11.7 | 10,059 |
| 720 hourly occurrences | UTC | 817 | 757 | 7,311 |
| 720 hourly occurrences | America/Chicago | 588 | 13.9 | 6,842 |
| 1,440 minutely occurrences | UTC | 392 | 364 | 4,200 |
| 1,440 minutely occurrences | America/Chicago | 287 | 7.4 | 4,045 |
| 3,600 secondly occurrences | UTC | 152 | 144 | 1,773 |
| 3,600 secondly occurrences | America/Chicago | 113 | 2.9 | 1,734 |
| Weekly MO/WE/FR across many cycles | UTC | 662 | 1,137 | 9,579 |
| Weekly MO/WE/FR across many cycles | America/Chicago | 493 | 14.7 | 8,653 |
| Weekly day and time-slot expansion | UTC | 502 | 1,207 | 9,382 |
| Weekly day and time-slot expansion | America/Chicago | 394 | 12.2 | 8,744 |
| Monthly last weekday across 20 years | UTC | 1,314 | 1,119 | 11,539 |
| Monthly last weekday across 20 years | America/Chicago | 1,043 | 41.7 | 10,322 |
| Monthly first and last weekday across 20 years | UTC | 804 | 1,326 | 9,015 |
| Monthly first and last weekday across 20 years | America/Chicago | 622 | 24.9 | 8,162 |

Time-zone-aware iteration now runs through an epoch-integer engine with a
cached per-zone offset table, so the historical UTC-vs-named-zone gap is gone
(e.g. monthly last weekday in Chicago went from 45.5 to 1,043 ops/s).

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
cache (disable per rule with `cache: false`); cached rows in the full report
run at tens of millions of ops/s for every library that supports caching.
