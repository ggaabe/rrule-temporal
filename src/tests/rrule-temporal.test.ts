import { RRuleTemporal } from "../index";
import { Temporal } from "@js-temporal/polyfill";

describe("RRuleTemporal - ICS snippet parsing", () => {
  const ics = `DTSTART;TZID=America/Chicago:20250320T170000
RRULE:FREQ=DAILY;BYHOUR=17;BYMINUTE=0;COUNT=5`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });

  test("toString reproduces original ICS (excluding COUNT position)", () => {
    const out = rule.toString();
    expect(out).toContain("DTSTART;TZID=America/Chicago:20250320T170000");
    expect(out).toContain("FREQ=DAILY");
    expect(out).toContain("BYHOUR=17");
    expect(out).toContain("BYMINUTE=0");
    expect(out).toContain("COUNT=5");
  });

  test("all() returns exactly count occurrences at 5pm CT each day", () => {
    const dates = rule.all();
    expect(dates).toHaveLength(5);
    for (let i = 0; i < dates.length; i++) {
      const dt = dates[i];
      if (!dt) {
        throw new Error("dt is undefined");
      }
      // 17:00 CT should be 22:00 UTC during CDT
      expect(dt.hour).toBe(17);
      expect(dt.minute).toBe(0);
      // consecutive days
      const next = dates[i + 1];
      if (next) {
        const diff = Temporal.Duration.compare(
          next.since(dt),
          Temporal.Duration.from({ days: 1 })
        );
        expect(diff).toBe(0);
      }
    }
  });
});

describe("RRuleTemporal - Manual options", () => {
  const dtstart = Temporal.ZonedDateTime.from({
    year: 2025,
    month: 4,
    day: 20,
    hour: 8,
    minute: 30,
    timeZone: "America/Chicago",
  });

  const rule = new RRuleTemporal({
    freq: "DAILY",
    interval: 2,
    count: 3,
    byHour: [9],
    byMinute: [15],
    dtstart,
    tzid: "America/Chicago",
  });

  test("all() respects manual interval and overrides time", () => {
    const dates = rule.all();
    expect(dates).toHaveLength(3);
    dates.forEach((d, idx) => {
      expect(d.hour).toBe(9);
      expect(d.minute).toBe(15);
      if (idx > 0) {
        const prev = dates[idx - 1];
        if (!prev) {
          throw new Error("prev is undefined");
        }
        const diffDays = Math.round(d.since(prev).total({ unit: "days" }));
        expect(diffDays).toBe(2);
      }
    });
  });
});

describe("RRuleTemporal - between()", () => {
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
});

describe("RRuleTemporal - next() and previous()", () => {
  const ics = `DTSTART;TZID=UTC:20250101T120000
RRULE:FREQ=MONTHLY;BYHOUR=12;BYMINUTE=0;COUNT=12`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });

  test("next gives first upcoming after a date", () => {
    const after = new Date(
      Temporal.ZonedDateTime.from({
        year: 2025,
        month: 3,
        day: 15,
        hour: 0,
        minute: 0,
        timeZone: "UTC",
      }).toInstant().epochMilliseconds
    );
    const nxt = rule.next(after);
    expect(nxt).not.toBeNull();
    if (!nxt) {
      throw new Error("nxt is undefined");
    }
    expect(nxt.month).toBe(4); // April’s occurrence
    expect(nxt.hour).toBe(12);
  });

  test("previous gives last before a date", () => {
    const before = new Date(
      Temporal.ZonedDateTime.from({
        year: 2025,
        month: 6,
        day: 5,
        hour: 0,
        minute: 0,
        timeZone: "UTC",
      }).toInstant().epochMilliseconds
    );

    const prev = rule.previous(before);
    expect(prev).not.toBeNull();
    if (!prev) {
      throw new Error("prev is undefined");
    }
    expect(prev.month).toBe(6); // June’s occurrence (on or before)
  });
});

describe("RRuleTemporal - unbounded all() error", () => {
  const ics = `DTSTART;TZID=UTC:20250101T000000
RRULE:FREQ=DAILY`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });
  test("all() throws without iterator on unbounded", () => {
    expect(() => rule.all()).toThrow(/requires iterator/);
  });
  test("all() works with iterator limit", () => {
    const dates = rule.all((dt, i) => i < 3);
    expect(dates).toHaveLength(3);
  });
});

describe("RRuleTemporal - BYDAY frequencies", () => {
  const ics = `DTSTART;TZID=America/Chicago:20250325T000000
RRULE:FREQ=MONTHLY;BYDAY=2FR,4FR,-1SA;BYHOUR=0;BYMINUTE=0`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });
  // 2025 Apr 22 00:00 UTC
  const start = new Date(Date.UTC(2025, 3, 20, 0, 0));
  // 2026 Apr 22 00:00 UTC
  const end = new Date(Date.UTC(2026, 3, 22, 0, 0, 0));

  test("between returns occurrences in window", () => {
    const arrInc = rule.between(start, end, true);
    console.log(
      "arrInc: ",
      arrInc.map((d) => d.toString())
    );
    expect(arrInc.map((d) => d.day)).toEqual([
      25, 26, 9, 23, 31, 13, 27, 28, 11, 25, 26, 8, 22, 30, 12, 26, 27, 10, 24,
      25, 14, 28, 29, 12, 26, 27, 9, 23, 31, 13, 27, 28, 13, 27, 28, 10,
    ]);
  });
});

