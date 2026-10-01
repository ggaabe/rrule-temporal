import {useMemo} from 'react';
import {Temporal} from '@js-temporal/polyfill';
import type {RuleOptions, RulePatch} from '../lib/rule';
import {timeZoneChoices} from '../lib/rule';
import {toDateInput, toTimeInput} from '../lib/format';
import {ByDayField, DateListField, NumberListField, PositiveNumberInput} from './fields';
import {controlBase, cx, inputClass} from '../lib/styles';
import {Field, Segmented, ToggleChip} from './ui';

const frequencies = [
  {value: 'YEARLY', label: 'Yearly', unit: 'year'},
  {value: 'MONTHLY', label: 'Monthly', unit: 'month'},
  {value: 'WEEKLY', label: 'Weekly', unit: 'week'},
  {value: 'DAILY', label: 'Daily', unit: 'day'},
  {value: 'HOURLY', label: 'Hourly', unit: 'hour'},
  {value: 'MINUTELY', label: 'Minutely', unit: 'minute'},
  {value: 'SECONDLY', label: 'Secondly', unit: 'second'},
] as const;
type Frequency = (typeof frequencies)[number]['value'];

const weekdays = [
  ['MO', 'Mon'],
  ['TU', 'Tue'],
  ['WE', 'Wed'],
  ['TH', 'Thu'],
  ['FR', 'Fri'],
  ['SA', 'Sat'],
  ['SU', 'Sun'],
] as const;
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const calendars = ['GREGORIAN', 'HEBREW', 'CHINESE', 'INDIAN'];

type Ends = 'never' | 'count' | 'until';

function toggle<T>(list: readonly T[] | undefined, item: T): T[] {
  const current = list ?? [];
  return current.includes(item) ? current.filter((value) => value !== item) : [...current, item];
}

function Divider() {
  return <div className="h-px bg-zinc-950/5 dark:bg-white/10" />;
}

