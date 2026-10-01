import {useMemo, useState} from 'react';
import {intlCalendarForRscale, occurrencePage, showsSeconds, type Rule, type RuleOptions, type Zdt} from '../lib/rule';
import {
  formatCalendarDate,
  formatDate,
  formatGap,
  formatMilliseconds,
  formatMonth,
  formatMonthDay,
  formatOffset,
  formatTime,
  formatWeekday,
  formatZoneName,
} from '../lib/format';
import {Badge, Button, ErrorNote} from './ui';

const PAGE_SIZE = 100;
const MAX_ROWS = 10_000;

interface Row {
  key: string;
  index: number;
  month: string;
  weekday: string;
  day: string;
  time: string;
  zoneName: string;
  offset: string;
  offsetChanged: boolean;
  gap: string | null;
  calendarDate: string | null;
  isRDate: boolean;
  isDtstart: boolean;
}

function toRows(dates: Zdt[], options: RuleOptions, zone: string): Row[] {
  const seconds = showsSeconds(options);
  const rDates = new Set(options.rDate?.map((date) => date.epochNanoseconds));
  const dtstart = options.dtstart.epochNanoseconds;
  const calendar = options.rscale ? intlCalendarForRscale[options.rscale] : undefined;
  let previous: Zdt | undefined;
  return dates.map((date, index) => {
    const ms = date.epochMilliseconds;
    const offset = formatOffset(date, zone);
    const row: Row = {
      key: date.epochNanoseconds.toString(),
      index: index + 1,
      month: formatMonth(ms, zone),
      weekday: formatWeekday(ms, zone),
      day: formatMonthDay(ms, zone),
      time: formatTime(ms, zone, seconds),
      zoneName: formatZoneName(ms, zone),
      offset,
      offsetChanged: previous !== undefined && formatOffset(previous, zone) !== offset,
      gap: previous ? formatGap(ms - previous.epochMilliseconds) : null,
      calendarDate: calendar && calendar !== 'gregory' ? formatCalendarDate(ms, zone, calendar) : null,
      isRDate: rDates.has(date.epochNanoseconds),
      isDtstart: date.epochNanoseconds === dtstart,
    };
    previous = date;
    return row;
  });
}

export function OccurrenceList({rule, options, zone}: {rule: Rule; options: RuleOptions; zone: string}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const page = useMemo(() => occurrencePage(rule, limit), [rule, limit]);
  const groups = useMemo(() => {
    const result: Array<{month: string; rows: Row[]}> = [];
    for (const row of toRows(page.dates, options, zone)) {
      const last = result.at(-1);
      if (last?.month === row.month) last.rows.push(row);
      else result.push({month: row.month, rows: [row]});
    }
    return result;
  }, [page, options, zone]);
  const excluded = options.exDate ?? [];

  if (page.error) return <ErrorNote>{page.error}</ErrorNote>;

  return (
    <div className="animate-fade-in space-y-3">
      {page.dates.length === 0 ? (
        <p className="rounded-lg bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500 dark:bg-zinc-950/40 dark:text-zinc-400">
          This rule has no occurrences.
        </p>
      ) : (
        <div className="max-h-[36rem] overflow-y-auto rounded-lg ring-1 ring-zinc-950/5 [scrollbar-width:thin] dark:ring-white/10">
          {groups.map((group) => (
            <section key={`${group.month}-${group.rows[0]!.key}`}>
              <h3 className="sticky top-0 z-10 flex items-baseline justify-between bg-white px-3 py-2 text-xs font-semibold dark:bg-zinc-900">
                {group.month}
                <span className="font-normal text-zinc-400 tabular-nums">{group.rows.length.toLocaleString()}</span>
              </h3>
              <ol>
                {group.rows.map((row) => (
                  <li
                    key={row.key}
                    className="grid grid-cols-[2.75rem_6.5rem_minmax(0,1fr)_auto] items-center gap-x-2 border-t border-zinc-950/5 px-3 py-2 text-sm tabular-nums dark:border-white/5"
                  >
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{row.index.toLocaleString()}</span>
                    <span className="truncate">
                      <span className="font-medium">{row.weekday}</span>{' '}
                      <span className="text-zinc-500 dark:text-zinc-400">{row.day}</span>
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span>{row.time}</span>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">{row.zoneName}</span>
                      {row.calendarDate && (
                        <span className="text-xs text-indigo-600 dark:text-indigo-300">{row.calendarDate}</span>
                      )}
                      {row.offsetChanged && (
                        <Badge
                          tone="amber"
                          title="The UTC offset changed since the previous occurrence, usually for daylight saving time."
                        >
                          {row.offset}
                        </Badge>
                      )}
                      {row.isDtstart && (
                        <Badge tone="accent" title="This occurrence is DTSTART.">
                          DTSTART
                        </Badge>
                      )}
                      {row.isRDate && (
                        <Badge tone="emerald" title="Added by RDATE.">
                          RDATE
                        </Badge>
                      )}
                    </span>
                    <span
                      className="text-right text-xs text-zinc-400 dark:text-zinc-500"
                      title="Exact time since the previous occurrence"
                    >
                      {row.gap}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
          {page.hasMore ? (
            <>
              First {page.dates.length.toLocaleString()} occurrences
              {options.count === undefined && !options.until ? ', and the rule never ends' : ''}
            </>
          ) : (
            <>All {page.dates.length.toLocaleString()} occurrences</>
          )}{' '}
          · generated in {formatMilliseconds(page.milliseconds)}
        </p>
        {page.hasMore && (
          <div className="flex gap-2">
            {limit < MAX_ROWS ? (
              <>
                <Button size="sm" onClick={() => setLimit((value) => Math.min(value + PAGE_SIZE, MAX_ROWS))}>
                  Show 100 more
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLimit((value) => Math.min(value + 1_000, MAX_ROWS))}
                >
                  +1,000
                </Button>
              </>
            ) : (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Use the calendar or Query API for later dates.
              </span>
            )}
          </div>
        )}
      </div>

      {excluded.length > 0 && (
        <p className="text-xs text-pretty text-zinc-500 dark:text-zinc-400">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">Excluded by EXDATE:</span>{' '}
          {excluded
            .map((date) => `${formatDate(date.epochMilliseconds, zone)} ${formatTime(date.epochMilliseconds, zone)}`)
            .join(' · ')}
        </p>
      )}
    </div>
  );
}
