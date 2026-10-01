import {useMemo, useState} from 'react';
import {Temporal} from '@js-temporal/polyfill';
import {attempt, showsSeconds, timed, type Rule, type RuleOptions, type Zdt} from '../lib/rule';
import {formatMilliseconds, formatTime, formatZoneName} from '../lib/format';
import {cx} from '../lib/styles';
import {ChevronLeftIcon, ChevronRightIcon} from './icons';
import {Button, ErrorNote, IconButton} from './ui';

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthOf(date: Zdt, zone: string): Temporal.PlainYearMonth {
  return date.withTimeZone(zone).toPlainDate().toPlainYearMonth();
}

export function CalendarView({rule, options, zone}: {rule: Rule; options: RuleOptions; zone: string}) {
  const first = useMemo(() => attempt(() => rule.all((_, index) => index < 1)[0] ?? null), [rule]);
  const anchor = first.value ?? options.dtstart;
  const [month, setMonth] = useState(() => monthOf(anchor, zone));
  const [selected, setSelected] = useState<string | null>(null);
  const today = Temporal.Now.plainDateISO(zone);

  const result = useMemo(() => {
    if (options.freq === 'SECONDLY') {
      return {
        value: null,
        error:
          'A month of a SECONDLY rule can hold millions of occurrences, so the calendar skips it. Use the list instead.',
        milliseconds: 0,
      };
    }
    const start = month.toPlainDate({day: 1}).toZonedDateTime({timeZone: zone});
    const end = start.add({months: 1}).subtract({nanoseconds: 1});
    return timed(() => attempt(() => rule.between(start, end, true)));
  }, [rule, month, zone, options.freq]);

  const byDay = useMemo(() => {
    const map = new Map<string, Zdt[]>();
    for (const date of result.value ?? []) {
      const key = date.withTimeZone(zone).toPlainDate().toString();
      const list = map.get(key);
      if (list) list.push(date);
      else map.set(key, [date]);
    }
    return map;
  }, [result, zone]);

  const firstDay = month.toPlainDate({day: 1});
  const leading = firstDay.dayOfWeek - 1;
  const cells = Math.ceil((leading + month.daysInMonth) / 7) * 7;
  const days = Array.from({length: cells}, (_, index) => {
    const day = index - leading + 1;
    return day >= 1 && day <= month.daysInMonth ? firstDay.with({day}) : null;
  });
  const busiest = Math.max(1, ...[...byDay.values()].map((list) => list.length));
  const selectedKey = selected && byDay.has(selected) ? selected : ([...byDay.keys()][0] ?? null);
  const selectedDates = selectedKey ? (byDay.get(selectedKey) ?? []) : [];
  const seconds = showsSeconds(options);
  const monthLabel = firstDay.toLocaleString(undefined, {month: 'long', year: 'numeric'});
  const total = result.value?.length ?? 0;

  return (
    <div className="animate-fade-in space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <IconButton label="Previous month" onClick={() => setMonth((value) => value.subtract({months: 1}))}>
            <ChevronLeftIcon className="size-5" />
          </IconButton>
          <h3 className="min-w-36 text-center text-sm font-semibold tabular-nums">{monthLabel}</h3>
          <IconButton label="Next month" onClick={() => setMonth((value) => value.add({months: 1}))}>
            <ChevronRightIcon className="size-5" />
          </IconButton>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setMonth(monthOf(anchor, zone))}>
            First occurrence
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMonth(today.toPlainYearMonth())}>
            Today
          </Button>
        </div>
      </div>

      {result.error ? (
        <ErrorNote>{result.error}</ErrorNote>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdayLabels.map((label) => (
              <div key={label} className="pb-1 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                {label}
              </div>
            ))}
            {days.map((day, index) => {
              if (!day) return <div key={`blank-${index}`} className="aspect-square" />;
              const key = day.toString();
              const count = byDay.get(key)?.length ?? 0;
              const isSelected = key === selectedKey;
              const isToday = day.equals(today);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={count === 0}
                  onClick={() => setSelected(key)}
                  aria-pressed={isSelected}
                  aria-label={`${day.toLocaleString(undefined, {dateStyle: 'full'})}: ${count} occurrence${count === 1 ? '' : 's'}`}
                  className={cx(
                    'relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm tabular-nums transition-[background-color,color,scale] duration-150',
                    count > 0 ? 'active:scale-[0.96]' : 'text-zinc-400 dark:text-zinc-600',
                    isSelected
                      ? 'bg-indigo-600 font-semibold text-white'
                      : count > 0
                        ? 'bg-indigo-50 font-medium text-indigo-900 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-100 dark:hover:bg-indigo-500/25'
                        : '',
                    isToday && !isSelected && 'ring-1 ring-zinc-400 dark:ring-zinc-500',
                  )}
                >
                  {day.day}
                  {count > 0 && (
                    <span
                      className={cx(
                        'h-1 rounded-full',
                        isSelected ? 'bg-white/80' : 'bg-indigo-500 dark:bg-indigo-400',
                      )}
                      style={{width: `${Math.max(4, Math.round((count / busiest) * 20))}px`}}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
            {total.toLocaleString()} occurrence{total === 1 ? '' : 's'} this month, found with{' '}
            <code className="font-mono">rule.between()</code> in {formatMilliseconds(result.milliseconds)}
          </p>

          {selectedKey && (
            <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-950/5 dark:bg-zinc-950/40 dark:ring-white/10">
              <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {Temporal.PlainDate.from(selectedKey).toLocaleString(undefined, {dateStyle: 'full'})}
              </p>
              <ul className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {selectedDates.map((date) => (
                  <li
                    key={date.epochNanoseconds.toString()}
                    className="rounded-md bg-white px-2 py-1 text-xs tabular-nums ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10"
                  >
                    {formatTime(date.epochMilliseconds, zone, seconds)}{' '}
                    <span className="text-zinc-400">{formatZoneName(date.epochMilliseconds, zone)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
