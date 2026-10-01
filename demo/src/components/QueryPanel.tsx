import {useMemo, useState, type ReactNode} from 'react';
import {Temporal} from '@js-temporal/polyfill';
import {attempt, showsSeconds, timed, type Rule, type RuleOptions, type Zdt} from '../lib/rule';
import {formatDateTime, formatMilliseconds, formatZoneName, toDateTimeInput} from '../lib/format';
import {cx, inputClass} from '../lib/styles';
import {Badge, Button} from './ui';

function QueryRow({call, description, children}: {call: ReactNode; description: string; children: ReactNode}) {
  return (
    <div className="grid gap-1 border-t border-zinc-950/5 py-3 first:border-t-0 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-4 dark:border-white/5">
      <div className="min-w-0">
        <code className="font-mono text-[13px] text-indigo-700 dark:text-indigo-300">{call}</code>
        <p className="mt-0.5 text-xs text-pretty text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
      <div className="min-w-0 text-sm tabular-nums">{children}</div>
    </div>
  );
}

export function QueryPanel({rule, options, zone}: {rule: Rule; options: RuleOptions; zone: string}) {
  const [at, setAt] = useState(() => toDateTimeInput(Temporal.Now.zonedDateTimeISO(zone)));
  const seconds = showsSeconds(options);
  const instant = useMemo(() => {
    try {
      return Temporal.PlainDateTime.from(at).toZonedDateTime(zone);
    } catch {
      return null;
    }
  }, [at, zone]);

  const results = useMemo(() => {
    if (!instant) return null;
    return timed(() => ({
      next: attempt(() => rule.next(instant)),
      previous: attempt(() => rule.previous(instant)),
      matches: attempt(() => rule.matches(instant)),
      occursOn: attempt(() => rule.occursOn(instant.toPlainDate())),
      between: attempt(() => rule.between(instant, instant.add({days: 30}))),
    }));
  }, [rule, instant]);

  const show = (date: Zdt | null) =>
    date ? (
      <span>
        {formatDateTime(date.epochMilliseconds, zone, seconds)}{' '}
        <span className="text-xs text-zinc-400">{formatZoneName(date.epochMilliseconds, zone)}</span>
      </span>
    ) : (
      <span className="text-zinc-400">null</span>
    );
  const failure = (error: string) => <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span>;
  const yesNo = (value: boolean) => <Badge tone={value ? 'emerald' : 'neutral'}>{value ? 'true' : 'false'}</Badge>;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 space-y-1.5">
          <span className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Ask about this moment <span className="font-normal text-zinc-400">({zone})</span>
          </span>
          <input
            type="datetime-local"
            className={cx(inputClass, 'sm:max-w-64')}
            value={at}
            onChange={(event) => event.target.value && setAt(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => setAt(toDateTimeInput(Temporal.Now.zonedDateTimeISO(zone)))}>
            Now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAt(toDateTimeInput(options.dtstart.withTimeZone(zone)))}>
            DTSTART
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!results?.next.value}
            onClick={() => results?.next.value && setAt(toDateTimeInput(results.next.value.withTimeZone(zone)))}
          >
            Jump to next
          </Button>
        </div>
      </div>

      {results && instant && (
        <div className="rounded-lg bg-zinc-50 px-3 ring-1 ring-zinc-950/5 dark:bg-zinc-950/40 dark:ring-white/10">
          <QueryRow call="rule.next(at)" description="The first occurrence after this moment.">
            {results.next.error !== null ? failure(results.next.error) : show(results.next.value)}
          </QueryRow>
          <QueryRow call="rule.previous(at)" description="The last occurrence before it.">
            {results.previous.error !== null ? failure(results.previous.error) : show(results.previous.value)}
          </QueryRow>
          <QueryRow call="rule.matches(at)" description="Whether this exact instant is an occurrence.">
            {results.matches.error !== null ? failure(results.matches.error) : yesNo(results.matches.value)}
          </QueryRow>
          <QueryRow call="rule.occursOn(date)" description="Whether any occurrence falls on this calendar date.">
            {results.occursOn.error !== null ? failure(results.occursOn.error) : yesNo(results.occursOn.value)}
          </QueryRow>
          <QueryRow call="rule.between(at, at + 30 days)" description="Every occurrence in a window.">
            {results.between.error !== null ? (
              failure(results.between.error)
            ) : (
              <div className="space-y-1">
                <p>
                  {results.between.value.length.toLocaleString()} occurrence
                  {results.between.value.length === 1 ? '' : 's'}
                </p>
                {results.between.value.length > 0 && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {results.between.value
                      .slice(0, 3)
                      .map((date) => formatDateTime(date.epochMilliseconds, zone, seconds))
                      .join(' · ')}
                    {results.between.value.length > 3 ? ' …' : ''}
                  </p>
                )}
              </div>
            )}
          </QueryRow>
        </div>
      )}

      {results && (
        <p className="text-xs text-pretty text-zinc-500 tabular-nums dark:text-zinc-400">
          All five queries took {formatMilliseconds(results.milliseconds)}. Common rule shapes answer them by jumping to
          the periods around the moment instead of replaying the rule from DTSTART.
        </p>
      )}
    </div>
  );
}
