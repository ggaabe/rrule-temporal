import {cx} from '../lib/styles';
import {GitHubIcon, MoonIcon, SunIcon} from './icons';
import {IconButton} from './ui';

const repository = 'https://github.com/ggaabe/rrule-temporal';

export function Logo({className}: {className?: string}) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="3" y="5" width="26" height="24" rx="6" className="fill-indigo-600" />
      <rect x="3" y="5" width="26" height="8" rx="4" className="fill-indigo-800" />
      <circle cx="11" cy="19" r="2" className="fill-white" />
      <circle cx="16" cy="19" r="2" className="fill-white" />
      <circle cx="21" cy="19" r="2" className="fill-white" />
      <circle cx="11" cy="24" r="2" className="fill-white/50" />
    </svg>
  );
}

const navLink =
  'h-10 items-center rounded-xl text-sm font-medium text-zinc-600 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100';

export function Header({dark, onToggleDark}: {dark: boolean; onToggleDark: () => void}) {
  const icon =
    'absolute inset-0 m-auto size-5 transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]';
  return (
    <header className="flex items-center justify-between gap-3 py-4">
      <a href={repository} className="flex min-w-0 items-center gap-2.5" target="_blank" rel="noopener noreferrer">
        <Logo className="size-8 shrink-0" />
        <span className="truncate text-base font-semibold tracking-tight">rrule-temporal</span>
        <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 tabular-nums dark:bg-indigo-500/15 dark:text-indigo-300">
          v{__RRULE_TEMPORAL_VERSION__}
        </span>
      </a>
      <nav className="flex items-center gap-0.5" aria-label="Project links">
        <a
          className={cx(navLink, 'hidden px-3 sm:inline-flex')}
          href={`${repository}#readme`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Docs
        </a>
        <a
          className={cx(navLink, 'hidden px-3 sm:inline-flex')}
          href="https://www.npmjs.com/package/rrule-temporal"
          target="_blank"
          rel="noopener noreferrer"
        >
          npm
        </a>
        <a
          className={cx(navLink, 'inline-flex size-10 justify-center')}
          href={repository}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub"
        >
          <GitHubIcon className="size-5" />
        </a>
        <IconButton
          label={dark ? 'Use the light theme' : 'Use the dark theme'}
          onClick={onToggleDark}
          className="relative"
        >
          <SunIcon className={cx(icon, dark ? 'scale-100 opacity-100 blur-[0px]' : 'scale-25 opacity-0 blur-[4px]')} />
          <MoonIcon className={cx(icon, dark ? 'scale-25 opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-[0px]')} />
        </IconButton>
      </nav>
    </header>
  );
}
