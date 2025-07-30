// App.tsx – visual + text editor playground for rrule-temporal (BYHOUR + TZID)
// --------------------------------------------------------------------------------
// – Toggle between a textarea (raw DTSTART/RRULE) and a visual form.
// – Visual now supports TZID **and** multiple BYHOUR selections (0-23).
// – Changing either view keeps both in sync.
// – TailwindCSS v4 (preflight/utilities) assumed.
// --------------------------------------------------------------------------------
// Set to use local package
import {useEffect, useMemo, useState} from 'react';
import {Temporal} from '@js-temporal/polyfill';
import {RRuleTemporal} from 'rrule-temporal';
import {toText} from 'rrule-temporal/totext';

const defaultICS = `DTSTART;TZID=UTC:20250101T120000\nRRULE:FREQ=WEEKLY;BYHOUR=12;COUNT=30`;

type Mode = 'visual' | 'raw';

const hourLabels = Array.from({length: 24}, (_, h) => h);
const tzOptions = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
];
const freqOpts = ['YEARLY', 'MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY', 'MINUTELY', 'SECONDLY'] as const;
const langOpts = ['en', 'es', 'hi', 'yue', 'ar', 'he', 'zh'] as const;
const langLabels: {[key in (typeof langOpts)[number]]: string} = {
  en: 'English',
  es: 'Spanish',
  hi: 'Hindi',
  yue: 'Cantonese',
  ar: 'Arabic',
  he: 'Hebrew',
  zh: 'Chinese',
};
const dowTokens = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
const toDateInput = (zdt: Temporal.ZonedDateTime) => `${zdt.year}-${pad(zdt.month)}-${pad(zdt.day)}`;
const toTimeInput = (zdt: Temporal.ZonedDateTime) => `${pad(zdt.hour)}:${pad(zdt.minute)}:${pad(zdt.second)}`;

