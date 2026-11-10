// Procedures: patient picker, type list with "Other", defaults, teeth, payments (no card/HMO), records.
import { expect, test, type Page } from '@playwright/test';
import { addPatient, createStaffPin, trackErrors } from './helpers';

const todayLocal = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });

test.beforeEach(async ({ page }) => {
  await createStaffPin(page);
  await addPatient(page, { first: 'Maria', last: 'Santos' });
});

test('patient picker opens, filters, closes on Escape / outside click / pick', async ({ page }) => {
  await page.goto('/procedures/new');
  const add = page.locator('form').getByRole('button', { name: 'Add procedure' });
  await expect(add).toBeDisabled(); // a procedure needs a patient
  const search = page.getByRole('combobox', { name: 'Search patient' });
  await search.fill('zzzz');
  await expect(page.getByText('No matching patient')).toBeVisible();
  await search.press('Escape');
  await expect(page.locator('.picker-list')).toHaveCount(0);
  await search.click();
  await expect(page.locator('.picker-list')).toBeVisible();
  await page.locator('h1').click();
  await expect(page.locator('.picker-list')).toHaveCount(0);
  await search.fill('maria');
  await page.getByRole('option', { name: 'Maria Santos' }).getByRole('button').click();
  await expect(page.locator('.picker-list')).toHaveCount(0);
  await expect(page.locator('.picked')).toContainText('Maria Santos');
  await expect(add).toBeEnabled();
});

test('add procedure: defaults to now, teeth follow the type, first payment, no card/HMO', async ({ page }) => {
  const errors = trackErrors(page);
  await page.getByRole('button', { name: '+ Add procedure' }).click();
  const modal = page.locator('.modal');
  await expect(modal.getByLabel('Date *')).toHaveValue(await todayLocal(page));
  await expect(modal.getByLabel('Time')).toHaveValue(/^\d\d:\d\d$/);

  await modal.getByLabel(/^Type of procedure/).selectOption('Filling');
  await modal.locator('g[aria-label^="Tooth 16:"]').click();
  await modal.locator('g[aria-label^="Tooth 17:"]').click();
  await expect(modal.getByLabel('Condition of tooth 16')).toHaveValue('filled');
  await modal.getByLabel('Cost (₱)').fill('1500');
  await modal.getByLabel('Amount received now (₱)').fill('500');
  const methods = await modal.getByLabel('Payment method').locator('option').allTextContents();
  expect(methods).toEqual(['Cash', 'E-wallet (GCash, Maya…)', 'Bank transfer', 'Other']);
  await modal.getByRole('button', { name: 'Add procedure' }).click();
  await expect(modal).toHaveCount(0);

  await expect(page.getByText('16 · Cavity filled')).toBeVisible();
  await expect(page.getByText('17 · Cavity filled')).toBeVisible();
  const proc = page.locator('article.proc').first();
  await expect(proc).toContainText('Balance ₱1,000.00');

  await proc.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.locator('.modal').getByLabel('Amount received (₱) *')).toHaveValue('1000');
  const payMethods = await page.locator('.modal').getByLabel('Method').locator('option').allTextContents();
  expect(payMethods).not.toContain('Card');
  expect(payMethods).not.toContain('HMO');
  await page.locator('.modal').getByLabel('Method').selectOption('e_wallet');
  await page.locator('.modal').getByRole('button', { name: 'Record payment' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(proc).toContainText('Settled');
  expect(errors).toEqual([]);
});

test('"Other" asks for the procedure type; the typed type is stored and editable', async ({ page }) => {
  await page.getByRole('button', { name: '+ Add procedure' }).click();
  const modal = page.locator('.modal');
  await expect(modal.getByLabel('Other type of procedure *')).toHaveCount(0);
  await modal.getByLabel(/^Type of procedure/).selectOption('Other');
  const other = modal.getByLabel('Other type of procedure *');
  await expect(other).toBeVisible();
  await modal.getByRole('button', { name: 'Add procedure' }).click();
  await expect(modal).toBeVisible(); // blocked until the type is typed
  await other.fill('Gum treatment');
  await modal.getByRole('button', { name: 'Add procedure' }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('article.proc strong').first()).toHaveText('Gum treatment');

  await page.getByRole('button', { name: 'Edit procedure' }).click();
  await expect(page.locator('.modal').getByLabel(/^Type of procedure/)).toHaveValue('Other');
  await expect(page.locator('.modal').getByLabel('Other type of procedure *')).toHaveValue('Gum treatment');
  await page.locator('.modal').getByLabel('Other type of procedure *').fill('Gum surgery');
  await page.locator('.modal').getByRole('button', { name: 'Save procedure' }).click();
  await expect(page.locator('article.proc strong').first()).toHaveText('Gum surgery');
});

test('past-dated procedures are ordered by date; the records table sorts', async ({ page }) => {
  for (const [type, date, tooth] of [['Filling', '', 16], ['Extraction', '2026-01-15', 38]] as const) {
    await page.getByRole('button', { name: '+ Add procedure' }).click();
    const modal = page.locator('.modal');
    await modal.getByLabel(/^Type of procedure/).selectOption(type);
    if (date) await modal.getByLabel('Date *').fill(date);
    await modal.locator(`g[aria-label^="Tooth ${tooth}:"]`).click();
    await modal.getByRole('button', { name: 'Add procedure' }).click();
    await expect(modal).toHaveCount(0);
  }
  await expect(page.getByText('38 · Extracted')).toBeVisible();
  await expect(page.locator('g.c-extracted[aria-label^="Tooth 38:"] path.cross')).toHaveCount(1);
  await expect(page.locator('article.proc strong')).toHaveText(['Filling', 'Extraction']); // newest first

  await page.goto('/records');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.locator('.th-btn', { hasText: 'Procedure' }).click();
  await expect(page.locator('tbody tr').first()).toContainText('Extraction');
});
