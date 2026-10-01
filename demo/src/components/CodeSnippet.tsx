import type {Language} from '../lib/appState';
import {CopyButton} from './ui';

const quote = (line: string) => `'${line.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function snippet(ics: string, includeDtstart: boolean, language: Language, description: string): string {
  const lines = ics.trim().split(/\r?\n/);
  const textCall = language === 'en' ? 'toText(rule)' : `toText(rule, '${language}')`;
  return [
    "import {RRuleTemporal} from 'rrule-temporal';",
    "import {toText} from 'rrule-temporal/totext';",
    '',
    'const rule = new RRuleTemporal({',
    '  rruleString: [',
    ...lines.map((line) => `    ${quote(line)},`),
    "  ].join('\\n'),",
    ...(includeDtstart ? ['  includeDtstart: true,'] : []),
    '});',
    '',
    'rule.all((date, i) => i < 10); // the first 10 occurrences',
    'rule.next(); // the next occurrence after now',
    '',
    'const start = new Date();',
    'const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);',
    'rule.between(start, end); // every occurrence in the next 30 days',
    '',
    `${textCall}; // ${JSON.stringify(description)}`,
  ].join('\n');
}

export function CodeSnippet({
  ics,
  includeDtstart,
  language,
  description,
}: {
  ics: string;
  includeDtstart: boolean;
  language: Language;
  description: string;
}) {
  const code = snippet(ics, includeDtstart, language, description);
  return (
    <div className="animate-fade-in space-y-3">
      <div className="overflow-hidden rounded-lg bg-zinc-950 ring-1 ring-white/10">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 py-1.5 pr-1.5 pl-4">
          <span className="text-[11px] font-medium text-zinc-400">JavaScript</span>
          <CopyButton text={code} label="Copy code" />
        </div>
        <pre className="max-h-[32rem] overflow-auto p-4 text-[13px] leading-relaxed text-zinc-100">
          <code>
            {code.split('\n').map((line, index) => {
              const comment = line.indexOf(' // ');
              return (
                <span key={index} className="block min-h-[1lh]">
                  {comment === -1 ? (
                    line
                  ) : (
                    <>
                      {line.slice(0, comment)}
                      <span className="text-zinc-500">{line.slice(comment)}</span>
                    </>
                  )}
                </span>
              );
            })}
          </code>
        </pre>
      </div>
      <p className="text-xs text-pretty text-zinc-500 dark:text-zinc-400">
        Works with the bundled Temporal polyfill or a native Temporal runtime. Pass{' '}
        <code className="font-mono">temporal</code> to receive dates from your own Temporal implementation.
      </p>
    </div>
  );
}
