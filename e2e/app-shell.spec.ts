// First launch, PIN lock, theme, offline-by-default and the installable (service worker) shell.
import { expect, test } from '@playwright/test';
import { createStaffPin, PIN, trackErrors } from './helpers';

test('first launch asks for a staff PIN; mismatches are refused', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByLabel('New PIN (4–6 digits)').fill(PIN);
  await page.getByLabel('Repeat PIN').fill('9999');
  await page.getByRole('button', { name: 'Create PIN' }).click();
  await expect(page.getByRole('alert')).toContainText('do not match');
  await page.getByLabel('Repeat PIN').fill(PIN);
  await page.getByRole('button', { name: 'Create PIN' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  for (const tile of ['Add Patient', 'Add Record', 'Find Patient', 'Transactions']) {
    await expect(page.locator('.tile', { hasText: tile })).toBeVisible();
  }
  await expect(page.locator('.sync .chip')).toHaveText(/^\s*Offline/); // offline is the default
  expect(errors).toEqual([]);
});

test('nav: Add Patient / Add Record, no lock button; a new session opens locked; the PIN unlocks', async ({ context }) => {
  const first = await context.newPage();
  await createStaffPin(first);
  const nav = first.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link')).toHaveText(['Home', 'Patients', 'Add Patient', 'Add Record', 'Records', 'Transactions']);
  await expect(first.getByRole('button', { name: /Lock/ })).toHaveCount(0);
  await first.close();

  const page = await context.newPage(); // a new session (tab) starts locked
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Clinic is locked' })).toBeVisible();
  await expect(page.locator('.topbar')).toHaveCount(0);

  await page.getByLabel('Staff PIN').fill('0000');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toContainText(/wrong pin/i);
  await page.getByLabel('Staff PIN').fill(PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('.topbar')).toBeVisible();
});

test('light by default; dark mode applies and is remembered', async ({ page }) => {
  await createStaffPin(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('switch', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('switch', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the app shell is precached by the service worker (opens without network)', async ({ page, context }) => {
  await createStaffPin(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).length))).reduce((a, b) => a + b, 0)), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(10);

  await context.setOffline(true);
  await page.reload();
  const locked = page.getByRole('heading', { name: 'Clinic is locked' });
  const home = page.getByRole('heading', { name: 'Welcome back' });
  await expect(locked.or(home)).toBeVisible();
  if (await locked.isVisible()) {
    await page.getByLabel('Staff PIN').fill(PIN);
    await page.getByRole('button', { name: 'Unlock' }).click();
  }
  await expect(home).toBeVisible();
  await context.setOffline(false);
});
