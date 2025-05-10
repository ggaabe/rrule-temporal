# rrule-temporal

Recurrence rule (RFC 5545) processing using Temporal PlainDate/PlainDateTime.

This was created to advance the rrule library to use Temporal, and to provide a more modern API, as the original rrule library is [not maintained anymore](https://github.com/jkbrzt/rrule/issues/615). Maintainers suggested to use Temporal instead of Date:

https://github.com/jkbrzt/rrule/issues/450#issuecomment-1055853095

## Demo Site:

https://ggaabe.github.io/rrule-temporal/

## Installation

```bash
npm install rrule-temporal
```

## Usage

## 1. Parsing an ICS snippet

Parse a full DTSTART/RRULE snippet and reproduce it or enumerate all occurrences:

```typescript
// Daily at 17:00 America/Chicago, 5 total occurrences
const ics = `
DTSTART;TZID=America/Chicago:20250320T170000
RRULE:FREQ=DAILY;BYHOUR=17;BYMINUTE=0;COUNT=5
`.trim();

const rule = new RRuleTemporal({ rruleString: ics });

// toString() outputs the original DTSTART and RRULE line:
console.log(rule.toString());
/*
DTSTART;TZID=America/Chicago:20250320T170000
RRULE:FREQ=DAILY;BYHOUR=17;BYMINUTE=0;COUNT=5
*/

// all() returns an array of Temporal.ZonedDateTime:
const dates = rule.all();
dates.forEach(dt => console.log(dt.toString()));
// [
//   "2025-03-20T17:00:00[America/Chicago]",
//   "2025-03-21T17:00:00[America/Chicago]",
//   // … total of 5 days
// ]
```

## 2. Enumerate occurrences in a time window

```typescript

  const ics = `DTSTART;TZID=America/Chicago:20250401T000000
RRULE:FREQ=DAILY;BYHOUR=0;BYMINUTE=0;UNTIL=20250405T000000Z`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });
  const start = new Date(Date.UTC(2025, 3, 2, 0, 0)); // Apr 2 00:00 UTC
  // after:
  const end = new Date(
    // 2025-04-04 00:00 America/Chicago → 05:00 UTC
    Date.UTC(2025, 3, 4, 5, 0, 0)
  );

  test("between returns occurrences in window inclusive/exclusive", () => {
    const arrExc = rule.between(start, end, false);
    expect(arrExc.map((d) => d.day)).toEqual([2, 3]);

    const arrInc = rule.between(start, end, true);
    expect(arrInc.map((d) => d.day)).toEqual([2, 3, 4]);
  });
``` 

## 3. Manual options

Build a rule from explicit options, overriding start time and interval:

```typescript
// Every 2 days at 09:15 America/Chicago, 3 occurrences, starting 2025-04-20 08:30 CT
const dtstart = Temporal.ZonedDateTime.from({
  year: 2025, month: 4, day: 20,
  hour: 8, minute: 30,
  timeZone: "America/Chicago"
});

const rule = new RRuleTemporal({
  freq:     "DAILY",
  interval: 2,
  count:    3,
  byHour:   [9],
  byMinute: [15],
  dtstart,
  tzid:     "America/Chicago",
});

rule.all().forEach((dt, i) => {
  console.log(i, dt.toString());
});
// 0 "2025-04-20T09:15:00[America/Chicago]"
// 1 "2025-04-22T09:15:00[America/Chicago]"
// 2 "2025-04-24T09:15:00[America/Chicago]"
```

## 4. Windowed queries with between()

Fetch occurrences in a given time window, with inclusive/exclusive end:
```typescript
// Daily at 00:00 CT until 2025-04-05T00:00Z inclusive
const ics2 = `
DTSTART;TZID=America/Chicago:20250401T000000
RRULE:FREQ=DAILY;BYHOUR=0;BYMINUTE=0;UNTIL=20250405T000000Z
`.trim();

const rule2 = new RRuleTemporal({ rruleString: ics2 });

// Define UTC window: from 2025-04-02 00:00 UTC through 2025-04-04 05:00 UTC
const start = new Date(Date.UTC(2025, 3, 2, 0, 0));
const end   = new Date(Date.UTC(2025, 3, 4, 5, 0));

console.log(rule2.between(start, end, false).map(d => d.toString()));
// [
//   "2025-04-02T00:00:00[America/Chicago]",
//   "2025-04-03T00:00:00[America/Chicago]"
// ]

console.log(rule2.between(start, end, true).map(d => d.toString()));
// adds "2025-04-04T00:00:00[America/Chicago]"
```

## 5. Next/previous occurrence

Find the next or previous occurrence relative to any date:

```typescript
// Monthly at 12:00 America/Chicago, 12 total
const ics3 = `
DTSTART;TZID=America/Chicago:20250101T120000
RRULE:FREQ=MONTHLY;BYHOUR=12;BYMINUTE=0;COUNT=12
`.trim();

const rule3 = new RRuleTemporal({ rruleString: ics3 });

// Next occurrence after the current time in Central Time
// Where hour and minute conditions are met
const firstOccurrence = rule.next(
  Temporal.Now.zonedDateTimeISO("America/Chicago")
);

// Next after 2025-03-15T00:00:00Z
const nxt = rule3.next(new Date("2025-03-15T00:00:00Z"));
console.log(nxt?.toString()); // "2025-04-01T12:00:00[UTC]"

// Previous on or before 2025-06-05T00:00:00Z
const prev = rule3.previous(new Date("2025-06-05T00:00:00Z"), true);
console.log(prev?.toString()); // "2025-06-01T12:00:00[UTC]"
```

## 6. toString()

Convert the rule back to an ICS string:

```typescript
console.log(rule.toString());
// DTSTART;TZID=America/Chicago:20250320T170000
// RRULE:FREQ=DAILY;BYHOUR=17;BYMINUTE=0;COUNT=5
```

## 7. BYDAY/BYMONTH examples:

```typescript
// 2nd & 4th Fridays each month at 00:00 CT, first 6 occurrences
const ics4 = `
DTSTART;TZID=America/Chicago:20250325T000000
RRULE:FREQ=MONTHLY;BYDAY=2FR,4FR;BYHOUR=0;BYMINUTE=0;COUNT=6
`.trim();

const rule4 = new RRuleTemporal({ rruleString: ics4 });
rule4.all().forEach(dt => console.log(dt.toString()));
// [
//   "2025-04-11T00:00:00[America/Chicago]",
//   "2025-04-25T00:00:00[America/Chicago]",
//   "2025-05-09T00:00:00[America/Chicago]",
//   …
]

// Yearly rotated through Jan, Jun, Dec at 09:00 UTC, 4 occurrences
const dtstart5 = Temporal.ZonedDateTime.from({
  year: 2025, month: 1, day: 10, hour: 9, minute: 0, timeZone: "UTC"
});
const rule5 = new RRuleTemporal({
  freq:     "YEARLY",
  interval: 1,
  count:    4,
  byMonth:  [1, 6, 12],
  byHour:   [9],
  byMinute: [0],
  dtstart:  dtstart5
});
rule5.all().forEach(dt => console.log(dt.toString()));
// [
//   "2025-01-10T09:00:00[UTC]",
//   "2026-06-10T09:00:00[UTC]",
//   "2027-12-10T09:00:00[UTC]",
//   "2028-01-10T09:00:00[UTC]"
// ]
```

