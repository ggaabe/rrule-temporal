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

| Scenario | TZ | rrule-temporal median ops/s | rrule median ops/s | rrule-rust median ops/s |
| --- | --- | ---: | ---: | ---: |
| 30 daily occurrences | UTC | 29,275 | 16,762 | 183,628 |
| 30 daily occurrences | America/Chicago | 2,067 | 364 | 174,182 |
| Daily weekdays across many cycles | UTC | 1,894 | 766 | 10,652 |
| Daily weekdays across many cycles | America/Chicago | 64.9 | 18.9 | 9,992 |
| 720 hourly occurrences | UTC | 1,499 | 701 | 7,304 |
| 720 hourly occurrences | America/Chicago | 104 | 14.1 | 6,958 |
| 1,440 minutely occurrences | UTC | 751 | 325 | 4,175 |
| 1,440 minutely occurrences | America/Chicago | 145 | 7.1 | 4,037 |
| Weekly MO/WE/FR across many cycles | UTC | 1,179 | 1,053 | 9,432 |
| Weekly MO/WE/FR across many cycles | America/Chicago | 64.4 | 14.6 | 8,560 |
| Monthly last weekday across 20 years | UTC | 1,953 | 948 | 10,493 |
| Monthly last weekday across 20 years | America/Chicago | 45.5 | 39.4 | 10,147 |
| Monthly first and last weekday across 20 years | UTC | 1,378 | 1,202 | 8,628 |
| Monthly first and last weekday across 20 years | America/Chicago | 40.0 | 24.2 | 7,612 |
