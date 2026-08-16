import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // forks + coverage under Turbo parallelism hits worker timeouts on macOS;
    // threads stays reliable for canvas/DOM-ish gantt tests.
    pool: 'threads',
    maxWorkers: 2,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/test/dom.ts'],
    },
  },
});
