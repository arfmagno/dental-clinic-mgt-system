// Phone layout (Android-sized screen), dental classification charts, and the Transactions settle flow.
import { expect, test, type Page } from '@playwright/test';
import { addPatient, createStaffPin, expectToast, trackErrors } from './helpers';

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.describe('on a phone', () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2.6 });

  test('bottom tab bar, add sheet, bottom-sheet forms, notifications; nothing scrolls sideways', async ({ page }) => {
    const errors = trackErrors(page);
    await createStaffPin(page);
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
    const tabs = page.getByRole('navigation', { name: 'Tabs' });
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole('link')).toHaveText(['Home', 'Patients', 'Records', 'Transactions']);
    expect(await noSideScroll(page)).toBe(true);

    await tabs.getByRole('button', { name: 'Add' }).click();
    const sheet = page.getByRole('menu', { name: 'Add' });
    await expect(sheet.getByRole('menuitem')).toHaveText(['Add Patient', 'Add Record']);
    await sheet.getByRole('menuitem', { name: 'Add Patient' }).click();
    await expect(page).toHaveURL(/\/patients\/new$/);
    await expect(sheet).toHaveCount(0);
    expect(await noSideScroll(page)).toBe(true);

    await page.getByLabel('First name *').fill('Lia');
    await page.getByLabel('Last name *').fill('Cruz');
    await page.getByLabel('Date of birth *').fill('1995-03-03');
    await page.getByRole('button', { name: 'Add patient' }).click();
    await expectToast(page, 'Patient added');
    expect(await noSideScroll(page)).toBe(true);

    await page.getByRole('button', { name: 'Add Record' }).click();
    const modal = page.locator('.modal');
    // full-width bottom sheet, resting on the bottom edge once it has slid up
    await expect.poll(async () => { const b = (await modal.boundingBox())!; return [Math.round(b.width), Math.round(b.y + b.height)]; }).toEqual([412, 915]);
    await modal.getByLabel(/^Type of procedure/).selectOption('Filling');
    await modal.getByLabel('Cost (₱)').fill('900');
    await modal.getByRole('button', { name: 'Add record' }).click();
    await expectToast(page, 'Record added');

    await tabs.getByRole('link', { name: 'Records' }).click();
    await expect(page.locator('.rtable thead')).toBeHidden(); // table becomes cards
    expect(await noSideScroll(page)).toBe(true);
    await tabs.getByRole('link', { name: 'Transactions' }).click();
    await expect(page.locator('.stat')).toContainText('₱900.00'); // the outstanding balance lives here
    expect(await noSideScroll(page)).toBe(true);
    expect(errors).toEqual([]);
  });
});

test('dental classification decides the chart: Adult by default, by age or chosen by the dentist', async ({ page }) => {
  await createStaffPin(page);
  await addPatient(page, { first: 'Bea', last: 'Lim', birthDate: '2018-06-01' }); // 8 years old
  const charts = page.locator('.charts');
  await expect(page.locator('.facts')).toContainText('Adult (permanent teeth)');
  await expect(charts.locator('svg.odontogram')).toHaveCount(1);

  await page.locator('.profile').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('.modal').getByLabel('Dental classification').selectOption('');
  await page.locator('.modal').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.facts')).toContainText('Mixed dentition (by age)');
  await expect(charts.locator('figcaption')).toHaveText(['Primary teeth', 'Permanent teeth']);

  await page.locator('.profile').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('.modal').getByLabel('Dental classification').selectOption('primary');
  await page.locator('.modal').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await expect(page.locator('.facts')).toContainText('Pediatric (primary teeth)');
  await expect(page.locator('.facts')).not.toContainText('(by age)');
  await expect(charts.locator('svg.odontogram')).toHaveCount(1);
  await expect(charts.locator('g[aria-label^="Tooth 55:"]')).toHaveCount(1);
  await expect(charts.locator('g[aria-label^="Tooth 16:"]')).toHaveCount(0);

  // the record form shows the same chart
  await page.getByRole('button', { name: 'Add Record' }).click();
  await expect(page.locator('.modal g[aria-label^="Tooth 55:"]')).toHaveCount(1);
  await expect(page.locator('.modal g[aria-label^="Tooth 16:"]')).toHaveCount(0);
});

test('transactions: pick a patient, settle one partly, then settle the rest in bulk', async ({ page }) => {
  const errors = trackErrors(page);
  await createStaffPin(page);
  await addPatient(page, { first: 'Tess', last: 'Uy' });
  for (const [type, cost] of [['Filling', '1500'], ['X-ray', '500'], ['Crown', '8000']] as const) {
    await page.getByRole('button', { name: 'Add Record' }).click();
    await page.locator('.modal').getByLabel(/^Type of procedure/).selectOption(type);
    await page.locator('.modal').getByLabel('Cost (₱)').fill(cost);
    await page.locator('.modal').getByRole('button', { name: 'Add record' }).click();
    await expect(page.locator('.modal')).toHaveCount(0);
  }

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Transactions' }).click();
  await page.getByRole('combobox', { name: 'Search patient' }).fill('tess');
  await page.getByRole('option', { name: 'Tess Uy' }).click();
  await expect(page).toHaveURL(/patientId=/);
  await expect(page.locator('.summary')).toContainText('₱10,000.00');
  await expect(page.locator('.txn')).toHaveCount(3);

  // one record, part payment
  await page.locator('.txn', { hasText: 'Crown' }).getByRole('button', { name: 'Settle' }).click();
  await page.locator('.modal').getByLabel('Amount received (₱) *').fill('3000');
  await page.locator('.modal').getByRole('button', { name: 'Record payment' }).click();
  await expectToast(page, 'Payment recorded');
  await expect(page.locator('.summary')).toContainText('₱7,000.00');
  await expect(page.locator('.txn', { hasText: 'Crown' })).toContainText('₱5,000.00');

  // the rest, in bulk
  await page.getByLabel('Select all').check();
  await page.getByRole('region', { name: 'Selected records' }).getByRole('button', { name: 'Settle' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settle 3 records' });
  await dialog.getByLabel('Method').selectOption('e_wallet');
  await dialog.getByRole('button', { name: 'Settle ₱7,000.00' }).click();
  await expectToast(page, 'Settled 3 records · ₱7,000.00');
  await expect(page.getByText('All settled. Nothing to collect.')).toBeVisible();
  await expect(page.locator('.summary')).toContainText('₱0.00');
  await expect(page.locator('.pay-list li')).toHaveCount(4);
  expect(errors).toEqual([]);
});
