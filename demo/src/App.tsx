// App.tsx - Minimal demo playground for rrule-temporal

import React, { useEffect, useState } from "react";
import { RRuleTemporal } from "rrule-temporal";
import "@js-temporal/polyfill";

// Tailwind classes are assumed available. Adjust layout as needed.
//
const defaultICS = `DTSTART;TZID=UTC:20250101T120000\nRRULE:FREQ=WEEKLY;COUNT=30`;

export default function App() {
  const [ics, setIcs] = useState<string>(defaultICS);
  const [err, setErr] = useState<string | null>(null);
  const [ruleString, setRuleString] = useState<string>("");
  const [rows, setRows] = useState<
    {
      idx: number;
      dow: string;
      day: string;
      month: string;
      year: number;
      time: string;
      tz: string;
    }[]
  >([]);

  useEffect(() => {
    try {
      const rule = new RRuleTemporal({ rruleString: ics.trim() });
      setRuleString(rule.toString());

      // enumerate first 30 occurrences or up to COUNT
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
      const newRows = list.map((dt, i) => {
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
      setRows(newRows);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
      setRows([]);
      setRuleString("");
    }
  }, [ics]);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <h1 className="text-2xl font-bold mb-4">rrule-temporal Playground</h1>
      <div className="grid md:grid-cols-2 gap-6">
        {/* Input */}
        <div>
          <h2 className="text-xl font-semibold mb-2">Input</h2>
          <textarea
            className="w-full h-64 border rounded p-2 font-mono text-sm shadow"
            value={ics}
            onChange={(e) => setIcs(e.target.value)}
          />
          {err && <p className="mt-2 text-red-600 text-sm">{err}</p>}
        </div>

        {/* Output */}
        <div>
          <h2 className="text-xl font-semibold mb-2">Output</h2>
          {ruleString && (
            <pre className="bg-white p-2 border rounded mb-4 text-sm overflow-auto whitespace-pre-wrap">
              {ruleString}
            </pre>
          )}
          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto border rounded bg-white shadow">
            <table className="min-w-full text-sm text-left">
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
                    className={r.idx % 2 === 0 ? "bg-gray-50" : undefined}
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
        Built with <code>rrule-temporal</code> & Temporal API.
      </footer>
    </div>
  );
}
