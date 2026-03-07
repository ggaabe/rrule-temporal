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
- `Pacific/Kiritimati`

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
