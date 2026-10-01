import {useCallback, useState} from 'react';
import {defaultPreset} from './presets';

export const languages = [
  {value: 'en', label: 'English'},
  {value: 'de', label: 'Deutsch'},
  {value: 'es', label: 'Español'},
  {value: 'fr', label: 'Français'},
  {value: 'hi', label: 'हिन्दी'},
  {value: 'zh', label: '中文'},
  {value: 'yue', label: '粵語'},
  {value: 'ar', label: 'العربية'},
  {value: 'he', label: 'עברית'},
] as const;

export type Language = (typeof languages)[number]['value'];
export type ZoneMode = 'rule' | 'local';
export type ResultView = 'list' | 'calendar' | 'query' | 'code';

export interface AppState {
  ics: string;
  includeDtstart: boolean;
  language: Language;
  zoneMode: ZoneMode;
  view: ResultView;
}

const views: ResultView[] = ['list', 'calendar', 'query', 'code'];
const isLanguage = (value: string | null): value is Language => languages.some((language) => language.value === value);
const isView = (value: string | null): value is ResultView => views.includes(value as ResultView);

/** State from the URL hash, so a copied link reopens the same rule. */
export function readInitialState(): AppState {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const ics = params.get('rule');
  const language = params.get('lang');
  const view = params.get('view');
  return {
    ics: ics ?? defaultPreset.ics,
    includeDtstart: ics ? params.get('includeDtstart') === '1' : (defaultPreset.includeDtstart ?? false),
    language: isLanguage(language) ? language : 'en',
    zoneMode: params.get('zone') === 'local' ? 'local' : 'rule',
    view: isView(view) ? view : 'list',
  };
}

export function writeState(state: AppState): void {
  const params = new URLSearchParams({rule: state.ics});
  if (state.includeDtstart) params.set('includeDtstart', '1');
  if (state.language !== 'en') params.set('lang', state.language);
  if (state.zoneMode !== 'rule') params.set('zone', state.zoneMode);
  if (state.view !== 'list') params.set('view', state.view);
  const hash = `#${params.toString()}`;
  if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
}

export function useDarkMode(): [boolean, () => void] {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = useCallback(() => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      // Storage can be unavailable; the toggle still applies to this visit.
    }
    setDark(next);
  }, [dark]);
  return [dark, toggle];
}
