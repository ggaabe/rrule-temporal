import {presets, type Preset} from '../lib/presets';
import {cx} from '../lib/styles';

export function Presets({activeId, onSelect}: {activeId: string | undefined; onSelect: (preset: Preset) => void}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pt-1 pb-3 sm:-mx-6 sm:px-6 [scrollbar-width:thin]">
      <ul className="flex w-max gap-2">
        {presets.map((preset) => {
          const active = preset.id === activeId;
          return (
            <li key={preset.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(preset)}
                className={cx(
                  'flex h-full w-48 flex-col items-start gap-2 rounded-2xl p-3 text-left transition-[background-color,box-shadow,scale] duration-150 active:scale-[0.96]',
                  active
                    ? 'bg-indigo-600 text-white shadow-[0_8px_24px_-12px_rgb(79_70_229/0.7)]'
                    : 'bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-zinc-950/5 hover:bg-zinc-50 dark:bg-zinc-900 dark:shadow-none dark:ring-white/10 dark:hover:bg-zinc-800',
                )}
              >
                <span
                  className={cx(
                    'rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
                  )}
                >
                  {preset.feature}
                </span>
                <span className="text-sm leading-snug font-medium text-balance">{preset.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
