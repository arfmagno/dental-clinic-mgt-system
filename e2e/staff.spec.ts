// Staff accounts: one shared PIN on an offline-only device; per-person accounts once it syncs.
import { expect, test } from '@playwright/test';
import { addPatient, connectSync, createStaffPin, expectToast, trackErrors } from './helpers';

test('offline-only device: one shared PIN, no staff management and no names in the log', async ({ page }) => {
  await createStaffPin(page);
  await page.goto('/settings?tab=account');
  await expect(page.getByRole('region', { name: 'Account' })).toContainText('This device uses one shared staff PIN.');
  await expect(page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Staff' })).toHaveCount(0);
  await addPatient(page, { first: 'Shared', last: 'Pin' });
  await page.goto('/settings?tab=activity');
  await expect(page.locator('.activity li', { hasText: 'Shared Pin' })).toContainText('Added');
  await expect(page.locator('.activity li', { hasText: 'Shared Pin' })).not.toContainText('by ');
});

test('synced device: admins add staff, each person signs in with their own PIN, the log shows who', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  const owner = `Dr. Owner ${Date.now() % 100000}`;
  await createStaffPin(page);
  await connectSync(page);

  // the shared account becomes this person's own: rename it
  await page.goto('/settings?tab=staff');
  const staff = page.getByRole('region', { name: 'Staff' });
  await staff.locator('li', { hasText: '(you)' }).getByRole('button', { name: /^Edit / }).click();
  await page.locator('.modal').getByLabel('Name').fill(owner);
  await page.locator('.modal').getByRole('button', { name: 'Save' }).click();
  await expectToast(page, 'Account updated');

  // add a front-desk account (role: Staff)
  await staff.getByRole('button', { name: 'Add staff' }).click();
  const add = page.locator('.modal');
  await add.getByLabel('Name').fill('Bea Desk');
  await add.getByLabel('Role').selectOption('staff');
  await add.getByLabel('Their PIN (4–6 digits)').fill('5678');
  await add.getByLabel('Repeat PIN').fill('5678');
  await add.getByRole('button', { name: 'Add staff' }).click();
  await expectToast(page, 'Bea Desk added');
  await expect(staff.locator('li', { hasText: 'Bea Desk' })).toContainText('Staff');

  // switch user
  await page.goto('/settings?tab=account');
  await page.getByRole('button', { name: 'Lock / switch user' }).click();
  await expect(page.getByRole('heading', { name: 'Who is signing in?' })).toBeVisible();
  await page.getByRole('radio', { name: /Bea Desk/ }).click();
  await page.getByLabel('Staff PIN').fill('0000');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Wrong PIN');
  await page.getByLabel('Staff PIN').fill('5678');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // back where the device was locked, as the new person
  // a staff member: no Staff tab, cannot delete patients
  await expect(page.getByRole('region', { name: 'Account' })).toContainText('Signed in as Bea Desk');
  await expect(page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Staff' })).toHaveCount(0);
  await addPatient(page, { first: 'Audit', last: 'Trail' });
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);

  await page.goto('/settings?tab=activity');
  await expect(page.locator('.activity li', { hasText: 'Audit Trail' }).first()).toContainText('Added · by Bea Desk');
  await expect(page.locator('.activity li', { hasText: 'Bea Desk' }).filter({ hasText: 'Staff account' }).first()).toContainText(`by ${owner}`);
  expect(errors).toEqual([]);
});
