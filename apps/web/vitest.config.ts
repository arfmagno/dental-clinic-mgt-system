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
  },
});
