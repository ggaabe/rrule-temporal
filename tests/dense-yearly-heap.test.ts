import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

describe('dense recurrence constrained-heap regression', () => {
  test('the original YEARLY COUNT=1 shape succeeds with a 64 MiB old-space heap', () => {
    const fixture = fileURLToPath(new URL('./fixtures/dense-yearly-child.mjs', import.meta.url));
    const output = execFileSync(process.execPath, ['--max-old-space-size=64', fixture], {
      encoding: 'utf8',
      timeout: 15_000,
    });

    expect(output).toBe('2025-01-01T00:00:00+00:00[UTC]');
  });
});
