import { RRuleTemporal } from "../index";
import { Temporal } from "@js-temporal/polyfill";

function zdt(
  y: number,
  m: number,
  d: number,
  h: number,
  tz = "America/New_York"
) {
  return Temporal.ZonedDateTime.from({
    year: y,
    month: m,
    day: d,
    hour: h,
    minute: 0,
    timeZone: tz,
  });
}

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

  test("toString includes UNTIL when present", () => {
    const icsUntil =
      `DTSTART;TZID=America/Chicago:20250401T000000\nRRULE:FREQ=DAILY;BYHOUR=0;BYMINUTE=0;UNTIL=20250405T000000Z`.trim();
    const ruleUntil = new RRuleTemporal({ rruleString: icsUntil });
    const out = ruleUntil.toString();
    expect(out).toContain("UNTIL=20250405T000000Z");
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
    expect(nxt.month).toBe(4); // April's occurrence
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
    expect(prev.month).toBe(6); // June's occurrence (on or before)
  });

  test("previous gives occurrence on same day as dtstart", () => {
    // DTSTART matches the rule (Daily at 15:10)
    const icsSameDay = `DTSTART;TZID=America/Chicago:20250505T151000
RRULE:FREQ=DAILY;UNTIL=20250530T050000Z;BYHOUR=15;BYMINUTE=10`.trim();
    const ruleSameDay = new RRuleTemporal({ rruleString: icsSameDay });

    // Date for previous() call: 1 minute after the occurrence time
    const beforeDate = new Date(
      Temporal.ZonedDateTime.from({
        year: 2025,
        month: 5,
        day: 5,
        hour: 15,
        minute: 11, // One minute after the occurrence time
        second: 0,
        timeZone: "America/Chicago",
      }).toInstant().epochMilliseconds
    );

    const prev = ruleSameDay.previous(beforeDate);
    expect(prev).not.toBeNull();
    if (!prev) {
      throw new Error("prev is undefined");
    }

    // Expect the occurrence at 15:10 on the same day (which is the DTSTART)
    const expectedDate = Temporal.ZonedDateTime.from({
      year: 2025,
      month: 5,
      day: 5,
      hour: 15,
      minute: 10,
      second: 0,
      timeZone: "America/Chicago",
    });

    // Compare ZonedDateTimes for equality
    expect(prev.equals(expectedDate)).toBe(true);
  });

  test("next() with no arguments defaults to Date.now()", () => {
    const now = Temporal.Now.zonedDateTimeISO("UTC");
    let ruleHour = now.hour + 2;
    let ruleDate = now.toPlainDate();
    if (ruleHour > 23) {
      ruleHour = 1;
      ruleDate = ruleDate.add({ days: 1 }); // if it's late, rule starts tomorrow
    }

    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=UTC:${ruleDate.year.toString()}${ruleDate.month
        .toString()
        .padStart(2, "0")}${ruleDate.day.toString().padStart(2, "0")}T${ruleHour
        .toString()
        .padStart(2, "0")}0000
RRULE:FREQ=DAILY;BYHOUR=${ruleHour};BYMINUTE=0;COUNT=5`,
    });

    const nxt = rule.next();
    expect(nxt).not.toBeNull();
    if (!nxt) throw new Error("nxt is undefined");

    expect(nxt.hour).toBe(ruleHour);
    expect(nxt.minute).toBe(0);

    const today = Temporal.Now.zonedDateTimeISO("UTC").toPlainDate();
    const tomorrow = today.add({ days: 1 });
    const nxtDate = nxt.toPlainDate();

    // The next occurrence should be on the ruleDate (which is today or tomorrow based on ruleHour)
    expect(nxtDate.equals(ruleDate)).toBe(true);
  });

  test("previous() with no arguments defaults to Date.now()", () => {
    const now = Temporal.Now.zonedDateTimeISO("UTC");
    let ruleHour = now.hour - 2;
    let ruleStartOffsetDays = -2; // Start rule in the past

    if (ruleHour < 0) {
      ruleHour = 22; // if it's early morning, rule hour was yesterday evening
    }

    // Ensure DTSTART is sufficiently in the past to have occurrences yesterday or today
    const dtstartDate = now.toPlainDate().add({ days: ruleStartOffsetDays });

    const rule = new RRuleTemporal({
      rruleString: `DTSTART;TZID=UTC:${dtstartDate.year.toString()}${dtstartDate.month
        .toString()
        .padStart(2, "0")}${dtstartDate.day
        .toString()
        .padStart(2, "0")}T${ruleHour.toString().padStart(2, "0")}0000
RRULE:FREQ=DAILY;BYHOUR=${ruleHour};BYMINUTE=0;COUNT=10`,
    });

    const prev = rule.previous();
    expect(prev).not.toBeNull();
    if (!prev) throw new Error("prev is undefined");

    expect(prev.hour).toBe(ruleHour);
    expect(prev.minute).toBe(0);

    const today = Temporal.Now.zonedDateTimeISO("UTC").toPlainDate();
    const yesterday = today.add({ days: -1 });
    const prevDate = prev.toPlainDate();

    // The previous occurrence should be today if ruleHour has passed, or yesterday if ruleHour is in the future today.
    if (ruleHour < now.hour) {
      // Rule time has passed for today
      expect(prevDate.equals(today)).toBe(true);
    } else {
      // Rule time is later today, so previous was yesterday
      expect(prevDate.equals(yesterday)).toBe(true);
    }
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
RRULE:FREQ=MONTHLY;BYDAY=2FR,4FR;BYHOUR=0;BYMINUTE=0`.trim();
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
      25, 9, 23, 13, 27, 11, 25, 8, 22, 12, 26, 10, 24, 14, 28, 12, 26, 9, 23,
      13, 27, 13, 27, 10,
    ]);
  });
});

