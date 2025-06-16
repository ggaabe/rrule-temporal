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
      return { ruleString: rule.toString(), ruleText: rule.toText(), rows };
    } catch (e: any) {
      setErr(e.message);
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

  // --- sync visual controls from raw ics when entering visual ---------------
  useEffect(() => {
    if (mode !== "visual") return;
    try {
      const opts = new RRuleTemporal({ rruleString: ics.trim() }).options();
      setFreq(opts.freq);
      setCount(opts.count ?? 30);
      setTzid(opts.tzid ?? opts.dtstart.timeZoneId);
      setDtDate(toDateInput(opts.dtstart));
      setDtTime(toTimeInput(opts.dtstart));
      setByDay(opts.byDay ?? []);
      setByHour(opts.byHour ?? [opts.dtstart.hour]);
    } catch {
      /* ignore parse failure */
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
      const rule = new RRuleTemporal({
        freq: freq as any,
        count,
        dtstart,
        tzid,
        byDay: byDay.length ? byDay : undefined,
        byHour: byHour.length ? [...byHour].sort((a, b) => a - b) : undefined,
      });
      setIcs(rule.toString());
    } catch {
      /* silent */
    }
  }, [mode, freq, count, tzid, dtDate, dtTime, byDay, byHour]);

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
