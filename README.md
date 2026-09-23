# RRule Temporal

The first and only fully compliant Recurrence rule ([RFC-5545](https://www.rfc-editor.org/rfc/rfc5545.html)) processing JS/TS library built on the Temporal API, now with support for [RFC-7529](https://www.rfc-editor.org/rfc/rfc7529.html) (RSCALE / SKIP) for non-Gregorian calendars.
The library accepts the familiar `RRULE` format and returns
`Temporal.ZonedDateTime` instances for easy time‑zone aware scheduling.

See the [demo site](https://ggaabe.github.io/rrule-temporal/) for an interactive playground.

> RRule-temporal was created to advance the JS RRule ecosystem to use Temporal instead of Date, and to properly support cross-timezone and calendar aware recurrence rules, as per the suggestion of rrule.js contributors.
>https://github.com/jkbrzt/rrule/issues/450#issuecomment-1055853095

## Installation

```bash
npm install rrule-temporal
```

## Quick start

Parse an ICS snippet and enumerate the occurrences:

```typescript
import { RRuleTemporal } from "rrule-temporal";

const rule = new RRuleTemporal({
  rruleString: `DTSTART;TZID=UTC:20250101T090000\nRRULE:FREQ=DAILY;COUNT=3`
});

rule.all().forEach(dt => console.log(dt.toString()));
// 2025-01-01T09:00:00[UTC]
// 2025-01-02T09:00:00[UTC]
// 2025-01-03T09:00:00[UTC]

// Only the first 10 events
const firstTen = rule.all((_, i) => i < 10);
```

## Separating DTSTART and RRULE

Per RFC 5545, DTSTART and RRULE are separate properties. You can provide them separately:

```typescript
import { Temporal } from "temporal-polyfill";

const rule = new RRuleTemporal({
  rruleString: 'FREQ=DAILY;COUNT=5',
  dtstart: Temporal.ZonedDateTime.from('2025-01-01T09:00:00[UTC]')
});

const occurrences = rule.all();
```

This is useful when:
- Parsing iCalendar files where DTSTART and RRULE are on different lines
- Storing recurrence patterns separately from start dates in databases
- Building rules programmatically from user input

Note on `UNTIL` (RFC 5545): if `DTSTART` is a DATE-TIME with a `TZID` or UTC (`Z`),
`UNTIL` must be a DATE-TIME in UTC (trailing `Z`). If `DTSTART` is `VALUE=DATE`,
`UNTIL` must be a DATE (no time). Floating DATE-TIME rules (no `TZID`, no `Z`)
allow a floating `UNTIL`.
In default mode (`strict: false`), `UNTIL=YYYYMMDD` with a DATE-TIME `DTSTART`
is accepted for compatibility and treated as inclusive end-of-day in `DTSTART`'s
zone (converted to UTC when required). Set `strict: true` to reject it.

## Creating a rule with options

Instead of a full ICS string you can supply the recurrence parameters directly:

```typescript
import { Temporal } from "temporal-polyfill";

const rule = new RRuleTemporal({
  freq: "DAILY",
  interval: 2,
  count: 3,
  byHour: [9],
  byMinute: [15],
  tzid: "America/Chicago",
  dtstart: Temporal.ZonedDateTime.from({
    year: 2025, month: 4, day: 20,
    hour: 8, minute: 30,
    timeZone: "America/Chicago"
  })
});

rule.all().forEach(dt => console.log(dt.toString()));
```

### Manual options

When creating a rule with individual fields you can specify any of the options
below. These correspond to the recurrence rule parts defined in RFC&nbsp;5545:

| Option | Description |
| ------ | ----------- |
| `freq` | Recurrence frequency (`"YEARLY"`, `"MONTHLY"`, `"WEEKLY"`, `"DAILY"`, `"HOURLY"`, `"MINUTELY"`, `"SECONDLY"`). |
| `interval` | Interval between each occurrence of `freq`. |
| `count` | Total number of occurrences. |
| `until` | Last possible occurrence as `Temporal.ZonedDateTime`. |
| `byHour` | Hours to include (0&ndash;23). |
| `byMinute` | Minutes to include (0&ndash;59). |
| `bySecond` | Seconds to include (0&ndash;59). |
| `byDay` | List of weekday codes, e.g. `["MO", "WE", "FR"]`. |
| `byMonth` | Months of the year (1&ndash;12). |
| `byMonthDay` | Days of the month (1&ndash;31 or negative from end). |
| `byYearDay` | Days of the year (1&ndash;366 or negative from end). |
| `byWeekNo` | ISO week numbers (1&ndash;53 or negative from end). |
| `bySetPos` | Select n-th occurrence(s) after other filters. |
| `wkst` | Weekday on which the week starts (`"MO"`..`"SU"`). |
| `rDate` | Additional dates to include. |
| `exDate` | Exception dates to exclude. |
| `tzid` | Time zone identifier for interpreting dates. |
| `maxIterations` | Safety cap for advancing outer recurrence periods (defaults to 10,000). |
| `maxCandidateEvaluations` | Safety cap for candidate datetimes evaluated within recurrence periods (defaults to 1,000,000). |
| `includeDtstart` | Include `DTSTART` even if it does not match the pattern. |
| `strict` | Enforce RFC 5545 constraints strictly (defaults to false). |
| `temporal` | Optional Temporal namespace used for public output values and their inferred types. |
| `dtstart` | First occurrence as `Temporal.ZonedDateTime`. |

### Reusable Option Lists

The library also exports runtime option lists you can use to populate UI controls:

```typescript
import { allowedFreq, allowedWeekdays } from "rrule-temporal";

// ["YEARLY", "MONTHLY", ...]
console.log(allowedFreq);

// ["MO", "TU", ...]
console.log(allowedWeekdays);
```

## Querying occurrences

Use the provided methods to enumerate or search for occurrences:

```typescript
// Get all events within a window
const start = new Date(Date.UTC(2025, 3, 2, 0, 0));
const end = new Date(Date.UTC(2025, 3, 4, 5, 0));
const hits = rule.between(start, end, true);

// Next and previous occurrences
const next = rule.next();
const prev = rule.previous(new Date("2025-05-01T00:00Z"));
```

## Converting to human-readable text

The `toText` helper converts a rule into a human readable description.
`UNTIL` (and optional `DTSTART`) dates are locale-aware via `toLocaleString`.

```typescript
import { Temporal } from "temporal-polyfill";
import { RRuleTemporal } from "rrule-temporal";
import { toText } from "rrule-temporal/totext";

const rule = new RRuleTemporal({
  rruleString: `DTSTART;TZID=UTC:20250101T090000\nRRULE:FREQ=DAILY;COUNT=3`
});

rule.toString();
// "DTSTART;TZID=UTC:20250101T090000\nRRULE:FREQ=DAILY;COUNT=3"
toText(rule);             // uses the runtime locale, defaults to English
toText(rule, "es");      // Spanish description
toText(rule, "en", { includeDtstart: true }); // include "starting from <DTSTART date>"
toText(rule, "en", { excludeTzAbbreviation: true }); // omit timezone abbreviation in the output
toText(rule);
// "every day for 3 times"

const weekly = new RRuleTemporal({
  freq: "WEEKLY",
  byDay: ["SU"],
  byHour: [10],
  dtstart: Temporal.ZonedDateTime.from({
    year: 2025, month: 1, day: 1, hour: 10, timeZone: "UTC"
  })
});

toText(weekly);
// "every week on Sunday at 10 AM UTC"
toText(weekly, "es");
// "cada semana en domingo a las 10 AM UTC"
```

### `toText` supported languages

`toText()` currently ships translations for the following languages:

| Code | Language |
| ---- | -------- |
| en | English |
| es | Spanish |
| hi | Hindi |
| yue | Cantonese |
| ar | Arabic |
| he | Hebrew |
| zh | Mandarin |
| de | German |
| fr | French |

**NOTE:** At build time you can reduce bundle size by
defining the `TOTEXT_LANGS` environment variable (read from `process.env`),
e.g. `TOTEXT_LANGS=en,es,ar`. When this environment variable is unavailable
(such as in browser builds where `process` is undefined) all languages are
included by default.

### Invalid recurrence dates and times

Following RFC 5545, generated dates that do not exist are omitted and do not
consume `COUNT`. A monthly rule starting January 31 keeps the 31st, skipping
shorter months; a yearly rule starting February 29 skips non-leap years.
Generated local times inside a daylight-saving gap are also omitted before
`BYSETPOS` selects occurrences. Later periods retain the original calendar
fields, time, and `INTERVAL` phase.

Explicit `DTSTART` and `RDATE` values follow the separate RFC date-time
interpretation rules. `RSCALE` with `SKIP=BACKWARD` or `SKIP=FORWARD` can
explicitly adjust invalid calendar dates as described below.

### RFC 7529 (RSCALE / SKIP)

This library implements the iCalendar RSCALE and SKIP extensions described in RFC 7529 for defining recurrence rules in non‑Gregorian calendars and for controlling how invalid dates are handled.

### Supported Calendars

| Calendar | Description                      |
|--------------------|----------------------------------|
| GREGORIAN          | Gregorian calendar (default)     |
| CHINESE            | Chinese calendar                 |
| HEBREW             | Hebrew calendar                  |
| INDIAN             | Saka/Indian National Calendar    |

- Spec: RFC 7529 — Non‑Gregorian Recurrence Rules in iCalendar
  https://www.rfc-editor.org/rfc/rfc7529.html

What RSCALE does:
- Extends `RRULE` with `RSCALE=<calendar>` to choose the calendar used for recurrence generation while keeping DTSTART/RECURRENCE‑ID/RDATE/EXDATE in Gregorian.
- Interprets `BY*` parts (month, day, week, etc.) in the specified calendar when expanding occurrences, then converts the generated dates back to the requested time zone.

What SKIP does:
- Extends `RRULE` with `SKIP=OMIT|BACKWARD|FORWARD` (only when `RSCALE` is present).
- Controls how invalid dates produced by the rule are handled (e.g., Feb 29 in non‑leap years, or months that don’t have the desired day):
  - `OMIT` (default): drop the invalid occurrence.
  - `BACKWARD`: move to the previous valid day/month (e.g., Feb 28).
  - `FORWARD`: move to the next valid day/month (e.g., Mar 1).
- RFC 7529 defines the evaluation order; notably, SKIP may apply after `BYMONTH` (invalid month) and after `BYMONTHDAY` (invalid day). If SKIP changes the month and that leads to an invalid day‑of‑month, SKIP is re‑applied for the day step.

Leap months and BYMONTH:
- `BYMONTH` accepts leap‑month tokens with an `L` suffix (e.g., `5L`) under RSCALE. These are matched against the target calendar’s `monthCode` (e.g., Chinese `M06L`, Hebrew `M05L`).
- Example tokens:
  - Chinese: `5L` matches `monthCode=M05L` (leap 5th) or `M06L` depending on calendar system; we match by the numeric part + `L` via `monthCode`.
  - Hebrew: `5L` typically corresponds to Adar I (`monthCode=M05L`).
  - Numeric months without `L` (e.g., `5`) match the regular month (e.g., `monthCode=M05`).

Supported RSCALE coverage in this library:
- Frequencies: `YEARLY`, `MONTHLY`, `WEEKLY` with Chinese/Hebrew calendars.
- Constraints: `BYMONTH` (including leap tokens), `BYMONTHDAY`, `BYDAY` (weekday tokens; ordinal support at monthly/yearly levels), `BYYEARDAY`, `BYWEEKNO`, `BYSETPOS`.
- Sub‑daily (`DAILY`, `HOURLY`, `MINUTELY`) behavior:
  - The engine first filters eligible calendar days using `BYWEEKNO`, `BYYEARDAY`, `BYMONTH`, `BYMONTHDAY`, and simple `BYDAY` (weekday codes). Then it expands times via `BYHOUR`/`BYMINUTE`/`BYSECOND`.
  - For `HOURLY`/`MINUTELY`, INTERVAL alignment is based on elapsed real hours/minutes since `DTSTART`. Occurrences are kept when the elapsed units are multiples of `INTERVAL`.
  - Ordinal `BYDAY` (e.g., `1MO`, `-1SU`) is not interpreted at sub‑daily RSCALE levels; use `MONTHLY`/`YEARLY` for these.

Examples

Chinese New Year (1st day of 1st Chinese month), year over year from a Gregorian DTSTART:

```ics
DTSTART;VALUE=DATE:20130210
RRULE:RSCALE=CHINESE;FREQ=YEARLY
```

Hebrew New Year (Tishrei 1) — using BYYEARDAY=1 in Hebrew calendar:

```ics
DTSTART;TZID=UTC:20230916T090000
RRULE:RSCALE=HEBREW;FREQ=YEARLY;BYYEARDAY=1;BYHOUR=9
```

Feb 29 birthday — SKIP strategies:

```ics
DTSTART;TZID=UTC:20160229T120000
RRULE:RSCALE=GREGORIAN;FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;SKIP=OMIT
```

```ics
DTSTART;TZID=UTC:20160229T120000
RRULE:RSCALE=GREGORIAN;FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;SKIP=BACKWARD
```

```ics
DTSTART;TZID=UTC:20160229T120000
RRULE:RSCALE=GREGORIAN;FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;SKIP=FORWARD
```

Notes
- SKIP MUST NOT be present unless RSCALE is present (per RFC 7529).
- Default SKIP is `OMIT` when RSCALE is present.
- This library surfaces `RSCALE`/`SKIP` in `toText()` at the end of the description: e.g., `(RSCALE=HEBREW;SKIP=OMIT)`.

## API

| Method | Description |
| ------ | ----------- |
| `new RRuleTemporal(opts)` | Create a rule from an ICS snippet or manual options. |
| `all(iterator?)` | Return every occurrence. When the rule has no end the optional iterator is required. |
| `between(after, before, inclusive?)` | Occurrences within a time range. |
| `matches(date)` | Convenience helper: true if the exact instant is an occurrence (accepts `Date` or `Temporal.ZonedDateTime`). |
| `occursOn(date)` | Convenience helper: true if any occurrence falls on the given `Temporal.PlainDate` in the rule's time zone (date-only, ignores time). |
| `next(after?, inclusive?)` | Next occurrence after a given date. |
| `previous(before?, inclusive?)` | Previous occurrence before a date. |
| `toString()` | Convert the rule back into `DTSTART` and `RRULE` lines. |
| `toText(rule, locale?, options?)` | Human readable description (`en`, `es`, `hi`, `yue`, `ar`, `he`, `zh`, `fr`). Options: `{ includeDtstart?: boolean, excludeTzAbbreviation?: boolean }`. |
| `options()` | Return the normalized options object. |

## Benchmarks

### Queries without COUNT and sub-daily rules (v2.2.7)

Measured September 23, 2026 on an Apple M2 Max with Node 25.2.1 and the
bundled Temporal polyfill, comparing builds of `v2.2.6` and v2.2.7. Every
scenario returned identical results from both builds before timing. Query rows
are warm medians per call, generation rows are uncached `all()` calls with the
builds alternating each sample, and the last row is the first `all()` in a
fresh process (median of 15).

| Scenario | v2.2.6 | v2.2.7 | Speedup |
| --- | ---: | ---: | ---: |
| WEEKLY M/W/F `next()`, no end, UTC | 61.25 us | 0.69 us | 88.77x |
| WEEKLY M/W/F `next()`, 40 EXDATEs, no end, Chicago | 157.5 us | 1.33 us | 118x |
| WEEKLY M/W/F `between()` one month, no end, UTC | 36.22 us | 6.40 us | 5.66x |
| MONTHLY last Friday `next()`, no end, Chicago | 68.79 us | 1.39 us | 49.49x |
| YEARLY `previous()`, no end, Chicago | 79.11 us | 2.23 us | 35.48x |
| UTC WEEKLY M/W/F with RDATE/EXDATE, `all()`, COUNT 1,000 | 12.555 ms | 0.697 ms | 18.02x |
| HOURLY quarter hours, `all()`, COUNT 1,000, UTC | 3.967 ms | 1.073 ms | 3.70x |
| MINUTELY 9:00-16:45 quarter hours, `all()`, COUNT 1,000, Chicago | 4.516 ms | 2.034 ms | 2.22x |
| Chicago weekdays, first `all()` in a fresh process | 23.282 ms | 4.593 ms | 5.07x |

Queries on unbounded and UNTIL-bound rules, the usual calendar case, now visit
only the recurrence periods around the target instead of replaying the rule
through Temporal. Sub-daily rules with BYxxx parts run on a new integer engine,
which also fixes their INTERVAL cadence, and timezone tables are built from
Temporal's own transitions. In the same runs, the 13 COUNT-bound query
scenarios measured 0.93-2.81x and the 29 existing generation scenarios
0.93-1.18x; isolated re-runs of the lowest cases were within 2% of v2.2.6.

See [`benchmarks/README.md`](benchmarks/README.md) for every scenario, raw
measurements, and the reproduction commands.

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
| DAILY RDATE/EXDATE, COUNT 1,000 | 3.645 ms | 0.720 ms | 5.06x |

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

See [`benchmarks/README.md`](benchmarks/README.md) for all scenarios, raw
measurements, and the reproduction command.

### COUNT-bound queries

Measured September 24, 2026 on an Apple M2 Max with Node 25.2.1, comparing
the exact `v2.2.2` tag (`6be2251`) with v2.2.7. The table reports warmed median
time per call from seven 300 ms samples after a 250 ms warmup; lower is better.
Each build ran three times in alternating processes, and the table shows the
median run. Both builds returned identical results, and v2.2.7 uses the
production-minified bundle described below.

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

The named-zone cold call still includes lazy transition-table construction;
the query harness prints cold timings and each sample's warm range.

### Full recurrence generation

Uncached median ops/s for v2.2.7, measured September 23, 2026 on the same
Apple M2 Max with Node 25.2.1 using the polyfill backend and `rrule` 2.8.1.
Each result is the median of five 200 ms samples after a 200 ms warmup. The
production bundle is minified, which disables `temporal-polyfill`'s
development-only per-instance debug strings. The three-library comparison,
query methodology, and cached-mode summary live in
[`benchmarks/README.md`](benchmarks/README.md).

| Scenario | TZ | rrule-temporal median ops/s | rrule median ops/s | vs rrule |
| --- | --- | ---: | ---: | ---: |
| 30 daily occurrences | UTC | 80,644 | 15,625 | 5.16x |
| 30 daily occurrences | America/Chicago | 34,793 | 288 | 120.81x |
| Daily weekdays across many cycles | UTC | 4,015 | 747 | 5.37x |
| Daily weekdays across many cycles | America/Chicago | 2,021 | 19.4 | 104.18x |
| Daily time-slot expansion | UTC | 2,365 | 1,045 | 2.26x |
| Daily time-slot expansion | America/Chicago | 1,076 | 11.5 | 93.57x |
| 720 hourly occurrences | UTC | 2,744 | 705 | 3.89x |
| 720 hourly occurrences | America/Chicago | 1,382 | 13.4 | 103.13x |
| 1,440 minutely occurrences | UTC | 1,740 | 337 | 5.16x |
| 1,440 minutely occurrences | America/Chicago | 771 | 7.1 | 108.59x |
| 3,600 secondly occurrences | UTC | 532 | 129 | 4.12x |
| 3,600 secondly occurrences | America/Chicago | 296 | 2.9 | 102.07x |
| Weekly MO/WE/FR across many cycles | UTC | 2,842 | 1,116 | 2.55x |
| Weekly MO/WE/FR across many cycles | America/Chicago | 1,235 | 14.5 | 85.17x |
| Weekly day and time-slot expansion | UTC | 1,784 | 1,174 | 1.52x |
| Weekly day and time-slot expansion | America/Chicago | 987 | 11.2 | 88.12x |
| Monthly last weekday across 20 years | UTC | 2,252 | 1,027 | 2.19x |
| Monthly last weekday across 20 years | America/Chicago | 1,681 | 44.2 | 38.03x |
| Monthly first and last weekday across 20 years | UTC | 1,757 | 1,042 | 1.69x |
| Monthly first and last weekday across 20 years | America/Chicago | 1,068 | 23.1 | 46.23x |

Time-zone-aware rules iterate through an epoch-integer engine with a cached
per-zone offset table, so named-zone scenarios ran 38-121x faster than `rrule`
in this pass. Minifying the production bundle removes polyfill debug
instrumentation from occurrence materialization, making UTC generation
1.52-5.37x faster than `rrule` across every scenario. Earlier native-Temporal
measurements are retained in the detailed benchmark README but were not rerun
in this Node 25/polyfill pass. Repeated `all()` calls on the same rule instance
are served from an internal cache (opt out per rule with `cache: false`).

## Further examples

Enumerating weekdays within a month or rotating through months can be achieved
with the more advanced RFC&nbsp;5545 fields:

```typescript
// 2nd & 4th Fridays each month at midnight CT, first 6 occurrences
const ruleA = new RRuleTemporal({
  rruleString: `DTSTART;TZID=America/Chicago:20250325T000000\nRRULE:FREQ=MONTHLY;BYDAY=2FR,4FR;BYHOUR=0;BYMINUTE=0;COUNT=6`
});
ruleA.all().forEach(dt => console.log(dt.toString()));

// Rotate yearly through Jan, Jun and Dec at 09:00 UTC
const dtstart = Temporal.ZonedDateTime.from({
  year: 2025, month: 1, day: 10, hour: 9, minute: 0, timeZone: "UTC"
});
const ruleB = new RRuleTemporal({
  freq: "YEARLY",
  interval: 1,
  count: 4,
  byMonth: [1, 6, 12],
  byHour: [9],
  byMinute: [0],
  dtstart
});
ruleB.all().forEach(dt => console.log(dt.toString()));
```

### Working with extra and excluded dates

```typescript
import { Temporal } from "temporal-polyfill";

const start = Temporal.ZonedDateTime.from({
  year: 2025, month: 1, day: 1, hour: 12, timeZone: "UTC"
});
const ruleC = new RRuleTemporal({
  freq: "WEEKLY",
  count: 5,
  rDate: [start.add({ days: 1 })],           // add one extra day
  exDate: [start.add({ weeks: 2 })],         // skip the third week
  dtstart: start
});

// First five occurrences (with rDate/exDate accounted for)
ruleC.all((_, i) => i < 5).forEach(dt => console.log(dt.toString()));

// Occurrences within a window
const hits = ruleC.between(
  new Date("2025-01-01T00:00Z"),
  new Date("2025-02-01T00:00Z"),
  true
);
```

### Temporal implementations and interoperability

`rrule-temporal` uses the runtime's **native `Temporal`** when it exists
(Node 26+, Chrome 144+, Firefox 139+) and otherwise falls back to a bundled
copy of **`temporal-polyfill`** — no polyfill setup is required either way.
Inputs are accepted from **any** Temporal implementation: `dtstart`, `until`,
`rDate`, `exDate` and date filters are normalized internally, so you can pass
objects from `@js-temporal/polyfill`, `temporal-polyfill`, or native Temporal
interchangeably.

By default, returned occurrences come from the library's active implementation
(native when available, the bundled polyfill otherwise) and use
implementation-neutral `temporal-spec` types. To return instances from your
application's Temporal implementation with its exact inferred TypeScript
types, pass the optional `temporal` namespace:

```ts
import { Temporal } from "@js-temporal/polyfill";
import { RRuleTemporal } from "rrule-temporal";

const rule = new RRuleTemporal({
  temporal: Temporal,
  freq: "WEEKLY",
  count: 4,
  dtstart: Temporal.ZonedDateTime.from(
    "2030-05-05T10:00[America/Chicago]"
  ),
});

const occurrence = rule.next(); // Temporal.ZonedDateTime | null
const date = occurrence?.toPlainDate(); // Temporal.PlainDate | undefined
```

The selected implementation is used for values returned by `all()`,
`between()`, `next()`, `previous()`, iterator callbacks, `options()`, and
rules created with `with()`. Recurrence calculations still use the optimized
active implementation internally. Omitting `temporal` preserves the default
behavior.

Returned values from different implementations are fully spec-shaped but do
not satisfy `instanceof` checks against each other's classes. If a rule was
created without `temporal`, you can still re-hydrate individual results:

```ts
import { Temporal as AppTemporal } from "@js-temporal/polyfill";

const rawOccurrences = existingRule.all();
const appOccurrences = rawOccurrences.map((zdt) =>
  AppTemporal.ZonedDateTime.from(zdt.toString())
);
```

#### Why `.toString()`?

`Temporal.*.from()` accepts ISO 8601 strings (including bracketed time-zone
annotations), so calling `toString()` sidesteps the internal-slot branding
that makes objects from different implementations incompatible.

#### Nanosecond precision variant

```ts
const appOccurrences = rawOccurrences.map((zdt) =>
  AppTemporal.ZonedDateTime.fromEpochNanoseconds(zdt.epochNanoseconds)
);
```

Both approaches preserve the original calendar, time-zone and nanosecond accuracy.

#### Non-Gregorian RSCALE rules

RFC 7529 `RSCALE` rules (Chinese, Hebrew, Indian) always compute calendar
math with the bundled polyfill, even when native Temporal is active:
implementations disagree on non-ISO calendar details (for example V8 numbers
Chinese calendar years in a continuous era), and recurrence results must not
change with the runtime.

## Sponsor

If this library saves you time, sponsorship helps keep it maintained.

> This library is sponsored by [PostalForm 💌](https://postalform.com/?utm_source=github&utm_medium=readme&utm_campaign=rrule-temporal) — upload a PDF and we print + mail it via USPS (no printer or stamps needed). The only mailing platform for AI Agents via MCP, and the easiest one for humans!
