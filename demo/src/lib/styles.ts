export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** Control styling without width, height or font size, so call sites can set those without conflicts. */
export const controlBase =
  'min-w-0 rounded-lg bg-white px-3 text-zinc-900 tabular-nums ring-1 ring-zinc-950/10 transition-shadow duration-150 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 aria-[invalid=true]:ring-rose-500/70 dark:bg-zinc-950 dark:text-zinc-100 dark:ring-white/15 dark:placeholder:text-zinc-600 dark:aria-[invalid=true]:ring-rose-400/60';

export const inputClass = `${controlBase} h-9 w-full text-sm`;