describe("RRuleTemporal - Negative BYDAY frequencies", () => {
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

  test("all() emits Jan '25, Jun '26, Dec '27, Jan '28", () => {
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

describe("RRuleTemporal - BYDAY with YEARLY freq", () => {
  const ics =
    `DTSTART;TZID=UTC:20250101T120000\nRRULE:FREQ=YEARLY;BYDAY=+1FR;COUNT=3`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });

  test("all() returns first Friday each January", () => {
    const dates = rule.all();
    expect(dates.map((d) => d.toPlainDate().toString())).toEqual([
      "2025-01-03",
      "2026-01-02",
      "2027-01-01",
    ]);
    dates.forEach((d) => {
      expect(d.hour).toBe(12);
      expect(d.minute).toBe(0);
    });
  });
});

describe("RRuleTemporal - BYMONTH and BYDAY with YEARLY freq", () => {
  const ics =
    `DTSTART;TZID=UTC:20250101T120000\nRRULE:FREQ=YEARLY;BYMONTH=5;BYDAY=+1FR;COUNT=3`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });

  test("all() returns first Friday of May", () => {
    const dates = rule.all();
    expect(dates.map((d) => d.toPlainDate().toString())).toEqual([
      "2025-05-02",
      "2026-05-01",
      "2027-05-07",
    ]);
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

describe("RRuleTemporal - Weekly BYDAY order does not affect between()", () => {
  const tzid = "America/Denver";
  const dtstart = Temporal.ZonedDateTime.from({
    year: 2025,
    month: 4,
    day: 30,
    hour: 12,
    minute: 0,
    timeZone: tzid,
  });

  const baseOpts = {
    freq: "WEEKLY" as const,
    interval: 1,
    count: 7,
    byHour: [12],
    byMinute: [0],
    tzid,
    dtstart,
  };

  test("different BYDAY order yields same results", () => {
    const rule1 = new RRuleTemporal({
      ...baseOpts,
      byDay: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"],
    });
    const rule2 = new RRuleTemporal({
      ...baseOpts,
      byDay: ["TH", "FR", "SA", "SU", "MO", "TU", "WE"],
    });

    const endDate = dtstart.add({ weeks: 1 });
    const arr1 = rule1.between(dtstart, endDate, true);
    const arr2 = rule2.between(dtstart, endDate, true);

    expect(arr1.map((d) => d.toString())).toEqual(
      arr2.map((d) => d.toString())
    );
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

describe("RRuleTemporal - next() with Timezones", () => {
  test("Rule in ET, next() called with UTC date", () => {
    const icsET = `DTSTART;TZID=America/New_York:20250601T100000
RRULE:FREQ=DAILY;BYHOUR=10;BYMINUTE=0;COUNT=5`.trim();
    const ruleET = new RRuleTemporal({ rruleString: icsET });

    // June 1st 2025, 00:00:00 UTC
    const afterUTC = new Date(Date.UTC(2025, 5, 1, 0, 0, 0));

    const nxt = ruleET.next(afterUTC);
    expect(nxt).not.toBeNull();
    if (!nxt) throw new Error("nxt is undefined");

    // Expect next occurrence to be 10:00 in America/New_York
    expect(nxt.timeZoneId).toBe("America/New_York");
    expect(nxt.hour).toBe(10);
    expect(nxt.year).toBe(2025);
    expect(nxt.month).toBe(6);
    expect(nxt.day).toBe(1);
  });

  test("Rule in PT, next() called with ET date", () => {
    const icsPT = `DTSTART;TZID=America/Los_Angeles:20250710T140000
RRULE:FREQ=DAILY;BYHOUR=14;BYMINUTE=0;COUNT=5`.trim();
    const rulePT = new RRuleTemporal({ rruleString: icsPT });

    // July 10th 2025, 10:00:00 America/New_York (which is 07:00:00 PT)
    const afterET = new Date(
      Temporal.ZonedDateTime.from({
        year: 2025,
        month: 7,
        day: 10,
        hour: 10, // 10 AM ET
        minute: 0,
        timeZone: "America/New_York",
      }).toInstant().epochMilliseconds
    );

    const nxt = rulePT.next(afterET);
    expect(nxt).not.toBeNull();
    if (!nxt) throw new Error("nxt is undefined");

    // Expect next occurrence to be 14:00 (2 PM) in America/Los_Angeles
    expect(nxt.timeZoneId).toBe("America/Los_Angeles");
    expect(nxt.hour).toBe(14);
    expect(nxt.year).toBe(2025);
    expect(nxt.month).toBe(7);
    expect(nxt.day).toBe(10);
  });

  test("Rule crossing DST change (Chicago)", () => {
    // Rule triggers daily at 2 AM Chicago time. DST starts March 9, 2025
    const icsChicagoDST = `DTSTART;TZID=America/Chicago:20250308T020000
RRULE:FREQ=DAILY;BYHOUR=2;BYMINUTE=0;COUNT=3`.trim();
    const ruleChicagoDST = new RRuleTemporal({ rruleString: icsChicagoDST });

    // Start looking from just before the first occurrence
    const afterStart = new Date(
      Temporal.ZonedDateTime.from({
        year: 2025,
        month: 3,
        day: 8,
        hour: 1,
        minute: 59,
        timeZone: "America/Chicago",
      }).toInstant().epochMilliseconds
    );

    const first = ruleChicagoDST.next(afterStart); // Should be Mar 8, 2:00 CST (UTC-6)
    expect(first).not.toBeNull();
    if (!first) throw new Error("first is undefined");
    expect(first.toString()).toBe("2025-03-08T02:00:00-06:00[America/Chicago]");

    // DST starts Mar 9, 2 AM CST becomes 3 AM CDT
    const second = ruleChicagoDST.next(
      new Date(first.toInstant().epochMilliseconds)
    ); // Should be Mar 9, 2:00 -> jumps to 3:00 CDT (UTC-5)
    expect(second).not.toBeNull();
    if (!second) throw new Error("second is undefined");
    // The local time remains 2:00 AM according to the rule, even though the UTC offset changes
    // Correction: 2:00 AM CDT does not exist on Mar 9. Expect 3:00 AM CDT.
    expect(second.toString()).toBe(
      "2025-03-09T03:00:00-05:00[America/Chicago]"
    );
    expect(second.hour).toBe(3); // Hour will be 3 AM local time as 2 AM was skipped

    const third = ruleChicagoDST.next(
      new Date(second.toInstant().epochMilliseconds)
    ); // Should be Mar 10, 2:00 CDT (UTC-5)
    expect(third).not.toBeNull();
    if (!third) throw new Error("third is undefined");
    expect(third.toString()).toBe("2025-03-10T02:00:00-05:00[America/Chicago]");
    expect(third.hour).toBe(2); // Hour remains 2 AM local time
  });
});

describe("RRuleTemporal - Multiple BYHOUR values", () => {
  const ics = `DTSTART;TZID=America/New_York:20250801T000000
RRULE:FREQ=DAILY;BYHOUR=6,7,9;BYMINUTE=0;COUNT=10`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });

  test("next() correctly cycles through multiple BYHOUR values", () => {
    // Start looking from before the first occurrence on Aug 1st
    const initialDate = new Date(
      Temporal.ZonedDateTime.from({
        year: 2025,
        month: 8,
        day: 1,
        hour: 5, // Before the first BYHOUR (6)
        minute: 0,
        timeZone: "America/New_York",
      }).toInstant().epochMilliseconds
    );

    const first = rule.next(initialDate);
    expect(first).not.toBeNull();
    if (!first) throw new Error("first is undefined");
    expect(first.timeZoneId).toBe("America/New_York");
    expect(first.year).toBe(2025);
    expect(first.month).toBe(8);
    expect(first.day).toBe(1);
    expect(first.hour).toBe(6);

    const second = rule.next(new Date(first.toInstant().epochMilliseconds));
    expect(second).not.toBeNull();
    if (!second) throw new Error("second is undefined");
    expect(second.hour).toBe(7);

    const third = rule.next(new Date(second.toInstant().epochMilliseconds));
    expect(third).not.toBeNull();
    if (!third) throw new Error("third is undefined");
    expect(third.hour).toBe(9);

    // Check that it rolls over to the next day correctly
    const fourth = rule.next(new Date(third.toInstant().epochMilliseconds));
    expect(fourth).not.toBeNull();
    if (!fourth) throw new Error("fourth is undefined");
    expect(fourth.day).toBe(2);
    expect(fourth.hour).toBe(6);
  });
});

describe("BYHOUR enumeration – DAILY + COUNT", () => {
  const rule = new RRuleTemporal({
    rruleString: `DTSTART;TZID=America/New_York:20250801T000000
RRULE:FREQ=DAILY;BYHOUR=6,12,18;BYMINUTE=0;COUNT=7`, // 7 total occurrences
  });

  test("all() emits 6 → 12 → 18 → 6 … pattern", () => {
    const hrs = rule.all().map((d) => d.hour);
    expect(hrs).toEqual([6, 12, 18, 6, 12, 18, 6]);
  });
});

describe("BYHOUR enumeration – WEEKLY BYDAY×BYHOUR", () => {
  const ics = `
DTSTART;TZID=America/Chicago:20250901T000000
RRULE:FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=9,17;BYMINUTE=0;COUNT=8`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });

  test("Sequence cycles MO-9 → MO-17 → FR-9 → FR-17 …", () => {
    const seq = rule.all().map((d) => `${d.dayOfWeek}-${d.hour}`);
    // MO=1, FR=5
    expect(seq).toEqual([
      "1-9",
      "1-17",
      "5-9",
      "5-17",
      "1-9",
      "1-17",
      "5-9",
      "5-17",
    ]);
  });
});

describe("BYHOUR enumeration – MONTHLY with ordinal BYDAY", () => {
  const ics = `
DTSTART;TZID=UTC:20251015T000000
RRULE:FREQ=MONTHLY;BYDAY=1MO,-1MO;BYHOUR=8,20;BYMINUTE=0;COUNT=6`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });

  test("all() emits first-Mon 08:00, 20:00, last-Mon 08:00, 20:00 …", () => {
    const res = rule.all().map((d) => d.hour);
    /* expected pattern for three months:
       2025-11-03T08:00Z, 2025-11-03T20:00Z,
       2025-11-24T08:00Z, 2025-11-24T20:00Z,
       2025-12-01T08:00Z, 2025-12-01T20:00Z
    */
    expect(res[0]).toBe(8);
    expect(res[1]).toBe(20);
    expect(res).toHaveLength(6);
  });

  test("between() includes every hour in window", () => {
    const start = zdt(2025, 11, 1, 0, "UTC").toInstant().epochMilliseconds;
    const end = zdt(2025, 11, 30, 23, "UTC").toInstant().epochMilliseconds;
    const hrs = rule
      .between(new Date(start), new Date(end), true)
      .map((d) => d.hour);
    expect(hrs).toEqual([8, 20, 8, 20]); // four hits in November
  });
});

describe("RRuleTemporal options() method", () => {
  test("should return options with tzid from ICS string", () => {
    const ics = `
DTSTART;TZID=America/New_York:20240101T100000
RRULE:FREQ=DAILY;COUNT=5`.trim();
    const rule = new RRuleTemporal({ rruleString: ics });
    const opts = rule.options();
    expect(opts.tzid).toBe("America/New_York");
    expect(opts.freq).toBe("DAILY");
    expect(opts.count).toBe(5);
    expect(
      opts.dtstart.equals(
        Temporal.ZonedDateTime.from("2024-01-01T10:00:00[America/New_York]")
      )
    ).toBe(true);
  });

  test("should return options with tzid from dtstart object (manual opts)", () => {
    const dtstart = Temporal.ZonedDateTime.from(
      "20240315T090000[Europe/Paris]"
    );
    const rule = new RRuleTemporal({
      freq: "WEEKLY",
      dtstart,
      interval: 2,
    });
    const opts = rule.options();
    expect(opts.tzid).toBe("Europe/Paris");
    expect(opts.freq).toBe("WEEKLY");
    expect(opts.interval).toBe(2);
    expect(opts.dtstart.equals(dtstart)).toBe(true);
  });

  test("should return options with explicit tzid overriding dtstart object's tzid (manual opts)", () => {
    const dtstart = Temporal.ZonedDateTime.from(
      "20240315T090000[Europe/Paris]"
    );
    const rule = new RRuleTemporal({
      freq: "MONTHLY",
      dtstart,
      tzid: "Asia/Tokyo",
    });
    const opts = rule.options();
    expect(opts.tzid).toBe("Asia/Tokyo"); // Explicit tzid should win
    expect(opts.freq).toBe("MONTHLY");
    // dtstart itself should retain its original timezone for comparison if needed,
    // but the rule's tzid is what's important for generation.
    expect(opts.dtstart.timeZoneId).toBe("Europe/Paris");
    // The originalDtstart stored in the class will be the one passed.
    // The tzid in options is the one used for rule processing.
  });

  test("should default tzid to UTC if not in ICS DTSTART and no explicit tzid", () => {
    // DTSTART without TZID, implies floating, but parser defaults to UTC if not specified
    // or if the UNTIL has a Z. For consistency, let's assume parser sets a tzid.
    // The parseRRuleString function defaults tzid to "UTC" if not found in DTSTART
    // and then uses it for UNTIL if UNTIL is not UTC.
    // If DTSTART has no TZID, it's parsed as PlainDateTime then toZonedDateTime with tzid (which defaults to "" then "UTC").
    const ics = `
DTSTART:20240701T120000
RRULE:FREQ=YEARLY`.trim();
    const rule = new RRuleTemporal({ rruleString: ics });
    const opts = rule.options();
    // parseRRuleString will assign "" initially, then constructor might default to "UTC"
    // or use the tzid from dtstart if it was ZonedDateTime.
    // Given the current parseRRuleString, dtstart becomes ZonedDateTime in UTC.
    expect(opts.tzid).toBe("UTC"); // Defaulting behavior of parseRRuleString
    expect(opts.freq).toBe("YEARLY");
    expect(
      opts.dtstart.equals(
        Temporal.PlainDateTime.from("2024-07-01T12:00:00").toZonedDateTime(
          "UTC"
        )
      )
    ).toBe(true);
  });

  test("should use tzid from dtstart if tzid is not explicitly passed in manual options", () => {
    const dtstart = Temporal.ZonedDateTime.from(
      "2025-01-01T00:00:00[America/Denver]"
    );
    const rule = new RRuleTemporal({
      freq: "DAILY",
      dtstart: dtstart,
    });
    const opts = rule.options();
    expect(opts.tzid).toBe("America/Denver");
    expect(opts.dtstart.timeZoneId).toBe("America/Denver");
  });

  test("should correctly parse and store all provided options from rruleString", () => {
    const ics = `
DTSTART;TZID=America/Los_Angeles:20230101T103000
RRULE:FREQ=MONTHLY;INTERVAL=2;COUNT=10;UNTIL=20240101T103000Z;BYHOUR=10,14;BYMINUTE=30,45;BYDAY=1MO,-1FR;BYMONTH=1,7`.trim();
    const rule = new RRuleTemporal({ rruleString: ics });
    const opts = rule.options();

    expect(opts.tzid).toBe("America/Los_Angeles");
    expect(opts.freq).toBe("MONTHLY");
    expect(opts.interval).toBe(2);
    expect(opts.count).toBe(10);
    expect(
      opts.until?.equals(
        Temporal.Instant.from("2024-01-01T10:30:00Z").toZonedDateTimeISO(
          "America/Los_Angeles"
        )
      )
    ).toBe(true);
    expect(opts.byHour).toEqual([10, 14]);
    expect(opts.byMinute).toEqual([30, 45]);
    expect(opts.byDay).toEqual(["1MO", "-1FR"]);
    expect(opts.byMonth).toEqual([1, 7]);
    expect(opts.dtstart.toString()).toBe(
      "2023-01-01T10:30:00-08:00[America/Los_Angeles]"
    );
  });

  test("should correctly store all provided manual options", () => {
    const dtstart = Temporal.ZonedDateTime.from(
      "2023-05-10T08:00:00[Europe/Berlin]"
    );
    const until = Temporal.ZonedDateTime.from(
      "2024-05-10T08:00:00[Europe/Berlin]"
    );
    const manualOpts: import("../index").RRuleOptions = {
      freq: "WEEKLY",
      interval: 1,
      count: 52,
      until,
      byHour: [8, 12],
      byMinute: [0],
      byDay: ["MO", "WE", "FR"],
      byMonth: [5, 6],
      dtstart,
      tzid: "Europe/Berlin",
    };
    const rule = new RRuleTemporal(manualOpts);
    const opts = rule.options();

    expect(opts.tzid).toBe("Europe/Berlin");
    expect(opts.freq).toBe("WEEKLY");
    expect(opts.interval).toBe(1);
    expect(opts.count).toBe(52);
    expect(opts.until?.equals(until)).toBe(true);
    expect(opts.byHour).toEqual([8, 12]);
    expect(opts.byMinute).toEqual([0]);
    expect(opts.byDay).toEqual(["MO", "WE", "FR"]);
    expect(opts.byMonth).toEqual([5, 6]);
    expect(opts.dtstart.equals(dtstart)).toBe(true);
  });
});

describe("RRuleTemporal - BYMONTHDAY", () => {
  test("positive month days", () => {
    const ics =
      `DTSTART;TZID=UTC:20250401T000000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=10,15;COUNT=4`.trim();
    const rule = new RRuleTemporal({ rruleString: ics });
    const days = rule.all().map((d) => d.day);
    expect(days).toEqual([10, 15, 10, 15]);
  });

  test("negative month day", () => {
    const ics =
      `DTSTART;TZID=UTC:20250401T000000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3`.trim();
    const rule = new RRuleTemporal({ rruleString: ics });
    const days = rule.all().map((d) => d.day);
    expect(days).toEqual([30, 31, 30]);
  });

  test("toText with manual opts", () => {
    const dtstart = Temporal.ZonedDateTime.from("2025-01-01T00:00Z[UTC]");
    const rule = new RRuleTemporal({
      freq: "MONTHLY",
      byMonthDay: [1, 15],
      dtstart,
    });
    expect(rule.toText()).toBe(
      "every month on the 1st and 15th day of the month"
    );
  });
});

describe("Regression - next() and previous() with BYDAY rule", () => {
  const rruleString = `DTSTART:20250609T000000Z\nRRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=2MO`;
  const rule = new RRuleTemporal({ rruleString });

  test("next() returns the following 2nd Monday", () => {
    const date = new Date("2025-06-09T00:00:00.000Z");
    const nxt = rule.next(date);
    expect(nxt).not.toBeNull();
    if (!nxt) throw new Error("nxt is undefined");
    // Should be July 14, 2025 (the next 2nd Monday)
    expect(nxt.toPlainDate().toString()).toBe("2025-07-14");
    expect(nxt.hour).toBe(0);
    expect(nxt.timeZoneId).toBe("UTC");
  });

  test("previous() returns the prior 2nd Monday", () => {
    const before = new Date("2025-07-13T12:00:00.000Z");
    const prev = rule.previous(before);
    expect(prev).not.toBeNull();
    if (!prev) throw new Error("prev is undefined");
    // Should be June 9, 2025 (the DTSTART)
    expect(prev.toPlainDate().toString()).toBe("2025-06-09");
    expect(prev.hour).toBe(0);
    expect(prev.timeZoneId).toBe("UTC");
  });
});

describe("BYDAY with SECONDLY frequency", () => {
  const ics = `DTSTART;TZID=UTC:20250101T120000\nRRULE:FREQ=SECONDLY;COUNT=30;WKST=MO;BYDAY=MO`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });

  test("all() enumerates seconds only on the matching weekday", () => {
    const dates = rule.all();
    expect(dates).toHaveLength(30);
    // first occurrence should be the following Monday at the same time
    expect(dates[0]!.toPlainDate().toString()).toBe("2025-01-06");
    expect(dates[0]!.hour).toBe(12);
    // every occurrence should be on Monday
    expect(dates.every((d) => d.dayOfWeek === 1)).toBe(true);
    // last one should be 29 seconds after the first
    expect(dates[dates.length - 1]!.second).toBe(29);
  });
});
describe("Regression - SECONDLY freq with BYDAY", () => {
  const ics = `DTSTART;TZID=UTC:20250101T120000\nRRULE:FREQ=SECONDLY;COUNT=30;BYDAY=MO`.trim();
  const rule = new RRuleTemporal({ rruleString: ics });

  test("all() starts on the first matching Monday", () => {
    const dates = rule.all();
    expect(dates).toHaveLength(30);
    const first = dates[0];
    if (!first) throw new Error("first is undefined");
    expect(first.toString()).toBe("2025-01-06T12:00:00+00:00[UTC]");
    // ensure every occurrence is on Monday and consecutive seconds
    dates.forEach((d, i) => {
      expect(d.dayOfWeek).toBe(1);
      expect(d.toPlainTime().toString()).toBe(
        `12:00:${String(i).padStart(2, "0")}`
      );
    });
  });
});