export default function App() {
  // -------- shared state ----------------------------------------------------
  const [mode, setMode] = useState<Mode>('visual');
  const [ics, setIcs] = useState(defaultICS);
  const [err, setErr] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [lang, setLang] = useState('en');

  // Apply dark mode to document
  useEffect(() => {
    const root = document.documentElement;
    let styleEl = document.getElementById('dynamic-theme-styles');

    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'dynamic-theme-styles';
      document.head.appendChild(styleEl);
    }

    if (darkMode) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
      styleEl.textContent = `
        body { background-color: #111827; color: #f9fafb; }
        input, textarea, select { background-color: #1f2937; color: #f9fafb; border-color: #4b5563; }
        input:focus, textarea:focus, select:focus { border-color: #6b7280; }
        button { background-color: #1f2937; color: #f9fafb; border-color: #4b5563; }
        button:hover { background-color: #374151; }
        .bg-blue-600 { background-color: #2563eb !important; }
        .bg-white { background-color: #1f2937 !important; }
        .text-black { color: #f9fafb !important; }
        table { background-color: #1f2937; }
        th { background-color: #374151; }
        td { border-color: #4b5563; }
        tr:nth-child(even) { background-color: #1f2937; }
        tr:nth-child(odd) { background-color: #111827; }
        pre { background-color: #1f2937; border-color: #4b5563; }
        .text-blue-700 { color: #60a5fa; }
        .text-red-600 { color: #f87171; }
        .text-gray-500 { color: #9ca3af; }
      `;
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
      styleEl.textContent = `
        body { background-color: #ffffff; color: #111827; }
        input, textarea, select { background-color: #ffffff; color: #111827; border-color: #d1d5db; }
        input:focus, textarea:focus, select:focus { border-color: #9ca3af; }
        button { background-color: #ffffff; color: #111827; border-color: #d1d5db; }
        button:hover { background-color: #f9fafb; }
        .bg-blue-600 { background-color: #2563eb !important; }
        .bg-white { background-color: #ffffff !important; }
        .text-black { color: #111827 !important; }
        table { background-color: #ffffff; }
        th { background-color: #f9fafb; }
        td { border-color: #d1d5db; }
        tr:nth-child(even) { background-color: #f9fafb; }
        tr:nth-child(odd) { background-color: #ffffff; }
        pre { background-color: #f9fafb; border-color: #d1d5db; }
        .text-blue-700 { color: #1d4ed8; }
        .text-red-600 { color: #dc2626; }
        .text-gray-500 { color: #6b7280; }
      `;
    }
  }, [darkMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const styleElement = document.getElementById('dynamic-theme-styles');
      if (styleElement) {
        styleElement.remove();
      }
    };
  }, []);

  // -------- derived rule + occurrences -------------------------------------
  const {ruleString, ruleText, rows} = useMemo(() => {
    try {
      const rule = new RRuleTemporal({rruleString: ics.trim()});
      const fmt = new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      });
      const rows = rule
        .all((_, i) => i < 30)
        .map((dt, i) => {
          const parts = fmt.formatToParts(new Date(dt.toInstant().epochMilliseconds));
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
      return {ruleString: rule.toString(), ruleText: toText(rule, lang), rows};
    } catch (e) {
      setErr((e as Error).message);
      return {ruleString: '', ruleText: '', rows: []};
    }
  }, [ics, lang]);

  // -------- VISUAL form state ----------------------------------------------
  const [freq, setFreq] = useState<string>('WEEKLY');
  const [count, setCount] = useState(30);
  const [tzid, setTzid] = useState('UTC');
  const [dtDate, setDtDate] = useState('2025-01-01');
  const [dtTime, setDtTime] = useState('12:00:00');
  const [byDay, setByDay] = useState<string[]>([]);
  const [byHour, setByHour] = useState<number[]>([12]);
  const [interval, setInterval] = useState(1);
  const [untilDate, setUntilDate] = useState('');
  const [untilTime, setUntilTime] = useState('00:00:00');
  const [byMinuteStr, setByMinuteStr] = useState('');
  const [bySecondStr, setBySecondStr] = useState('');
  const [byMonthStr, setByMonthStr] = useState('');
  const [byMonthDayStr, setByMonthDayStr] = useState('');
  const [byYearDayStr, setByYearDayStr] = useState('');
  const [byWeekNoStr, setByWeekNoStr] = useState('');
  const [bySetPosStr, setBySetPosStr] = useState('');
  const [wkst, setWkst] = useState('');
  const [rDateStr, setRDateStr] = useState('');
  const [exDateStr, setExDateStr] = useState('');
  const [maxIterations, setMaxIterations] = useState(10000);
  const [includeDtstart, setIncludeDtstart] = useState(false);

  // --- sync visual controls from raw ics when entering visual ---------------
  useEffect(() => {
    if (mode !== 'visual') return;
    try {
      const opts = new RRuleTemporal({rruleString: ics.trim()}).options();
      setFreq(opts.freq);
      setInterval(opts.interval ?? 1);
      setCount(opts.count ?? 30);
      setUntilDate(opts.until ? toDateInput(opts.until) : '');
      setUntilTime(opts.until ? toTimeInput(opts.until) : '00:00:00');
      setTzid(opts.tzid ?? opts.dtstart.timeZoneId);
      setDtDate(toDateInput(opts.dtstart));
      setDtTime(toTimeInput(opts.dtstart));
      setByDay(opts.byDay ?? []);
      setByHour(opts.byHour ?? (['MINUTELY', 'SECONDLY'].includes(opts.freq) ? [] : [opts.dtstart.hour]));
      setByMinuteStr(opts.byMinute ? opts.byMinute.join(',') : '');
      setBySecondStr(opts.bySecond ? opts.bySecond.join(',') : '');
      setByMonthStr(opts.byMonth ? opts.byMonth.join(',') : '');
      setByMonthDayStr(opts.byMonthDay ? opts.byMonthDay.join(',') : '');
      setByYearDayStr(opts.byYearDay ? opts.byYearDay.join(',') : '');
      setByWeekNoStr(opts.byWeekNo ? opts.byWeekNo.join(',') : '');
      setBySetPosStr(opts.bySetPos ? opts.bySetPos.join(',') : '');
      setWkst(opts.wkst ?? '');
      setRDateStr(opts.rDate ? opts.rDate.map((d) => `${toDateInput(d)}T${toTimeInput(d)}`).join(',') : '');
      setExDateStr(opts.exDate ? opts.exDate.map((d) => `${toDateInput(d)}T${toTimeInput(d)}`).join(',') : '');
      setMaxIterations(opts.maxIterations ?? 10000);
      setIncludeDtstart(opts.includeDtstart ?? false);
    } catch (e) {
      /* ignore parse failure */
      console.log(e);
    }
  }, [mode]);

  // --- rebuild ics when visual state changes --------------------------------
  useEffect(() => {
    if (mode !== 'visual') return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dtDate)) return;
    if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(dtTime)) return;
    try {
      const [y, m, d] = dtDate.split('-').map(Number);
      const [hh, mm, ss] = dtTime.split(':').map(Number);
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
            year: Number(untilDate.split('-')[0]),
            month: Number(untilDate.split('-')[1]),
            day: Number(untilDate.split('-')[2]),
            hour: Number(untilTime.split(':')[0] || 0),
            minute: Number(untilTime.split(':')[1] || 0),
            second: Number(untilTime.split(':')[2] || 0),
            timeZone: tzid,
          })
        : undefined;

      const numList = (str: string) =>
        str.trim()
          ? str
              .split(/\s*,\s*/)
              .map((n) => parseInt(n, 10))
              .filter((n) => !isNaN(n))
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
              out.push(Temporal.PlainDateTime.from(p).toZonedDateTime(tzid));
            } catch {
              /* ignore */
            }
          }
        }
        return out.length ? out : undefined;
      };
      const rule = new RRuleTemporal({
        freq: freq as 'YEARLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'HOURLY' | 'MINUTELY' | 'SECONDLY',
        interval,
        count: count || undefined,
        until,
        dtstart,
        tzid,
        maxIterations,
        includeDtstart,
        byDay: byDay.length ? byDay : undefined,
        byHour: ['MINUTELY', 'SECONDLY'].includes(freq)
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
    setByDay((prev) => (prev.includes(tok) ? prev.filter((t) => t !== tok) : [...prev, tok]));
  const toggleHour = (h: number) =>
    setByHour((prev) => (prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]));

  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen p-2 sm:p-4 text-sm">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">
          <a
            href="https://github.com/ggaabe/rrule-temporal"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline text-blue-700"
          >
            rrule-temporal
          </a>{' '}
          Playground
        </h1>

        {/* Dark mode toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 rounded-lg border hover:bg-gray-100 transition-colors self-end sm:self-auto"
          aria-label="Toggle dark mode"
        >
          {darkMode ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
            </svg>
          )}
        </button>
      </div>

      {/* mode switch */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['visual', 'raw'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 rounded border ${mode === m ? 'bg-blue-600 text-white' : 'bg-white text-black'}`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ───────── INPUT COLUMN ───────── */}
        <div>
          <h2 className="text-xl font-semibold mb-2">Input</h2>

          {mode === 'raw' ? (
            <textarea
              className="w-full h-48 sm:h-64 border rounded p-2 font-mono text-xs shadow"
              value={ics}
              onChange={(e) => setIcs(e.target.value)}
            />
          ) : (
            <div className="space-y-3">
              {/* FREQ */}
              <div>
                <label className="font-medium block mb-2">Frequency:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {freqOpts.map((f) => (
                    <label key={f} className="inline-flex items-center">
                      <input
                        type="radio"
                        name="freq"
                        className="mr-1"
                        checked={freq === f}
                        onChange={() => setFreq(f)}
                      />
                      <span className="text-xs sm:text-sm">{f.charAt(0) + f.slice(1).toLowerCase()}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* DTSTART date/time */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">Start:</label>
                <div className="flex gap-2 flex-1">
                  <input
                    type="date"
                    className="border rounded p-1 flex-1 [color-scheme:light] dark:[color-scheme:dark]"
                    value={dtDate}
                    onChange={(e) => setDtDate(e.target.value)}
                  />
                  <input
                    type="time"
                    step="1"
                    className="border rounded p-1 flex-1 [color-scheme:light] dark:[color-scheme:dark]"
                    value={dtTime}
                    onChange={(e) => setDtTime(e.target.value)}
                  />
                </div>
              </div>

              {/* TZID */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">TZID:</label>
                <select value={tzid} onChange={(e) => setTzid(e.target.value)} className="border rounded p-1 flex-1">
                  {tzOptions.map((tz) => (
                    <option key={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              {/* COUNT */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">Count:</label>
                <input
                  type="number"
                  min={0}
                  defaultValue={count}
                  onChange={(e) => setCount(parseInt(e.target.value) || 0)}
                  className="border rounded p-1 w-full sm:w-24"
                />
              </div>

              {/* BYDAY */}
              <div>
                <label className="font-medium block mb-2">By Weekday:</label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {dowTokens.map((tok) => (
                    <label key={tok} className="inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={byDay.includes(tok)}
                        onChange={() => toggleDay(tok)}
                        className="mr-1"
                      />
                      <span className="text-xs sm:text-sm">{tok}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* BYHOUR */}
              <div>
                <label className="font-medium block mb-2">By Hour:</label>
                <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-1">
                  {hourLabels.map((h) => (
                    <label key={h} className="inline-flex items-center text-xs">
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
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">Interval:</label>
                <input
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) => setInterval(parseInt(e.target.value) || 1)}
                  className="border rounded p-1 w-full sm:w-24"
                />
              </div>

              {/* UNTIL */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">Until:</label>
                <div className="flex gap-2 flex-1">
                  <input
                    type="date"
                    className="border rounded p-1 flex-1 [color-scheme:light] dark:[color-scheme:dark]"
                    value={untilDate}
                    onChange={(e) => setUntilDate(e.target.value)}
                  />
                  <input
                    type="time"
                    step="1"
                    className="border rounded p-1 flex-1 [color-scheme:light] dark:[color-scheme:dark]"
                    value={untilTime}
                    onChange={(e) => setUntilTime(e.target.value)}
                  />
                </div>
              </div>

              {/* BYMINUTE */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">By Minute:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={byMinuteStr}
                  onChange={(e) => setByMinuteStr(e.target.value)}
                />
              </div>

              {/* BYSECOND */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">By Second:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={bySecondStr}
                  onChange={(e) => setBySecondStr(e.target.value)}
                />
              </div>

              {/* BYMONTH */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">By Month:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={byMonthStr}
                  onChange={(e) => setByMonthStr(e.target.value)}
                />
              </div>

              {/* BYMONTHDAY */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">By Mo.Day:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={byMonthDayStr}
                  onChange={(e) => setByMonthDayStr(e.target.value)}
                />
              </div>

              {/* BYYEARDAY */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">By Yr.Day:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={byYearDayStr}
                  onChange={(e) => setByYearDayStr(e.target.value)}
                />
              </div>

              {/* BYWEEKNO */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">By WeekNo:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={byWeekNoStr}
                  onChange={(e) => setByWeekNoStr(e.target.value)}
                />
              </div>

              {/* BYSETPOS */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">By SetPos:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={bySetPosStr}
                  onChange={(e) => setBySetPosStr(e.target.value)}
                />
              </div>

              {/* WKST */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">WKST:</label>
                <select value={wkst} onChange={(e) => setWkst(e.target.value)} className="border rounded p-1 flex-1">
                  <option value="">(none)</option>
                  {dowTokens.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* RDATE */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">RDATE:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={rDateStr}
                  onChange={(e) => setRDateStr(e.target.value)}
                />
              </div>

              {/* EXDATE */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">EXDATE:</label>
                <input
                  type="text"
                  className="border rounded p-1 flex-1"
                  value={exDateStr}
                  onChange={(e) => setExDateStr(e.target.value)}
                />
              </div>

              {/* MAX ITER */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">Max Iter:</label>
                <input
                  type="number"
                  min={1}
                  className="border rounded p-1 w-full sm:w-24"
                  value={maxIterations}
                  onChange={(e) => setMaxIterations(parseInt(e.target.value) || 1)}
                />
              </div>

              {/* INCLUDE DTSTART */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label className="font-medium sm:w-20">Include DT:</label>
                <input type="checkbox" checked={includeDtstart} onChange={(e) => setIncludeDtstart(e.target.checked)} />
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
                <input type="checkbox" checked={includeDtstart} onChange={(e) => setIncludeDtstart(e.target.checked)} />
              </div>
            </div>
          )}

          {err && <p className="mt-2 text-red-600 text-xs">{err}</p>}
        </div>

        {/* ───────── OUTPUT COLUMN ───────── */}
        <div className="lg:ml-1">
          <h2 className="text-xl font-semibold mb-2">Output</h2>
          <div className="mb-2 flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="font-medium">Language:</label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="border rounded p-1 w-full sm:w-auto"
            >
              {langOpts.map((l) => (
                <option key={l} value={l}>
                  {langLabels[l]}
                </option>
              ))}
            </select>
          </div>
          {ruleText && <p className="mb-2 italic text-sm">{ruleText}</p>}
          {ruleString && (
            <pre className="p-2 border rounded mb-4 text-xs whitespace-pre-wrap overflow-auto max-h-32 sm:max-h-none">
              {ruleString}
            </pre>
          )}

          <div className="overflow-x-auto max-h-[20rem] sm:max-h-[28rem] overflow-y-auto border rounded shadow text-xs">
            <table className="min-w-full">
              <thead className="sticky top-0">
                <tr>
                  <th className="px-1 sm:px-2 py-1 border text-xs">#</th>
                  <th className="px-1 sm:px-2 py-1 border text-xs">Day</th>
                  <th className="px-1 sm:px-2 py-1 border text-xs">Date</th>
                  <th className="px-1 sm:px-2 py-1 border text-xs">Time</th>
                  <th className="px-1 sm:px-2 py-1 border text-xs">TZ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.idx} className={r.idx % 2 ? '' : undefined}>
                    <td className="px-1 sm:px-2 border text-center text-xs">{r.idx}</td>
                    <td className="px-1 sm:px-2 border text-xs">{r.dow}</td>
                    <td className="px-1 sm:px-2 border text-xs">{`${r.day} ${r.month} ${r.year}`}</td>
                    <td className="px-1 sm:px-2 border text-xs">{r.time}</td>
                    <td className="px-1 sm:px-2 border text-xs">{r.tz}</td>
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
