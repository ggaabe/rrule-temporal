// App.tsx – visual + text editor playground for rrule‑temporal
// -------------------------------------------------------------------
// • Toggle between a textarea (free‑form DTSTART/RRULE) and a visual form
// • When you edit in the form it regenerates the RRULE snippet
// • When you switch back to “Raw” the form is rebuilt from the snippet
// • Uses only native inputs (no extra deps) + Tailwind classes
// -------------------------------------------------------------------

import React, { useEffect, useMemo, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { RRuleTemporal } from "rrule-temporal";

const defaultICS = `DTSTART;TZID=UTC:20250101T120000\nRRULE:FREQ=WEEKLY;COUNT=30`;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
const toDateInput = (zdt: Temporal.ZonedDateTime) =>
  `${zdt.year}-${pad(zdt.month)}-${pad(zdt.day)}`;
const toTimeInput = (zdt: Temporal.ZonedDateTime) =>
  `${pad(zdt.hour)}:${pad(zdt.minute)}:${pad(zdt.second)}`;

// Map ISO weekday → RRULE tokens (MO…SU)
const dowTokens = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

type Mode = "raw" | "visual";
export default function App() {
  // -----------------------------------------------------------------------
  // Top‑level state
  // -----------------------------------------------------------------------
  const [mode, setMode] = useState<Mode>("visual");
  const [ics, setIcs] = useState<string>(defaultICS);
  const [err, setErr] = useState<string | null>(null);

  // derived: rule + occurrences ------------------------------------------------
  const { ruleString, rows } = useMemo(() => {
    try {
      const rule = new RRuleTemporal({ rruleString: ics.trim() });
      const list = rule.all((_, i) => i < 30);
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
      const rows = list.map((dt, i) => {
        const parts = fmt.formatToParts(
          new Date(dt.toInstant().epochMilliseconds)
        );
        const lookup: Record<string, string> = {};
        parts.forEach((p) => (lookup[p.type] = p.value));
        return {
          idx: i + 1,
          dow: lookup.weekday,
          day: lookup.day,
          month: lookup.month,
          year: Number(lookup.year),
          time: `${lookup.hour}:${lookup.minute}:${lookup.second}`,
          tz: lookup.timeZoneName,
        };
      });
      setErr(null);
      return { ruleString: rule.toString(), rows };
    } catch (e: any) {
      setErr(e.message);
      return { ruleString: "", rows: [] };
    }
  }, [ics]);

  // -----------------------------------------------------------------------
  // VISUAL → build state from ics when we enter visual mode
  // -----------------------------------------------------------------------
  const [freq, setFreq] = useState("WEEKLY");
  const [count, setCount] = useState(30);
  const [dtDate, setDtDate] = useState("2025-01-01");
  const [dtTime, setDtTime] = useState("12:00:00");
  const [tzid, setTzid] = useState("UTC");
  const [byDay, setByDay] = useState<string[]>([]); // ["MO", "WE"]

  // populate form on first switch to visual or when ics changes in raw mode
  useEffect(() => {
    if (mode !== "visual") return;
    try {
      const rule = new RRuleTemporal({ rruleString: ics.trim() });
      const opts = rule.options();
      setFreq(opts.freq);
      setCount(opts.count ?? 30);
      setTzid(opts.tzid ?? "UTC");
      const dt = opts.dtstart;
      setDtDate(toDateInput(dt));
      setDtTime(toTimeInput(dt));
      setByDay(opts.byDay ?? []);
    } catch (_) {
      // ignore parse error; keep previous visual values
    }
  }, [mode, ics]);

  // when visual controls change → regenerate DTSTART / RRULE
  useEffect(() => {
    if (mode !== "visual") return;
    try {
      const [h, m, s] = dtTime.split(":").map((x) => parseInt(x, 10));
      const [y, mo, d] = dtDate.split("-").map((x) => parseInt(x, 10));
      const dtstart = Temporal.ZonedDateTime.from({
        year: y,
        month: mo,
        day: d,
        hour: h,
        minute: m,
        second: s ?? 0,
        timeZone: tzid,
      });
      const rule = new RRuleTemporal({
        freq: freq as any,
        count,
        dtstart,
        tzid,
        byDay: byDay.length ? byDay : undefined,
      });
      setIcs(rule.toString());
    } catch (_) {
      /* silently ignore */
    }
  }, [mode, freq, count, dtDate, dtTime, tzid, byDay]);

  // helpers for checkbox handling
  const toggleDay = (tok: string) => {
    setByDay((prev) =>
      prev.includes(tok) ? prev.filter((d) => d !== tok) : [...prev, tok]
    );
  };

  // -----------------------------------------------------------------------
  // UI
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gray-50 p-4 text-sm">
      <h1 className="text-2xl font-bold mb-4">rrule‑temporal Playground</h1>

      {/* mode switch */}
      <div className="mb-4 space-x-4">
        <button
          className={`px-3 py-1 rounded border ${
            mode === "visual" ? "bg-blue-600 text-white" : "bg-white"
          }`}
          onClick={() => setMode("visual")}
        >
          Visual
        </button>
        <button
          className={`px-3 py-1 rounded border ${
            mode === "raw" ? "bg-blue-600 text-white" : "bg-white"
          }`}
          onClick={() => setMode("raw")}
        >
          Raw
        </button>
      </div>

      {/* main grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Input column */}
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
              {/* freq */}
              <div>
                <label className="font-medium mr-2">Frequency:</label>
                {[
                  "YEARLY",
                  "MONTHLY",
                  "WEEKLY",
                  "DAILY",
                  "HOURLY",
                  "MINUTELY",
                  "SECONDLY",
                ].map((f) => (
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

              {/* DTSTART */}
              <div className="flex space-x-2 items-center">
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
              <div className="flex space-x-2 items-center">
                <label className="font-medium w-20">TZID:</label>
                <select
                  className="border rounded p-1 flex-1"
                  value={tzid}
                  onChange={(e) => setTzid(e.target.value)}
                >
                  {[
                    "UTC",
                    "America/New_York",
                    "America/Chicago",
                    "America/Los_Angeles",
                    "Europe/London",
                    "Europe/Paris",
                    "Asia/Tokyo",
                  ].map((tz) => (
                    <option key={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              {/* Count */}
              <div className="flex space-x-2 items-center">
                <label className="font-medium w-20">Count:</label>
                <input
                  type="number"
                  min="1"
                  className="border rounded p-1 w-24"
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
                />
              </div>

              {/* BYDAY (checkboxes) */}
              <div>
                <label className="font-medium mr-2">By Weekday:</label>
                {dowTokens.map((tok, idx) => (
                  <label key={tok} className="mr-2 inline-flex items-center">
                    <input
                      type="checkbox"
                      className="mr-1"
                      checked={byDay.includes(tok)}
                      onChange={() => toggleDay(tok)}
                    />
                    {tok}
                  </label>
                ))}
              </div>
            </div>
          )}

          {err && <p className="mt-2 text-red-600 text-xs">{err}</p>}
        </div>

        {/* Output column */}
        <div>
          <h2 className="text-xl font-semibold mb-2">Output</h2>
          {ruleString && (
            <pre className="bg-white p-2 border rounded mb-4 text-xs overflow-auto whitespace-pre-wrap">
              {ruleString}
            </pre>
          )}

          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto border rounded bg-white shadow text-xs">
            <table className="min-w-full">
              <thead className="sticky top-0 bg-gray-100">
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
                  <tr
                    key={r.idx}
                    className={r.idx % 2 ? "bg-gray-50" : undefined}
                  >
                    <td className="px-2 py-1 border text-center">{r.idx}</td>
                    <td className="px-2 py-1 border">{r.dow}</td>
                    <td className="px-2 py-1 border">{`${r.day} ${r.month} ${r.year}`}</td>
                    <td className="px-2 py-1 border">{r.time}</td>
                    <td className="px-2 py-1 border">{r.tz}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <footer className="mt-8 text-xs text-gray-500">
        Built with <code>rrule‑temporal</code>, Temporal API & Tailwind v4.
      </footer>
    </div>
  );
}