describe("RRuleTemporal - BYMONTH with MONTHLY freq (ICS snippet)", () => {
  const ics = `DTSTART;TZID=UTC:20250115T000000
RRULE:FREQ=MONTHLY;BYMONTH=1,4,7;BYHOUR=0;BYMINUTE=0;COUNT=3`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });

  test("all() returns exactly the 15th of Jan, Apr & Jul", () => {
    const dates = rule.all();
    expect(dates).toHaveLength(3);
    expect(dates.map((d) => d.month)).toEqual([1, 4, 7]);
    expect(dates.map((d) => d.day)).toEqual([15, 15, 15]);
  });
});

describe("RRuleTemporal - BYMONTH with YEARLY freq (manual opts)", () => {
  const dtstart = Temporal.ZonedDateTime.from({
    year: 2025,
    month: 1,
    day: 10,
    hour: 9,
    minute: 0,
    timeZone: "UTC",
  });
  const rule = new RRuleTemporal({
    freq: "YEARLY",
    interval: 1,
    count: 4,
    byMonth: [1, 6, 12],
    byHour: [9],
    byMinute: [0],
    dtstart,
  });

  test("all() emits Jan ’25, Jun ’26, Dec ’27, Jan ’28", () => {
    const dates = rule.all();
    expect(dates).toHaveLength(4);
    expect(dates.map((d) => ({ year: d.year, month: d.month }))).toEqual([
      { year: 2025, month: 1 },
      { year: 2026, month: 6 },
      { year: 2027, month: 12 },
      { year: 2028, month: 1 },
    ]);
    for (const d of dates) {
      expect(d.hour).toBe(9);
      expect(d.minute).toBe(0);
    }
  });
});

describe("RRuleTemporal - Weekly BYDAY simple all()", () => {
  const ics = `DTSTART;TZID=America/Chicago:20250406T000000
RRULE:FREQ=WEEKLY;BYDAY=MO;BYHOUR=0;BYMINUTE=0;COUNT=4`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });

  test("all() returns 4 consecutive Mondays", () => {
    const dates = rule.all();
    // dayOfWeek 1 == Monday
    expect(dates).toHaveLength(4);
    expect(dates.map((d) => d.day)).toEqual([7, 14, 21, 28]);
    dates.forEach((d) => expect(d.dayOfWeek).toBe(1));
  });
});

describe("RRuleTemporal - Weekly BYDAY simple between()", () => {
  const ics = `DTSTART;TZID=America/Chicago:20250325T000000
RRULE:FREQ=WEEKLY;BYDAY=MO;BYHOUR=0;BYMINUTE=0`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });

  // Window: April 22 2025 UTC → May 20 2025 UTC
  const start = new Date(Date.UTC(2025, 3, 22, 0, 0)); // April is month=3
  const end = new Date(Date.UTC(2025, 4, 20, 0, 0)); // May is month=4

  test("between() returns the Mondays falling in that window", () => {
    const arrInc = rule.between(start, end, true);
    // Expect 2025-04-28, 05-05, 05-12, 05-19
    expect(arrInc.map((d) => d.day)).toEqual([28, 5, 12, 19]);
    arrInc.forEach((d) => expect(d.dayOfWeek).toBe(1));
  });
});

describe("RRuleTemporal - Weekly BYDAY frequencies without positional prefix", () => {
  const ics = `DTSTART;TZID=America/Chicago:20250325T000000
RRULE:FREQ=WEEKLY;BYDAY=MO;BYHOUR=0;BYMINUTE=0`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });
  // 2025 Apr 22 00:00 UTC
  const start = new Date(Date.UTC(2025, 3, 22, 0, 0));
  // 2026 Apr 22 00:00 UTC
  const end = new Date(Date.UTC(2026, 3, 22, 0, 0, 0));

  test("between returns occurrences in window", () => {
    const arrInc = rule.between(start, end, true);
    console.log(
      "arrInc: ",
      arrInc.map((d) => d.toString())
    );
    expect(arrInc.map((d) => d.day)).toEqual([
      28, 5, 12, 19, 26, 2, 9, 16, 23, 30, 7, 14, 21, 28, 4, 11, 18, 25, 1, 8,
      15, 22, 29, 6, 13, 20, 27, 3, 10, 17, 24, 1, 8, 15, 22, 29, 5, 12, 19, 26,
      2, 9, 16, 23, 2, 9, 16, 23, 30, 6, 13, 20,
    ]);
  });
});
