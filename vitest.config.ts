import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 15000, // 15 seconds for slow tests
    coverage: {
      provider: 'v8',
      include: ['src/index.ts', 'src/totext.ts'],
      reporter: ['html', 'text-summary'],
      reportsDirectory: '.coverage',
    },
  },
});
