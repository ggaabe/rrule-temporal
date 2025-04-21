# rrule-temporal

Recurrence rule (RFC 5545) processing using Temporal PlainDate/PlainDateTime.

This was created to advance the rrule library to use Temporal, and to provide a more modern API, as the original rrule library is [not maintained anymore](https://github.com/jkbrzt/rrule/issues/615). Maintainers suggested to use Temporal instead of Date:

https://github.com/jkbrzt/rrule/issues/450#issuecomment-1055853095

## Installation

```bash
npm install rrule-temporal
```

## Usage

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