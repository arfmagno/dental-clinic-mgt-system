// The packaged Windows desktop app (npm run dist -w @clinic/desktop) driven by Playwright:
// opens offline from disk, keeps data between launches, and syncs through its API forwarder.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { createStaffPin, PIN, SERVER_PASSWORD, serverRows } from './helpers';

const EXE = path.resolve('services/desktop/release/win-unpacked/Magno Dental Clinic.exe');

test.skip(process.platform !== 'win32' || !existsSync(EXE), 'Build the desktop app first: npm run dist -w @clinic/desktop');

let profile: string;
test.beforeAll(() => {
  profile = mkdtempSync(path.join(tmpdir(), 'clinic-desktop-'));
});
let app: ElectronApplication | undefined;
test.afterAll(async () => {
  await app?.close().catch(() => {});
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

const launch = () => electron.launch({ executablePath: EXE, env: { ...process.env, CLINIC_USER_DATA: profile } as Record<string, string> });

test('desktop app: works offline from disk, keeps data, syncs via the saved server address', async ({ baseURL }) => {
  test.setTimeout(120_000);
  app = await launch();
  let win = await app.firstWindow();
  expect(win.url()).toBe('app://clinic/');
  expect(await win.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined'); // no Node in the page
  expect(await win.evaluate(() => typeof (window as unknown as { clinicDesktop?: unknown }).clinicDesktop)).toBe('object');

  await createStaffPin(win, 'app://clinic/');
  await win.goto('app://clinic/patients/new'); // router fallback to index.html
  await win.getByLabel('First name *').fill('Desktop');
  await win.getByLabel('Last name *').fill('Patient');
  await win.getByLabel('Date of birth *').fill('1979-09-09');
  await win.getByRole('button', { name: 'Add patient' }).click();
  await expect(win.getByRole('heading', { name: 'Desktop Patient' })).toBeVisible();
  expect(await win.evaluate(async () => navigator.serviceWorker?.getRegistrations().then((r) => r.length, () => 0) ?? 0)).toBe(0); // files come from disk; no service worker

  // data survives closing the app
  await app.close();
  app = await launch();
  win = await app.firstWindow();
  await expect(win.getByRole('heading', { name: 'Clinic is locked' })).toBeVisible();
  await win.getByLabel('Staff PIN').fill(PIN);
  await win.getByRole('button', { name: 'Unlock' }).click();
  await win.goto('app://clinic/patients?q=desktop');
  if (await win.getByRole('heading', { name: 'Clinic is locked' }).isVisible()) {
    await win.getByLabel('Staff PIN').fill(PIN);
    await win.getByRole('button', { name: 'Unlock' }).click();
  }
  await expect(win.locator('a.prow')).toHaveCount(1);

  // sync: the Connect page asks for the server address; API calls go through the forwarder
  await win.locator('.sync .chip').click();
  await win.getByRole('dialog', { name: 'Sync settings' }).locator('.switch input').click();
  await expect(win.getByLabel('Clinic server address')).toBeVisible();
  await win.getByLabel('Clinic server address').fill('ftp://nope');
  await win.getByLabel('Clinic server password').fill(SERVER_PASSWORD);
  await win.getByRole('button', { name: 'Connect and turn on sync' }).click();
  await expect(win.getByRole('alert')).toHaveText('The address must start with http:// or https://');
  await win.getByLabel('Clinic server address').fill(new URL(baseURL!).host); // "127.0.0.1:3155", no scheme
  await win.getByRole('button', { name: 'Connect and turn on sync' }).click();
  await expect(win.getByLabel('Clinic server address')).toHaveCount(0);

  await expect
    .poll(async () => (await serverRows(baseURL!)).some((r) => r.table === 'patients' && r.row.lastName === 'Patient' && r.row.firstName === 'Desktop'), { timeout: 20_000 })
    .toBe(true);
  await app.close();
});
