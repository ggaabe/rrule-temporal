import {useMemo, type ReactNode} from 'react';
import {languages, type Language} from '../lib/appState';
import {attempt, describeRule, showsSeconds, type Rule, type RuleOptions} from '../lib/rule';
import {formatDateTime, formatShortDate, formatZoneName} from '../lib/format';
import {controlBase, cx} from '../lib/styles';
import {Card, CopyButton} from './ui';

function Fact({label, children}: {label: string; children: ReactNode}) {
  return (
    <div className="min-w-0 rounded-lg bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-950/5 dark:bg-zinc-950/40 dark:ring-white/10">
      <dt className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words text-pretty tabular-nums">{children}</dd>
    </div>
  );
}

export function Summary({
  rule,
  options,
  language,
  onLanguage,
}: {
  rule: Rule;
  options: RuleOptions;
  language: Language;
  onLanguage: (language: Language) => void;
}) {
  const description = useMemo(() => attempt(() => describeRule(rule, language)), [rule, language]);
  const next = useMemo(() => attempt(() => rule.next()), [rule]);
  const text = rule.toString();
  const zone = options.tzid ?? options.dtstart.timeZoneId;
  const seconds = showsSeconds(options);
  const start = options.dtstart.epochMilliseconds;
  const ends =
    options.count !== undefined
      ? `After ${options.count.toLocaleString()} occurrence${options.count === 1 ? '' : 's'}`
      : options.until
        ? `On ${formatShortDate(options.until.epochMilliseconds, zone)}`
        : 'Never';

  return (
    <Card className="animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          In words, from <code className="font-mono">toText()</code>
        </p>
        <select
          aria-label="Description language"
          className={cx(controlBase, 'h-8 text-xs')}
          value={language}
          onChange={(event) => onLanguage(event.target.value as Language)}
        >
          {languages.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <p dir="auto" className="mt-2 text-lg leading-snug font-semibold text-balance sm:text-xl">
        {description.error ? (
          <span className="text-sm font-normal text-rose-600">{description.error}</span>
        ) : (
          description.value
        )}
      </p>

      <div className="mt-4 overflow-hidden rounded-lg bg-zinc-950 ring-1 ring-white/10">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 py-1.5 pr-1.5 pl-3">
          <span className="text-[11px] font-medium text-zinc-400">iCalendar</span>
          <CopyButton text={text} />
        </div>
        <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed text-zinc-100">{text}</pre>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
        <Fact label="Starts">
          <span title={formatDateTime(start, zone, seconds)}>{formatShortDate(start, zone)}</span>
        </Fact>
        <Fact label="Ends">{ends}</Fact>
        <Fact label="Time zone">
          <span title={zone}>
            {zone.split('/').map((part, index) => (
              <span key={index}>
                {index > 0 && (
                  <>
                    /<wbr />
                  </>
                )}
                {part}
              </span>
            ))}{' '}
            <span className="text-zinc-400">{formatZoneName(start, zone)}</span>
          </span>
        </Fact>
        <Fact label="Next from now">
          {next.error ? (
            <span className="text-rose-600">Error</span>
          ) : next.value ? (
            <span title={formatDateTime(next.value.epochMilliseconds, zone, seconds)}>
              {formatShortDate(next.value.epochMilliseconds, zone)}
            </span>
          ) : (
            <span className="text-zinc-400">None</span>
          )}
        </Fact>
      </dl>
    </Card>
  );
}
