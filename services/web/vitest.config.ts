import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unit, component and integration tests. Runs in jsdom with an in-memory IndexedDB
// (fake-indexeddb), so services and the Dexie schema run for real without a browser.
// End-to-end tests (real browser, real server) live in /e2e and run with Playwright.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    // npm run coverage: the logic layers (screens are covered end to end by Playwright in /e2e)
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/domain/**', 'src/data/**'],
      exclude: ['**/*.test.*', 'src/services/pdfService.ts'],
      reporter: ['text-summary', 'text', 'html'],
      reportsDirectory: 'coverage',
      // a floor just under today's numbers: coverage may grow, not quietly shrink
      thresholds: { statements: 82, branches: 78, functions: 86, lines: 85 },
    },
  },
});
