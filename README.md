# rrule-temporal

The first and only fully compliant Recurrence rule (RFC&nbsp;5545) processing JS/TS library built on the Temporal API.
The library accepts the familiar `RRULE` format and returns
`Temporal.ZonedDateTime` instances for easy time‑zone aware scheduling.

See the [demo site](https://ggaabe.github.io/rrule-temporal/) for an interactive playground.

> This library was created to advance the rrule library to use Temporal, and to provide a more modern API, as the original rrule library is [not maintained anymore](https://github.com/jkbrzt/rrule/issues/615). Maintainers suggested to use Temporal instead of Date:
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

## Creating a rule with options

Instead of a full ICS string you can supply the recurrence parameters directly:

```typescript
import { Temporal } from "@js-temporal/polyfill";

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
| `maxIterations` | Safety cap when generating occurrences. |
| `includeDtstart` | Include `DTSTART` even if it does not match the pattern. |
| `dtstart` | First occurrence as `Temporal.ZonedDateTime`. |

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

## Converting back to text

The `toText` helper converts a rule into a human readable description.

```typescript
import { Temporal } from "@js-temporal/polyfill";
import { RRuleTemporal } from "rrule-temporal";
import { toText } from "rrule-temporal/totext";

const rule = new RRuleTemporal({
  rruleString: `DTSTART;TZID=UTC:20250101T090000\nRRULE:FREQ=DAILY;COUNT=3`
});

rule.toString();
// "DTSTART;TZID=UTC:20250101T090000\nRRULE:FREQ=DAILY;COUNT=3"
toText(rule);             // uses the runtime locale, defaults to English
toText(rule, "es");      // Spanish description
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

`toText()` currently ships translations for **English (`en`)**, 
**Spanish (`es`)**, **Hindi (`hi`)**, **Cantonese (`yue`)**, **Arabic (`ar`)**, 
**Hebrew (`he`)** and **Mandarin (`zh`)**. At build time you can reduce bundle size by
defining the `TOTEXT_LANGS` environment variable, e.g. `TOTEXT_LANGS=en,es,ar`.

### `toText` supported languages

| Code | Language |
| ---- | -------- |
| en | English |
| es | Spanish |
| hi | Hindi |
| yue | Cantonese |
| ar | Arabic |
| he | Hebrew |
| zh | Mandarin |

## API

| Method | Description |
| ------ | ----------- |
| `new RRuleTemporal(opts)` | Create a rule from an ICS snippet or manual options. |
| `all(iterator?)` | Return every occurrence. When the rule has no end the optional iterator is required. |
| `between(after, before, inclusive?)` | Occurrences within a time range. |
| `next(after?, inclusive?)` | Next occurrence after a given date. |
| `previous(before?, inclusive?)` | Previous occurrence before a date. |
| `toString()` | Convert the rule back into `DTSTART` and `RRULE` lines. |
| `toText(rule, locale?)` | Human readable description (`en`, `es`, `hi`, `yue`, `ar`, `he`, `zh`). |
| `options()` | Return the normalized options object. |

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
import { Temporal } from "@js-temporal/polyfill";

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
