import { RRuleTemporal } from "../index";
import { toText } from "../totext";
import { Temporal } from "@js-temporal/polyfill";

function zdt(y: number, m: number, d: number, h: number, tz = "UTC") {
  return Temporal.ZonedDateTime.from({
    year: y,
    month: m,
    day: d,
    hour: h,
    minute: 0,
    timeZone: tz,
  });
}

describe("RRuleTemporal.toText", () => {
  test("daily rule", () => {
    const rule = new RRuleTemporal({
      freq: "DAILY",
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(toText(rule)).toBe("every day");
  });

  test("daily with hours", () => {
    const rule = new RRuleTemporal({
      freq: "DAILY",
      byHour: [10, 12, 17],
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(toText(rule)).toBe("every day at 10 AM, 12 PM and 5 PM UTC");
  });

  test("weekly with byday and hours", () => {
    const rule = new RRuleTemporal({
      freq: "WEEKLY",
      byDay: ["SU"],
      byHour: [10, 12, 17],
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(toText(rule)).toBe("every week on Sunday at 10 AM, 12 PM and 5 PM UTC");
  });

  test("daily with hour and minute", () => {
    const rule = new RRuleTemporal({
      freq: "DAILY",
      byHour: [17],
      byMinute: [30],
      dtstart: zdt(2025, 1, 1, 0, "America/Chicago"),
    });
    expect(toText(rule)).toBe("every day at 5:30 PM CST");
  });

  test("weekdays shortcut", () => {
    const rule = new RRuleTemporal({
      freq: "WEEKLY",
      byDay: ["MO", "TU", "WE", "TH", "FR"],
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(toText(rule)).toBe("every weekday");
  });

  test("minutely interval", () => {
    const rule = new RRuleTemporal({
      freq: "MINUTELY",
      interval: 2,
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(toText(rule)).toBe("every 2 minutes");
  });

  test("until formatted", () => {
    const until = Temporal.Instant.from(
      "2012-11-10T00:00:00Z"
    ).toZonedDateTimeISO("UTC");
    const rule = new RRuleTemporal({
      freq: "WEEKLY",
      until,
      dtstart: zdt(2012, 1, 1, 0),
    });
    expect(toText(rule)).toBe("every week until November 10, 2012");

  });
});
