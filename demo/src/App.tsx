// App.tsx – visual + text editor playground for rrule-temporal (BYHOUR + TZID)
// --------------------------------------------------------------------------------
// – Toggle between a textarea (raw DTSTART/RRULE) and a visual form.
// – Visual now supports TZID **and** multiple BYHOUR selections (0-23).
// – Changing either view keeps both in sync.
// – TailwindCSS v4 (preflight/utilities) assumed.
// --------------------------------------------------------------------------------
// Set to use local package
import { useEffect, useMemo, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { RRuleTemporal } from "rrule-temporal";
import { toText } from "rrule-temporal/totext";

const defaultICS = `DTSTART;TZID=UTC:20250101T120000\nRRULE:FREQ=WEEKLY;BYHOUR=12;COUNT=30`;

type Mode = "visual" | "raw";

const hourLabels = Array.from({ length: 24 }, (_, h) => h);
const tzOptions = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
];
const freqOpts = [
  "YEARLY",
  "MONTHLY",
  "WEEKLY",
  "DAILY",
  "HOURLY",
  "MINUTELY",
  "SECONDLY",
] as const;
const dowTokens = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
const toDateInput = (zdt: Temporal.ZonedDateTime) =>
  `${zdt.year}-${pad(zdt.month)}-${pad(zdt.day)}`;
const toTimeInput = (zdt: Temporal.ZonedDateTime) =>
  `${pad(zdt.hour)}:${pad(zdt.minute)}:${pad(zdt.second)}`;

