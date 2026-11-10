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
  for (const tile of ['Add patient', 'Add procedure', 'Find patient', 'All records']) {
    await expect(page.locator('.tile', { hasText: tile })).toBeVisible();
  }
  await expect(page.locator('.sync .chip')).toHaveText(/^\s*Offline/); // offline is the default
  expect(errors).toEqual([]);
});

test('lock app hides everything; a new session opens locked; the PIN unlocks', async ({ page, context }) => {
  await createStaffPin(page);
  await page.getByRole('button', { name: /Lock/ }).click();
  await page.getByRole('menuitem', { name: /Lock app/ }).click();
  await expect(page.getByRole('heading', { name: 'Clinic is locked' })).toBeVisible();
  await expect(page.locator('.topbar')).toHaveCount(0);

  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('heading', { name: 'Clinic is locked' })).toBeVisible();
  await other.close();

  await page.getByLabel('Staff PIN').fill('0000');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('alert')).toContainText(/wrong pin/i);
  await page.getByLabel('Staff PIN').fill(PIN);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('.topbar')).toBeVisible();
});

test('dark mode applies and is remembered', async ({ page }) => {
  await createStaffPin(page);
  await page.getByRole('radio', { name: /Dark/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: /Light/ }).click();
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
