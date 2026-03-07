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

Uncached median ops/s from the latest run on a MacBook Pro M2 Max:

| Scenario | TZ | rrule-temporal | rrule | rrule-rust |
| --- | --- | ---: | ---: | ---: |
| 30 daily occurrences | UTC | 24,322 | 16,783 | 179,506 |
| 30 daily occurrences | America/Chicago | 2,081 | 363 | 170,777 |
| Daily weekdays across many cycles | UTC | 1,903 | 736 | 10,622 |
| Daily weekdays across many cycles | America/Chicago | 67.1 | 19.3 | 10,021 |
| 720 hourly occurrences | UTC | 1,366 | 677 | 7,305 |
| 720 hourly occurrences | America/Chicago | 108 | 13.7 | 6,963 |
| 1,440 minutely occurrences | UTC | 751 | 317 | 4,212 |
| 1,440 minutely occurrences | America/Chicago | 134 | 7.1 | 4,096 |
| Weekly MO/WE/FR across many cycles | UTC | 1,275 | 1,045 | 9,282 |
| Weekly MO/WE/FR across many cycles | America/Chicago | 62.4 | 14.3 | 8,472 |
| Monthly last weekday across 20 years | UTC | 67.8 | 1,087 | 11,181 |
| Monthly last weekday across 20 years | America/Chicago | 39.4 | 39.6 | 10,043 |
| Monthly first and last weekday across 20 years | UTC | 44.0 | 1,271 | 8,700 |
| Monthly first and last weekday across 20 years | America/Chicago | 34.6 | 25.3 | 7,797 |
