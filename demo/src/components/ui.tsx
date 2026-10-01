import {useEffect, useState, type ButtonHTMLAttributes, type ReactNode} from 'react';
import {cx} from '../lib/styles';
import {CheckIcon, CopyIcon} from './icons';

/** Cards are 24px round with 16px padding, so 8px-round controls inside sit concentrically. */
export function Card({children, className}: {children: ReactNode; className?: string}) {
  return (
    <section
      className={cx(
        'rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-16px_rgb(0_0_0/0.14)] ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:shadow-none dark:ring-white/10',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-balance text-zinc-900 dark:text-zinc-50">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-pretty text-zinc-500 dark:text-zinc-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const buttonVariants = {
  primary: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500',
  secondary:
    'bg-white text-zinc-800 ring-1 ring-zinc-950/10 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10 dark:hover:bg-zinc-700',
  ghost:
    'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
  size?: 'sm' | 'md';
};

export function Button({variant = 'secondary', size = 'md', className, type = 'button', ...props}: ButtonProps) {
  return (
    <button
      type={type}
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-[background-color,color,scale] duration-150 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-10 px-3.5 text-sm',
        buttonVariants[variant],
        className,
      )}
    />
  );
}

export function IconButton({label, className, ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {label: string}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={cx(
        'inline-flex size-10 items-center justify-center rounded-xl text-zinc-600 transition-[background-color,color,scale] duration-150 hover:bg-zinc-100 hover:text-zinc-900 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
        className,
      )}
    />
  );
}

/** Copies text and cross-fades its icon to a check mark. */
export function CopyButton({text, label = 'Copy', className}: {text: string; label?: string; className?: string}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const icon =
    'absolute inset-0 size-3.5 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]';
  return (
    <Button
      size="sm"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          // The clipboard can be unavailable, for example outside a secure context.
        }
      }}
    >
      <span className="relative size-3.5" aria-hidden="true">
        <CopyIcon className={cx(icon, copied ? 'scale-25 opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-[0px]')} />
        <CheckIcon
          className={cx(icon, copied ? 'scale-100 opacity-100 blur-[0px]' : 'scale-25 opacity-0 blur-[4px]')}
        />
      </span>
      <span aria-live="polite">{copied ? 'Copied' : label}</span>
    </Button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  grid,
}: {
  value: T;
  options: ReadonlyArray<{value: T; label: ReactNode}>;
  onChange: (value: T) => void;
  label: string;
  /** Column classes for a full-width grid instead of an inline row. */
  grid?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        'gap-0.5 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/70',
        grid ? `grid w-full ${grid}` : 'inline-flex max-w-full overflow-x-auto',
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cx(
              'min-h-9 shrink-0 rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-150',
              selected
                ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-700 dark:text-white dark:ring-white/10'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ToggleChip({
  pressed,
  onClick,
  children,
  disabled,
  title,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cx(
        'h-9 min-w-9 rounded-lg px-2 text-xs font-medium tabular-nums transition-[background-color,color,scale] duration-150 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40',
        pressed
          ? 'bg-indigo-600 text-white hover:bg-indigo-500'
          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700',
      )}
    >
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-pretty text-zinc-500 dark:text-zinc-400">{description}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-indigo-600' : 'bg-zinc-300 dark:bg-zinc-700',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)]',
            checked && 'translate-x-4',
          )}
        />
      </button>
    </label>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        {hint && <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'amber' | 'emerald' | 'rose';
  title?: string;
}) {
  const tones = {
    neutral: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    accent: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  };
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function ErrorNote({children}: {children: ReactNode}) {
  return (
    <p
      role="alert"
      className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-pretty text-rose-700 ring-1 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20"
    >
      {children}
    </p>
  );
}
