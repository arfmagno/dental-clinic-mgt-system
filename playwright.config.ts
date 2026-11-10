import { defineConfig } from '@playwright/test';

// End-to-end tests: the production web build served by the real API server (fresh database),
// driven in Microsoft Edge. Edge ships with Windows, so no browser download is needed;
// elsewhere set E2E_CHANNEL=chrome (or run `npx playwright install chromium` and E2E_CHANNEL=chromium).
//   npm run e2e            build, start the server on :3155 and run every spec
//   npm run e2e -- --ui    interactive runner
export const PORT = 3155;
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const SERVER_PASSWORD = 'e2e-password';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1, // one shared server database
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
  outputDir: 'e2e/.results',
  use: {
    baseURL: BASE_URL,
    channel: process.env.E2E_CHANNEL === 'chromium' ? undefined : process.env.E2E_CHANNEL ?? 'msedge',
    viewport: { width: 1100, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
  },
  webServer: {
    command: 'npm run build && node e2e/start-server.mjs',
    url: `${BASE_URL}/api/v1/healthz`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: { E2E_PORT: String(PORT), E2E_PASSWORD: SERVER_PASSWORD },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
