// Playground for rrule-temporal: build a rule visually or as iCalendar text,
// then explore its occurrences as a list or calendar, through the query API,
// or as copyable code. The rule text is the single source of truth; the
// builder edits it through the library's own options and serializer.
import {useDeferredValue, useEffect, useMemo, useState} from 'react';
import {readInitialState, useDarkMode, writeState, type AppState, type ResultView, type ZoneMode} from './lib/appState';
import {presets, type Preset} from './lib/presets';
import {
  attempt,
  describeRule,
  errorMessage,
  localTimeZone,
  parseRule,
  ruleTextWith,
  type ParsedRule,
  type RulePatch,
} from './lib/rule';
import {Builder} from './components/Builder';
import {CalendarView} from './components/CalendarView';
import {CodeSnippet} from './components/CodeSnippet';
import {Header} from './components/Header';
import {OccurrenceList} from './components/OccurrenceList';
import {Presets} from './components/Presets';
import {QueryPanel} from './components/QueryPanel';
import {Summary} from './components/Summary';
import {controlBase, cx} from './lib/styles';
import {Card, CardHeader, CopyButton, ErrorNote, Segmented, Switch} from './components/ui';

type Editor = 'builder' | 'text';
type ValidRule = Extract<ParsedRule, {error: null}>;

const zoneLabel = (zone: string) => (zone === 'UTC' ? 'UTC' : `${zone.split('/').pop()!.replace(/_/g, ' ')} time`);

