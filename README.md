# RRule Temporal

> This library is sponsored by [PostalForm 💌](https://postalform.com/?utm_source=github&utm_medium=readme&utm_campaign=rrule-temporal) — upload a PDF and we print + mail it via USPS (no printer or stamps needed). The only mailing platform for AI Agents via MCP, and the easiest one for humans!

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
import { Temporal } from "@js-temporal/polyfill";

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
| `strict` | Enforce RFC 5545 constraints strictly (defaults to false). |
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

## Converting to human-readable text

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
| `toText(rule, locale?)` | Human readable description (`en`, `es`, `hi`, `yue`, `ar`, `he`, `zh`, `fr`). |
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

### Converting between **@js-temporal/polyfill** and **temporal-polyfill**

`rrule-temporal` ships with **`@js-temporal/polyfill`** and therefore returns `Temporal` objects that are from that implementation. If the rest of your codebase (or a third-party package) relies on the lighter **`temporal-polyfill`** package or a native Temporal implementation, those objects will **not** satisfy `instanceof` checks in your app.
This snippet shows how to re-hydrate each recurrence result into the polyfill your project expects.

```ts
// rrule-temporal (and its internals) use @js-temporal/polyfill
import { Temporal as RRTTemporal } from "@js-temporal/polyfill";
// your application using temporal-polyfill or native Temporal
import { Temporal as AppTemporal } from "temporal-polyfill";

import { RRuleTemporal } from "rrule-temporal";

/** Weekly rule that fires 4 times starting 5 May 2025, 10 AM America/Chicago. */
const rule = new RRuleTemporal({
  freq: "WEEKLY",
  count: 4,
  dtstart: RRTTemporal.ZonedDateTime.from(
    "2025-05-05T10:00[America/Chicago]"
  ),
});

// Occurrences are ZonedDateTime instances from @js-temporal/polyfill
const rawOccurrences = rule.all();

/** Convert each ZonedDateTime to temporal-polyfill ZonedDateTime. */
const appOccurrences = rawOccurrences.map((zdt) =>
  AppTemporal.ZonedDateTime.from(zdt.toString())
);

// …now `appOccurrences` can be passed anywhere that expects temporal-polyfill in your app
```

#### Why `.toString()`?

`Temporal.*.from()` accepts ISO 8601 strings (including bracketed time-zone annotations), so calling `toString()` sidesteps the internal-slot branding that makes polyfill objects incompatible.

#### Nanosecond precision variant

```ts
const appOccurrences = rawOccurrences.map((zdt) =>
  AppTemporal.ZonedDateTime.fromEpochNanoseconds(zdt.epochNanoseconds)
);
```

Both approaches preserve the original calendar, time-zone and nanosecond accuracy.

## Sponsor

If this library saves you time, sponsorship helps keep it maintained.

Primary sponsor: [PostalForm](https://postalform.com/?utm_source=github&utm_medium=readme&utm_campaign=rrule-temporal)
