import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000, // 15 seconds for slow tests
    coverage: {
      provider: 'v8',
      include: ['src/RRuleTemporal.ts', 'src/RRuleSetTemporal.ts', 'src/totext.ts'],
      reporter: ['html', 'text-summary'],
      reportsDirectory: '.coverage',
    },
  },
});
