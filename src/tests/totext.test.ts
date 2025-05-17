import { RRuleTemporal, DateFormatter } from "../index";
import { Temporal } from "@js-temporal/polyfill";
import { RRuleTemporal } from "../index";

const baseICS = "DTSTART;TZID=America/New_York:20220601T000000";
function make(rr: string) {
  return new RRuleTemporal({ rruleString: `${baseICS}\n${rr}`.trim() });
}

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

describe("toText", () => {
  const cases: [string, string][] = [
    ["Every day", "RRULE:FREQ=DAILY"],
    [
      "Every day at 10 AM, 12 PM and 5 PM EDT",
      "RRULE:FREQ=DAILY;BYHOUR=10,12,17",
    ],
    [
      "Every week on Sunday at 10 AM, 12 PM and 5 PM EDT",
      "RRULE:FREQ=WEEKLY;BYDAY=SU;BYHOUR=10,12,17",
    ],
    ["Every week", "RRULE:FREQ=WEEKLY"],
    ["Every hour", "RRULE:FREQ=HOURLY"],
    ["Every 4 hours", "RRULE:INTERVAL=4;FREQ=HOURLY"],
    ["Every week on Tuesday", "RRULE:FREQ=WEEKLY;BYDAY=TU"],
    ["Every week on Monday and Wednesday", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE"],
    ["Every weekday", "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
    ["Every 2 weeks", "RRULE:INTERVAL=2;FREQ=WEEKLY"],
    ["Every month", "RRULE:FREQ=MONTHLY"],
    ["Every 6 months", "RRULE:INTERVAL=6;FREQ=MONTHLY"],
    ["Every year", "RRULE:FREQ=YEARLY"],
    ["Every year on 1st Friday", "RRULE:FREQ=YEARLY;BYDAY=+1FR"],
    ["Every year on 13th Friday", "RRULE:FREQ=YEARLY;BYDAY=+13FR"],
    ["Every day at 5:30 PM EDT", "RRULE:FREQ=DAILY;BYHOUR=17;BYMINUTE=30"],
    [
      "Every week on Monday and Wednesday at 10 AM and 4 PM EDT",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;BYHOUR=10,16",
    ],
    [
      "Every week on Tuesday and Thursday at 9:30 AM and 3:30 PM EDT",
      "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;BYHOUR=9,15;BYMINUTE=30",
    ],
  ];

  test.each(cases)("%s", (text, ruleStr) => {
    const rule = make(ruleStr);
    expect(rule.toText().toLowerCase()).toBe(text.toLowerCase());
  })
 });


describe("RRuleTemporal.toText", () => {
  test("daily rule", () => {
    const rule = new RRuleTemporal({
      freq: "DAILY",
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(rule.toText()).toBe("every day");
  });

  test("daily with hours", () => {
    const rule = new RRuleTemporal({
      freq: "DAILY",
      byHour: [10, 12, 17],
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(rule.toText()).toBe("every day at 10, 12 and 17");
  });

  test("weekly with byday and hours", () => {
    const rule = new RRuleTemporal({
      freq: "WEEKLY",
      byDay: ["SU"],
      byHour: [10, 12, 17],
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(rule.toText()).toBe("every week on Sunday at 10, 12 and 17");
  });

  test("weekdays shortcut", () => {
    const rule = new RRuleTemporal({
      freq: "WEEKLY",
      byDay: ["MO", "TU", "WE", "TH", "FR"],
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(rule.toText()).toBe("every weekday");
  });

  test("minutely interval", () => {
    const rule = new RRuleTemporal({
      freq: "MINUTELY",
      interval: 2,
      dtstart: zdt(2025, 1, 1, 0),
    });
    expect(rule.toText()).toBe("every 2 minutes");
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
    expect(rule.toText()).toBe("every week until November 10, 2012");

    const fmt: DateFormatter = (y, m, d) => `${d}. ${m}, ${y}`;
    expect(rule.toText(fmt)).toBe("every week until 10. November, 2012");
  });
});
