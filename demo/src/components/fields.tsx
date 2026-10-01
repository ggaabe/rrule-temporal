import {useState} from 'react';
import {Temporal} from '@js-temporal/polyfill';
import type {Zdt} from '../lib/rule';
import {toDateTimeInput} from '../lib/format';
import {controlBase, cx, inputClass} from '../lib/styles';
import {Field} from './ui';

/**
 * Text that edits a structured value. Valid drafts commit as you type, and an
 * outside change (a preset, the RRULE text) replaces the draft unless the
 * draft already means the same thing.
 */
function useDraft<T>(
  value: T,
  format: (value: T) => string,
  parse: (text: string) => T | null,
  same: (a: T, b: T) => boolean,
) {
  const [draft, setDraft] = useState(() => format(value));
  const [synced, setSynced] = useState(value);
  if (!same(value, synced)) {
    setSynced(value);
    const parsed = parse(draft);
    if (parsed === null || !same(parsed, value)) setDraft(format(value));
  }
  const parsed = parse(draft);
  return {draft, setDraft, invalid: parsed === null, parsed};
}

const sameList = <T,>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((item, index) => item === b[index]);

export function NumberListField({
  label,
  hint,
  value,
  min,
  max,
  negative = false,
  placeholder,
  onCommit,
}: {
  label: string;
  hint?: string;
  value: readonly number[] | undefined;
  min: number;
  max: number;
  negative?: boolean;
  placeholder?: string;
  onCommit: (value: number[]) => void;
}) {
  const parse = (text: string): number[] | null => {
    const tokens = text.split(/[\s,]+/).filter(Boolean);
    const numbers: number[] = [];
    const inRange = (number: number) => number >= min && number <= max;
    for (const token of tokens) {
      if (!/^[+-]?\d+$/.test(token)) return null;
      const number = Number(token);
      if (!inRange(number) && !(negative && number < 0 && inRange(-number))) return null;
      numbers.push(number);
    }
    return numbers;
  };
  const {draft, setDraft, invalid} = useDraft<readonly number[]>(
    value ?? [],
    (list) => list.join(', '),
    parse,
    sameList,
  );
  return (
    <Field label={label} hint={hint}>
      <input
        className={inputClass}
        value={draft}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-label={label}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = parse(event.target.value);
          if (parsed) onCommit(parsed);
        }}
      />
    </Field>
  );
}

const byDayToken = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/;

export function ByDayField({
  value,
  onCommit,
}: {
  value: readonly string[] | undefined;
  onCommit: (value: string[]) => void;
}) {
  const parse = (text: string): string[] | null => {
    const tokens = text
      .toUpperCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    return tokens.every((token) => byDayToken.test(token)) ? tokens : null;
  };
  const {draft, setDraft, invalid} = useDraft<readonly string[]>(
    value ?? [],
    (list) => list.join(', '),
    parse,
    sameList,
  );
  return (
    <Field label="BYDAY" hint="e.g. 1MO, -1FR">
      <input
        className={cx(inputClass, 'uppercase')}
        value={draft}
        placeholder="MO, WE, FR"
        aria-invalid={invalid}
        aria-label="BYDAY"
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = parse(event.target.value);
          if (parsed) onCommit(parsed);
        }}
      />
    </Field>
  );
}

/** RDATE/EXDATE as local date-times in the rule's time zone. */
export function DateListField({
  label,
  hint,
  value,
  zone,
  onCommit,
}: {
  label: string;
  hint?: string;
  value: readonly Zdt[] | undefined;
  zone: string;
  onCommit: (value: Zdt[]) => void;
}) {
  const format = (dates: readonly Zdt[]) => dates.map((date) => toDateTimeInput(date.withTimeZone(zone))).join(', ');
  const parse = (text: string): Zdt[] | null => {
    const tokens = text.split(/[\s,]+/).filter(Boolean);
    const dates: Zdt[] = [];
    for (const token of tokens) {
      try {
        dates.push(Temporal.PlainDateTime.from(token).toZonedDateTime(zone));
      } catch {
        return null;
      }
    }
    return dates;
  };
  const same = (a: readonly Zdt[], b: readonly Zdt[]) =>
    a.length === b.length && a.every((date, index) => date.epochNanoseconds === b[index]!.epochNanoseconds);
  const {draft, setDraft, invalid} = useDraft<readonly Zdt[]>(value ?? [], format, parse, same);
  return (
    <Field label={label} hint={hint}>
      <input
        className={inputClass}
        value={draft}
        placeholder="2026-12-24T09:30, 2026-12-31T09:30"
        aria-invalid={invalid}
        aria-label={label}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = parse(event.target.value);
          if (parsed) onCommit(parsed);
        }}
      />
    </Field>
  );
}

export function PositiveNumberInput({
  value,
  onCommit,
  label,
  className,
  max = 100_000,
}: {
  value: number;
  onCommit: (value: number) => void;
  label: string;
  className?: string;
  max?: number;
}) {
  const parse = (text: string): number | null => {
    if (!/^\d+$/.test(text.trim())) return null;
    const number = Number(text);
    return number >= 1 && number <= max ? number : null;
  };
  const {draft, setDraft, invalid} = useDraft<number>(value, String, parse, (a, b) => a === b);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={max}
      aria-label={label}
      aria-invalid={invalid}
      className={cx(controlBase, 'h-9 w-24 text-sm', className)}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        const parsed = parse(event.target.value);
        if (parsed) onCommit(parsed);
      }}
    />
  );
}