export function Builder({options, onPatch}: {options: RuleOptions; onPatch: (patch: RulePatch) => void}) {
  const zone = options.tzid ?? options.dtstart.timeZoneId;
  const zones = useMemo(() => timeZoneChoices(zone), [zone]);
  const frequency = frequencies.find((item) => item.value === options.freq) ?? frequencies[2];
  const interval = options.interval ?? 1;
  const ends: Ends = options.count !== undefined ? 'count' : options.until ? 'until' : 'never';
  const byDay = options.byDay ?? [];
  const byMonth = options.byMonth ?? [];
  const byHour = options.byHour ?? [];
  const subDaily = ['HOURLY', 'MINUTELY', 'SECONDLY'].includes(options.freq);

  const setStart = (date: string, time: string) => {
    if (!date || !time) return;
    try {
      onPatch({dtstart: Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(zone)});
    } catch {
      // The browser only reports complete, valid values; ignore anything else.
    }
  };
  const endOfDay = (date: string) => Temporal.PlainDateTime.from(`${date}T23:59:59`).toZonedDateTime(zone);

  return (
    <div className="space-y-5">
      <Field label="Frequency">
        <Segmented
          label="Frequency"
          value={options.freq as Frequency}
          options={frequencies}
          onChange={(freq) => onPatch({freq})}
          grid="grid-cols-4 sm:grid-cols-7 lg:grid-cols-4 xl:grid-cols-7"
        />
      </Field>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <Field label="Repeat every">
          <div className="flex items-center gap-2">
            <PositiveNumberInput value={interval} label="Interval" onCommit={(value) => onPatch({interval: value})} />
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {frequency.unit}
              {interval === 1 ? '' : 's'}
            </span>
          </div>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
        <Field label="Starts">
          <div className="flex gap-2">
            <input
              type="date"
              aria-label="Start date"
              className={inputClass}
              value={toDateInput(options.dtstart)}
              onChange={(event) => setStart(event.target.value, toTimeInput(options.dtstart))}
            />
            <input
              type="time"
              step={1}
              aria-label="Start time"
              className={cx(controlBase, 'h-9 w-40 shrink-0 text-sm')}
              value={toTimeInput(options.dtstart)}
              onChange={(event) => setStart(toDateInput(options.dtstart), event.target.value)}
            />
          </div>
        </Field>
        <Field label="Time zone">
          <select
            aria-label="Time zone"
            className={inputClass}
            value={zone}
            onChange={(event) =>
              onPatch({
                dtstart: options.dtstart.toPlainDateTime().toZonedDateTime(event.target.value),
                tzid: event.target.value,
              })
            }
          >
            <optgroup label="Common">
              {zones.common.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </optgroup>
            {zones.all.length > 0 && (
              <optgroup label="All time zones">
                {zones.all.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
      </div>

      <Field label="Ends">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Ends>
            label="Ends"
            value={ends}
            options={[
              {value: 'never', label: 'Never'},
              {value: 'count', label: 'After'},
              {value: 'until', label: 'On date'},
            ]}
            onChange={(value) => {
              if (value === 'never') onPatch({count: undefined, until: undefined});
              if (value === 'count') onPatch({count: options.count ?? 10, until: undefined});
              if (value === 'until') {
                onPatch({
                  count: undefined,
                  until: options.until ?? endOfDay(toDateInput(options.dtstart.add({months: 6}))),
                });
              }
            }}
          />
          {ends === 'count' && (
            <div className="flex items-center gap-2">
              <PositiveNumberInput
                value={options.count ?? 10}
                label="Occurrence count"
                onCommit={(count) => onPatch({count})}
              />
              <span className="text-sm text-zinc-500 dark:text-zinc-400">occurrences</span>
            </div>
          )}
          {ends === 'until' && options.until && (
            <input
              type="date"
              aria-label="End date"
              className={cx(controlBase, 'h-9 w-44 text-sm')}
              value={toDateInput(options.until.withTimeZone(zone))}
              onChange={(event) => event.target.value && onPatch({until: endOfDay(event.target.value)})}
            />
          )}
        </div>
      </Field>

      <Divider />

      <Field label="On weekdays" hint="BYDAY">
        <div className="flex flex-wrap gap-1.5">
          {weekdays.map(([token, name]) => (
            <ToggleChip
              key={token}
              pressed={byDay.includes(token)}
              onClick={() => onPatch({byDay: toggle(byDay, token)})}
            >
              {name}
            </ToggleChip>
          ))}
        </div>
      </Field>

      <Field
        label={options.rscale ? `In months of the ${options.rscale.toLowerCase()} calendar` : 'In months'}
        hint="BYMONTH"
      >
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
          {Array.from({length: options.rscale ? 13 : 12}, (_, index) => index + 1).map((month) => (
            <ToggleChip
              key={month}
              pressed={byMonth.includes(month)}
              onClick={() => onPatch({byMonth: toggle(byMonth, month)})}
            >
              {options.rscale ? month : monthNames[month - 1]}
            </ToggleChip>
          ))}
        </div>
      </Field>

      <Field label="At hours" hint="BYHOUR">
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
          {Array.from({length: 24}, (_, hour) => hour).map((hour) => (
            <ToggleChip
              key={hour}
              pressed={byHour.includes(hour)}
              onClick={() => onPatch({byHour: toggle(byHour, hour)})}
            >
              {String(hour).padStart(2, '0')}
            </ToggleChip>
          ))}
        </div>
        {byHour.length === 0 && !subDaily && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">None selected: occurrences use the start time.</p>
        )}
      </Field>

      <details className="group rounded-2xl bg-zinc-50 p-2 ring-1 ring-zinc-950/5 dark:bg-zinc-950/40 dark:ring-white/10">
        <summary className="flex min-h-9 items-center justify-between rounded-lg px-2 text-xs font-medium text-zinc-700 select-none hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60">
          More rule parts
          <span className="text-zinc-400 transition-transform duration-200 group-open:rotate-90" aria-hidden="true">
            ›
          </span>
        </summary>
        <div className="grid gap-3 px-2 pt-3 pb-2 sm:grid-cols-2">
          <NumberListField
            label="BYMONTHDAY"
            hint="1 to 31, or −1 for the last day"
            value={options.byMonthDay}
            min={1}
            max={31}
            negative
            placeholder="15, -1"
            onCommit={(byMonthDay) => onPatch({byMonthDay})}
          />
          <NumberListField
            label="BYSETPOS"
            hint="−1 is the last match"
            value={options.bySetPos}
            min={1}
            max={366}
            negative
            placeholder="-1"
            onCommit={(bySetPos) => onPatch({bySetPos})}
          />
          <NumberListField
            label="BYYEARDAY"
            hint="1 to 366"
            value={options.byYearDay}
            min={1}
            max={366}
            negative
            placeholder="1, -1"
            onCommit={(byYearDay) => onPatch({byYearDay})}
          />
          <NumberListField
            label="BYWEEKNO"
            hint="ISO week, 1 to 53"
            value={options.byWeekNo}
            min={1}
            max={53}
            negative
            placeholder="1, 26"
            onCommit={(byWeekNo) => onPatch({byWeekNo})}
          />
          <NumberListField
            label="BYMINUTE"
            hint="0 to 59"
            value={options.byMinute}
            min={0}
            max={59}
            placeholder="0, 30"
            onCommit={(byMinute) => onPatch({byMinute})}
          />
          <NumberListField
            label="BYSECOND"
            hint="0 to 59"
            value={options.bySecond}
            min={0}
            max={59}
            placeholder="0"
            onCommit={(bySecond) => onPatch({bySecond})}
          />
          <ByDayField value={options.byDay} onCommit={(value) => onPatch({byDay: value})} />
          <Field label="Week starts" hint="WKST">
            <select
              aria-label="Week start"
              className={inputClass}
              value={options.wkst ?? ''}
              onChange={(event) => onPatch({wkst: event.target.value || undefined})}
            >
              <option value="">Monday (default)</option>
              {weekdays.map(([token, name]) => (
                <option key={token} value={token}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Calendar" hint="RSCALE, RFC 7529">
            <select
              aria-label="Calendar"
              className={inputClass}
              value={options.rscale ?? ''}
              onChange={(event) =>
                onPatch({
                  rscale: event.target.value || undefined,
                  skip: event.target.value ? (options.skip ?? 'OMIT') : undefined,
                })
              }
            >
              <option value="">None (Gregorian, RFC 5545)</option>
              {calendars.map((calendar) => (
                <option key={calendar} value={calendar}>
                  {calendar.charAt(0) + calendar.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Invalid dates" hint="SKIP">
            <select
              aria-label="Invalid dates"
              className={inputClass}
              disabled={!options.rscale}
              value={options.skip ?? 'OMIT'}
              onChange={(event) => onPatch({skip: event.target.value as RuleOptions['skip']})}
            >
              <option value="OMIT">Omit them</option>
              <option value="BACKWARD">Move to the previous day</option>
              <option value="FORWARD">Move to the next day</option>
            </select>
          </Field>
          <DateListField
            label="Extra dates"
            hint="RDATE, local time"
            value={options.rDate}
            zone={zone}
            onCommit={(rDate) => onPatch({rDate})}
          />
          <DateListField
            label="Excluded dates"
            hint="EXDATE, local time"
            value={options.exDate}
            zone={zone}
            onCommit={(exDate) => onPatch({exDate})}
          />
        </div>
      </details>
    </div>
  );
}