export default function App() {
  const [state, setState] = useState<AppState>(readInitialState);
  const [dark, toggleDark] = useDarkMode();
  const [editor, setEditor] = useState<Editor>('builder');
  const [builderError, setBuilderError] = useState<string | null>(null);

  // Parse a deferred copy so typing stays responsive on expensive rules.
  const ics = useDeferredValue(state.ics);
  const parsed = useMemo(() => parseRule(ics, state.includeDtstart), [ics, state.includeDtstart]);
  const [lastValid, setLastValid] = useState<ValidRule | null>(parsed.error === null ? parsed : null);
  if (parsed.error === null && parsed !== lastValid) setLastValid(parsed);

  useEffect(() => {
    const timer = setTimeout(() => writeState(state), 250);
    return () => clearTimeout(timer);
  }, [state]);

  const update = (patch: Partial<AppState>) => setState((previous) => ({...previous, ...patch}));
  const applyPatch = (patch: RulePatch) => {
    if (!lastValid) return;
    try {
      update({ics: ruleTextWith(lastValid.options, patch)});
      setBuilderError(null);
    } catch (error) {
      setBuilderError(errorMessage(error));
    }
  };
  const selectPreset = (preset: Preset) => {
    update({ics: preset.ics, includeDtstart: preset.includeDtstart ?? false});
    setBuilderError(null);
  };
  const activePreset = presets.find(
    (preset) => preset.ics === state.ics && (preset.includeDtstart ?? false) === state.includeDtstart,
  )?.id;

  const current = parsed.error === null ? parsed : null;
  const ruleZone = current ? (current.options.tzid ?? current.options.dtstart.timeZoneId) : 'UTC';
  const zone = state.zoneMode === 'local' ? localTimeZone : ruleZone;
  const ruleKey = `${ics}\n${state.includeDtstart}`;
  const description = current ? (attempt(() => describeRule(current.rule, state.language)).value ?? '') : '';

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
      <Header dark={dark} onToggleDark={toggleDark} />

      <div className="mt-6 mb-6 max-w-3xl sm:mt-10">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Recurrence rules on the Temporal API
        </h1>
        <p className="mt-3 max-w-2xl text-base text-pretty text-zinc-600 dark:text-zinc-400">
          Build an iCalendar RRULE, then see every occurrence and query it. Time zones, daylight saving, and
          non-Gregorian calendars are handled for you, following RFC 5545 and RFC 7529.
        </p>
        <div className="mt-5 inline-flex h-12 max-w-full items-center gap-3 rounded-xl bg-white pr-2 pl-4 ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10">
          <code className="truncate font-mono text-sm">
            <span className="mr-2 text-zinc-400 select-none">$</span>npm install rrule-temporal
          </code>
          <CopyButton text="npm install rrule-temporal" />
        </div>
      </div>

      <aside className="mb-8 rounded-2xl bg-white px-4 py-3 text-sm text-pretty text-zinc-700 ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-white/10">
        Sponsored by{' '}
        <a
          href="https://postalform.com/?utm_source=github&utm_medium=demo&utm_campaign=rrule-temporal"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          PostalForm 💌
        </a>{' '}
        — upload a PDF and we print + mail it via USPS (no printer or stamps needed). The easiest mailing platform for
        both AI Agents via MCP and humans!
      </aside>

      <section aria-labelledby="examples-heading" className="mb-4">
        <h2 id="examples-heading" className="mb-2 text-sm font-semibold">
          Start from an example
        </h2>
        <Presets activeId={activePreset} onSelect={selectPreset} />
      </section>

      <main className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <Card>
          <CardHeader
            title="Rule"
            description="Edit with controls or as iCalendar text. Both edit the same rule."
            actions={
              <Segmented<Editor>
                label="Editor"
                value={editor}
                options={[
                  {value: 'builder', label: 'Builder'},
                  {value: 'text', label: 'RRULE text'},
                ]}
                onChange={setEditor}
              />
            }
          />

          {editor === 'builder' ? (
            lastValid ? (
              <Builder options={lastValid.options} onPatch={applyPatch} />
            ) : (
              <ErrorNote>Fix the rule text to use the builder.</ErrorNote>
            )
          ) : (
            <div className="space-y-2">
              <textarea
                aria-label="Rule as iCalendar text"
                spellCheck={false}
                rows={7}
                className={cx(controlBase, 'w-full resize-y py-2.5 font-mono text-[13px] leading-relaxed')}
                value={state.ics}
                onChange={(event) => update({ics: event.target.value})}
              />
              <p className="text-xs text-pretty text-zinc-500 dark:text-zinc-400">
                DTSTART, RRULE, RDATE and EXDATE lines, as in an iCalendar file.
              </p>
            </div>
          )}

          {(builderError || (editor === 'text' && parsed.error)) && (
            <div className="mt-3">
              <ErrorNote>{builderError ?? parsed.error}</ErrorNote>
            </div>
          )}

          <div className="mt-5 border-t border-zinc-950/5 pt-4 dark:border-white/10">
            <Switch
              checked={state.includeDtstart}
              onChange={(includeDtstart) => update({includeDtstart})}
              label={
                <>
                  Include DTSTART <code className="ml-1 font-mono text-xs text-zinc-400">includeDtstart</code>
                </>
              }
              description="Emit DTSTART first and count it toward COUNT, even when the rule itself wouldn't produce it."
            />
          </div>
        </Card>

        <div className="min-w-0 space-y-4">
          {current ? (
            <>
              <Summary
                rule={current.rule}
                options={current.options}
                language={state.language}
                onLanguage={(language) => update({language})}
              />
              <Card>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <Segmented<ResultView>
                    label="Results"
                    grid="grid-cols-4 sm:inline-flex sm:w-auto"
                    value={state.view}
                    options={[
                      {
                        value: 'list',
                        label: (
                          <>
                            <span className="sm:hidden">List</span>
                            <span className="hidden sm:inline">Occurrences</span>
                          </>
                        ),
                      },
                      {value: 'calendar', label: 'Calendar'},
                      {value: 'query', label: 'Query API'},
                      {value: 'code', label: 'Code'},
                    ]}
                    onChange={(view) => update({view})}
                  />
                  {ruleZone !== localTimeZone && state.view !== 'code' && (
                    <Segmented<ZoneMode>
                      label="Show times in"
                      value={state.zoneMode}
                      options={[
                        {value: 'rule', label: zoneLabel(ruleZone)},
                        {value: 'local', label: 'Your time'},
                      ]}
                      onChange={(zoneMode) => update({zoneMode})}
                    />
                  )}
                </div>
                {state.view === 'list' && (
                  <OccurrenceList key={ruleKey} rule={current.rule} options={current.options} zone={zone} />
                )}
                {state.view === 'calendar' && (
                  <CalendarView
                    key={`${current.options.dtstart.toString()}|${zone}`}
                    rule={current.rule}
                    options={current.options}
                    zone={zone}
                  />
                )}
                {state.view === 'query' && (
                  <QueryPanel key={zone} rule={current.rule} options={current.options} zone={zone} />
                )}
                {state.view === 'code' && (
                  <CodeSnippet
                    ics={current.rule.toString()}
                    includeDtstart={state.includeDtstart}
                    language={state.language}
                    description={description}
                  />
                )}
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader title="This rule can't be parsed" description="The library reported:" />
              <ErrorNote>{parsed.error}</ErrorNote>
            </Card>
          )}
        </div>
      </main>

      <footer className="mt-12 flex flex-col items-center gap-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
        <nav className="flex gap-4" aria-label="Footer">
          <a className="hover:text-zinc-900 dark:hover:text-zinc-100" href="https://github.com/ggaabe/rrule-temporal">
            GitHub
          </a>
          <a
            className="hover:text-zinc-900 dark:hover:text-zinc-100"
            href="https://www.npmjs.com/package/rrule-temporal"
          >
            npm
          </a>
          <a
            className="hover:text-zinc-900 dark:hover:text-zinc-100"
            href="https://github.com/ggaabe/rrule-temporal/issues"
          >
            Report an issue
          </a>
        </nav>
        <p>
          Built with rrule-temporal v{__RRULE_TEMPORAL_VERSION__} on the Temporal API. Links to this page keep your
          rule.
        </p>
      </footer>
    </div>
  );
}