export default function App() {
  // -------- shared state ----------------------------------------------------
  const [mode, setMode] = useState<Mode>("visual");
  const [ics, setIcs] = useState(defaultICS);
  const [err, setErr] = useState<string | null>(null);

  // -------- derived rule + occurrences -------------------------------------
  const { ruleString, ruleText, rows } = useMemo(() => {
    try {
      const rule = new RRuleTemporal({ rruleString: ics.trim() });
      const fmt = new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });
      const rows = rule
        .all((_, i) => i < 30)
        .map((dt, i) => {
          const parts = fmt.formatToParts(
            new Date(dt.toInstant().epochMilliseconds)
          );
          const bag: Record<string, string> = {};
          parts.forEach((p) => (bag[p.type] = p.value));
          return {
            idx: i + 1,
            dow: bag.weekday,
            day: bag.day,
            month: bag.month,
            year: Number(bag.year),
            time: `${bag.hour}:${bag.minute}:${bag.second}`,
            tz: bag.timeZoneName,
          };
        });
      setErr(null);
      return { ruleString: rule.toString(), ruleText: toText(rule), rows };
    } catch (e) {
      setErr((e as Error).message);
      return { ruleString: "", ruleText: "", rows: [] };
    }
  }, [ics]);

  // -------- VISUAL form state ----------------------------------------------
  const [freq, setFreq] = useState<string>("WEEKLY");
  const [count, setCount] = useState(30);
  const [tzid, setTzid] = useState("UTC");
  const [dtDate, setDtDate] = useState("2025-01-01");
  const [dtTime, setDtTime] = useState("12:00:00");
  const [byDay, setByDay] = useState<string[]>([]);
  const [byHour, setByHour] = useState<number[]>([12]);
  const [interval, setInterval] = useState(1);
  const [untilDate, setUntilDate] = useState("");
  const [untilTime, setUntilTime] = useState("00:00:00");
  const [byMinuteStr, setByMinuteStr] = useState("");
  const [bySecondStr, setBySecondStr] = useState("");
  const [byMonthStr, setByMonthStr] = useState("");
  const [byMonthDayStr, setByMonthDayStr] = useState("");
  const [byYearDayStr, setByYearDayStr] = useState("");
  const [byWeekNoStr, setByWeekNoStr] = useState("");
  const [bySetPosStr, setBySetPosStr] = useState("");
  const [wkst, setWkst] = useState("");
  const [rDateStr, setRDateStr] = useState("");
  const [exDateStr, setExDateStr] = useState("");
  const [maxIterations, setMaxIterations] = useState(10000);
  const [includeDtstart, setIncludeDtstart] = useState(false);

  // --- sync visual controls from raw ics when entering visual ---------------
  useEffect(() => {
    if (mode !== "visual") return;
    try {
      const opts = new RRuleTemporal({ rruleString: ics.trim() }).options();
      setFreq(opts.freq);
      setInterval(opts.interval ?? 1);
      setCount(opts.count ?? 30);
      setUntilDate(opts.until ? toDateInput(opts.until) : "");
      setUntilTime(opts.until ? toTimeInput(opts.until) : "00:00:00");
      setTzid(opts.tzid ?? opts.dtstart.timeZoneId);
      setDtDate(toDateInput(opts.dtstart));
      setDtTime(toTimeInput(opts.dtstart));
      setByDay(opts.byDay ?? []);
      setByHour(
        opts.byHour ??
          (["MINUTELY", "SECONDLY"].includes(opts.freq)
            ? []
            : [opts.dtstart.hour])
      );
      setByMinuteStr(opts.byMinute ? opts.byMinute.join(",") : "");
      setBySecondStr(opts.bySecond ? opts.bySecond.join(",") : "");
      setByMonthStr(opts.byMonth ? opts.byMonth.join(",") : "");
      setByMonthDayStr(opts.byMonthDay ? opts.byMonthDay.join(",") : "");
      setByYearDayStr(opts.byYearDay ? opts.byYearDay.join(",") : "");
      setByWeekNoStr(opts.byWeekNo ? opts.byWeekNo.join(",") : "");
      setBySetPosStr(opts.bySetPos ? opts.bySetPos.join(",") : "");
      setWkst(opts.wkst ?? "");
      setRDateStr(
        opts.rDate ? opts.rDate.map((d) => `${toDateInput(d)}T${toTimeInput(d)}`).join(",") : ""
      );
      setExDateStr(
        opts.exDate ? opts.exDate.map((d) => `${toDateInput(d)}T${toTimeInput(d)}`).join(",") : ""
      );
      setMaxIterations(opts.maxIterations ?? 10000);
      setIncludeDtstart(opts.includeDtstart ?? false);
    } catch (e) {
      /* ignore parse failure */
      console.log(e);
    }
  }, [mode, ics]);

  // --- rebuild ics when visual state changes --------------------------------
  useEffect(() => {
    if (mode !== "visual") return;
    try {
      const [y, m, d] = dtDate.split("-").map(Number);
      const [hh, mm, ss] = dtTime.split(":").map(Number);
      const dtstart = Temporal.ZonedDateTime.from({
        year: y,
        month: m,
        day: d,
        hour: hh,
        minute: mm,
        second: ss ?? 0,
        timeZone: tzid,
      });
      const until = untilDate
        ? Temporal.ZonedDateTime.from({
            year: Number(untilDate.split("-")[0]),
            month: Number(untilDate.split("-")[1]),
            day: Number(untilDate.split("-")[2]),
            hour: Number(untilTime.split(":")[0] || 0),
            minute: Number(untilTime.split(":")[1] || 0),
            second: Number(untilTime.split(":")[2] || 0),
            timeZone: tzid,
          })
        : undefined;

      const numList = (str: string) =>
        str.trim()
          ? str.split(/\s*,\s*/).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n))
          : undefined;
      const dateList = (str: string): Temporal.ZonedDateTime[] | undefined => {
        if (!str.trim()) return undefined;
        const parts = str.split(/\s*,\s*/);
        const out: Temporal.ZonedDateTime[] = [];
        for (const p of parts) {
          try {
            out.push(Temporal.ZonedDateTime.from(p));
          } catch {
            try {
              out.push(
                Temporal.PlainDateTime.from(p).toZonedDateTime({ timeZone: tzid })
              );
            } catch {
              /* ignore */
            }
          }
        }
        return out.length ? out : undefined;
      };
      const rule = new RRuleTemporal({
        freq: freq as
          | "YEARLY"
          | "MONTHLY"
          | "WEEKLY"
          | "DAILY"
          | "HOURLY"
          | "MINUTELY"
          | "SECONDLY",
        interval,
        count,
        until,
        dtstart,
        tzid,
        maxIterations,
        includeDtstart,
        byDay: byDay.length ? byDay : undefined,
        byHour: ["MINUTELY", "SECONDLY"].includes(freq)
          ? undefined
          : byHour.length
          ? [...byHour].sort((a, b) => a - b)
          : undefined,
        byMinute: numList(byMinuteStr),
        bySecond: numList(bySecondStr),
        byMonth: numList(byMonthStr),
        byMonthDay: numList(byMonthDayStr),
        byYearDay: numList(byYearDayStr),
        byWeekNo: numList(byWeekNoStr),
        bySetPos: numList(bySetPosStr),
        wkst: wkst || undefined,
        rDate: dateList(rDateStr),
        exDate: dateList(exDateStr),
      });
      setIcs(rule.toString());
    } catch (e) {
      /* silent */
      console.log(e);
      setErr(e as string);
    }
  }, [
    mode,
    freq,
    interval,
    count,
    untilDate,
    untilTime,
    tzid,
    dtDate,
    dtTime,
    byDay,
    byHour,
    byMinuteStr,
    bySecondStr,
    byMonthStr,
    byMonthDayStr,
    byYearDayStr,
    byWeekNoStr,
    bySetPosStr,
    wkst,
    rDateStr,
    exDateStr,
    maxIterations,
    includeDtstart,
  ]);

  // helpers ------------------------------------------------------------------
  const toggleDay = (tok: string) =>
    setByDay((prev) =>
      prev.includes(tok) ? prev.filter((t) => t !== tok) : [...prev, tok]
    );
  const toggleHour = (h: number) =>
    setByHour((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]
    );

  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen p-4 text-sm">
      <h1 className="text-2xl font-bold mb-4">
        <a
          href="https://github.com/ggaabe/rrule-temporal"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline text-blue-700"
        >
          rrule-temporal
        </a>{" "}
        Playground
      </h1>

      {/* mode switch */}
      <div className="mb-4 space-x-2">
        {(["visual", "raw"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 rounded border ${
              mode === m ? "bg-blue-600 text-white" : "bg-white text-black"
            }`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1">
        {/* ───────── INPUT COLUMN ───────── */}
        <div>
          <h2 className="text-xl font-semibold mb-2">Input</h2>

          {mode === "raw" ? (
            <textarea
              className="w-full h-64 border rounded p-2 font-mono text-xs shadow"
              value={ics}
              onChange={(e) => setIcs(e.target.value)}
            />
          ) : (
            <div className="space-y-3">
              {/* FREQ */}
              <div>
                <label className="font-medium mr-2">Frequency:</label>
                {freqOpts.map((f) => (
                  <label key={f} className="mr-2 inline-flex items-center">
                    <input
                      type="radio"
                      name="freq"
                      className="mr-1"
                      checked={freq === f}
                      onChange={() => setFreq(f)}
                    />
                    {f.charAt(0) + f.slice(1).toLowerCase()}
                  </label>
                ))}
              </div>

              {/* DTSTART date/time */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">Start:</label>
                <input
                  type="date"
                  className="border rounded p-1"
                  value={dtDate}
                  onChange={(e) => setDtDate(e.target.value)}
                />
                <input
                  type="time"
                  step="1"
                  className="border rounded p-1"
                  value={dtTime}
                  onChange={(e) => setDtTime(e.target.value)}
                />
              </div>

              {/* TZID */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">TZID:</label>
                <select
                  value={tzid}
                  onChange={(e) => setTzid(e.target.value)}
                  className="border rounded p-1 flex-1"
                >
                  {tzOptions.map((tz) => (
                    <option key={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              {/* COUNT */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">Count:</label>
                <input
                  type="number"
                  min={1}
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                  className="border rounded p-1 w-24"
                />
              </div>

              {/* BYDAY */}
              <div>
                <label className="font-medium mr-2">By Weekday:</label>
                {dowTokens.map((tok) => (
                  <label key={tok} className="mr-2 inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={byDay.includes(tok)}
                      onChange={() => toggleDay(tok)}
                      className="mr-1"
                    />
                    {tok}
                  </label>
                ))}
              </div>

              {/* BYHOUR */}
              <div>
                <label className="font-medium mr-2 align-top">By Hour:</label>
                <div className="inline-grid grid-cols-12 gap-1">
                  {hourLabels.map((h) => (
                    <label key={h} className="inline-flex items-center">
                      <input
                        type="checkbox"
                        className="mr-1"
                        checked={byHour.includes(h)}
                        onChange={() => toggleHour(h)}
                      />
                      {pad(h)}
                    </label>
                  ))}
                </div>
              </div>

              {/* INTERVAL */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">Interval:</label>
                <input
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) => setInterval(parseInt(e.target.value) || 1)}
                  className="border rounded p-1 w-24"
                />
              </div>

              {/* UNTIL */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">Until:</label>
                <input
                  type="date"
                  className="border rounded p-1"
                  value={untilDate}
                  onChange={(e) => setUntilDate(e.target.value)}
                />
                <input
                  type="time"
                  step="1"
                  className="border rounded p-1"
                  value={untilTime}
                  onChange={(e) => setUntilTime(e.target.value)}
                />
              </div>

              {/* BYMINUTE */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">By Minute:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={byMinuteStr}
                  onChange={(e) => setByMinuteStr(e.target.value)}
                />
              </div>

              {/* BYSECOND */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">By Second:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={bySecondStr}
                  onChange={(e) => setBySecondStr(e.target.value)}
                />
              </div>

              {/* BYMONTH */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">By Month:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={byMonthStr}
                  onChange={(e) => setByMonthStr(e.target.value)}
                />
              </div>

              {/* BYMONTHDAY */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">By Mo.Day:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={byMonthDayStr}
                  onChange={(e) => setByMonthDayStr(e.target.value)}
                />
              </div>

              {/* BYYEARDAY */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">By Yr.Day:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={byYearDayStr}
                  onChange={(e) => setByYearDayStr(e.target.value)}
                />
              </div>

              {/* BYWEEKNO */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">By WeekNo:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={byWeekNoStr}
                  onChange={(e) => setByWeekNoStr(e.target.value)}
                />
              </div>

              {/* BYSETPOS */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">By SetPos:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={bySetPosStr}
                  onChange={(e) => setBySetPosStr(e.target.value)}
                />
              </div>

              {/* WKST */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">WKST:</label>
                <select
                  value={wkst}
                  onChange={(e) => setWkst(e.target.value)}
                  className="border rounded p-1 flex-1"
                >
                  <option value="">(none)</option>
                  {dowTokens.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* RDATE */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">RDATE:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={rDateStr}
                  onChange={(e) => setRDateStr(e.target.value)}
                />
              </div>

              {/* EXDATE */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">EXDATE:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={exDateStr}
                  onChange={(e) => setExDateStr(e.target.value)}
                />
              </div>

              {/* MAX ITER */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">Max Iter:</label>
                <input
                  type="number"
                  min={1}
                  className="border rounded p-1 w-24"
                  value={maxIterations}
                  onChange={(e) => setMaxIterations(parseInt(e.target.value) || 1)}
                />
              </div>

              {/* INCLUDE DTSTART */}
              <div className="flex items-center space-x-2">
                <label className="font-medium w-20">Include DT:</label>
                <input
                  type="checkbox"
                  checked={includeDtstart}
                  onChange={(e) => setIncludeDtstart(e.target.checked)}
                />
              </div>
            </div>
          )}

          {err && <p className="mt-2 text-red-600 text-xs">{err}</p>}
        </div>

        {/* ───────── OUTPUT COLUMN ───────── */}
        <div className="ml-1">
          <h2 className="text-xl font-semibold mb-2">Output</h2>
          {ruleText && <p className="mb-2 italic">{ruleText}</p>}
          {ruleString && (
            <pre className=" p-2 border rounded mb-4 text-xs whitespace-pre-wrap overflow-auto">
              {ruleString}
            </pre>
          )}

          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto border rounded shadow text-xs">
            <table className="min-w-full">
              <thead className="sticky top-0 ">
                <tr>
                  <th className="px-2 py-1 border">#</th>
                  <th className="px-2 py-1 border">Day</th>
                  <th className="px-2 py-1 border">Date</th>
                  <th className="px-2 py-1 border">Time</th>
                  <th className="px-2 py-1 border">TZ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.idx} className={r.idx % 2 ? "" : undefined}>
                    <td className="px-2 border text-center">{r.idx}</td>
                    <td className="px-2  border">{r.dow}</td>
                    <td className="px-2  border">{`${r.day} ${r.month} ${r.year}`}</td>
                    <td className="px-2  border">{r.time}</td>
                    <td className="px-2 border">{r.tz}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <footer className="mt-8 text-xs text-gray-500">
        Built with <code>rrule-temporal</code>, Temporal API & Tailwind v4.
      </footer>
    </div>
  );
}
