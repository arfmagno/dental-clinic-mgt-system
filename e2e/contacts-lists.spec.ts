// Phone country codes, the Transactions Contact button, and the list/label touches on
// Records, the dashboard, Patients (simple view) and a patient's payment history.
import { expect, test } from '@playwright/test';
import { addPatient, createStaffPin, expectToast, trackErrors } from './helpers';

test('phone numbers carry a country code (PH +63 by default); Transactions can contact the patient', async ({ page }) => {
  const errors = trackErrors(page);
  await createStaffPin(page);
  await page.goto('/patients/new');
  const cc = page.getByLabel('Country code');
  await expect(cc).toHaveValue('PH');
  await expect(cc.locator('option:checked')).toHaveText('🇵🇭 PH +63'); // short code, not the country name
  await page.getByLabel('First name *').fill('Aiko');
  await page.getByLabel('Last name *').fill('Tan');
  await page.getByLabel('Date of birth *').fill('1988-02-02');
  await cc.selectOption('JP');
  await page.getByLabel('Contact detail').first().fill('090 1234 5678');
  await page.getByRole('button', { name: 'Add patient' }).click();
  await expectToast(page, 'Patient added');
  await expect(page.locator('.facts')).toContainText('+81 90 1234 5678');

  // editing shows the saved country again
  await page.locator('.profile').getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('.modal').getByLabel('Country code')).toHaveValue('JP');
  await expect(page.locator('.modal').getByLabel('Contact detail').first()).toHaveValue('90 1234 5678');
  await page.locator('.modal').getByRole('button', { name: 'Cancel' }).click();

  await page.goto('/transactions');
  await page.getByRole('combobox', { name: 'Search patient' }).fill('aiko');
  await page.getByRole('option', { name: 'Aiko Tan' }).getByRole('button').click();
  const contact = page.locator('.summary').getByRole('link', { name: /^Contact Phone/ });
  await expect(contact).toHaveText('Contact');
  await expect(contact).toHaveAttribute('href', 'tel:+819012345678');

  // search still finds the patient by the number as people type it locally
  await page.goto('/patients');
  for (const q of ['090 1234', '9012345678', '+81 90']) {
    await page.getByLabel('Search patients').fill(q);
    await expect(page.locator('.prow', { hasText: 'Aiko' })).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test('Records search and Unpaid filter, dashboard kinds, Patients simple view, payment remove icon', async ({ page }) => {
  await createStaffPin(page);
  await addPatient(page, { first: 'Rico', last: 'Diaz', phone: '0917 111 2222' });
  await page.getByRole('button', { name: 'Add Record' }).click();
  await page.locator('.modal').getByLabel(/^Type of procedure/).selectOption('Filling');
  await page.locator('.modal').getByLabel('Cost (₱)').fill('1000');
  await page.locator('.modal').getByRole('button', { name: 'Add record' }).click();
  await expectToast(page, 'Record added');
  await page.getByRole('button', { name: 'Pay', exact: true }).click();
  await page.locator('.modal').getByLabel('Amount received (₱) *').fill('400');
  await page.locator('.modal').getByRole('button', { name: 'Record payment' }).click();
  await expectToast(page, 'Payment recorded');

  // payment history: the remove button is an icon, no text
  const remove = page.getByRole('button', { name: /^Remove payment of/ });
  await expect(remove).toHaveText('');
  await expect(remove.locator('svg')).toHaveCount(1);

  // dashboard: what changed (Patient / Procedure / Transaction), not added/removed
  await page.goto('/');
  const kinds = page.locator('.activity .badge');
  await expect(kinds).toHaveText(['Transaction', 'Procedure', 'Patient']);

  // records: "Search by patient…" with an icon, and "Unpaid"
  await page.goto('/records');
  const search = page.getByRole('searchbox', { name: 'Search records' });
  await expect(search).toHaveAttribute('placeholder', 'Search by patient, procedure, remarks…');
  await expect(page.locator('.search-box svg')).toHaveCount(1);
  await page.getByLabel('Unpaid', { exact: true }).check();
  await expect(page.locator('.rtable tbody tr')).toHaveCount(1);
  await search.fill('nobody');
  await expect(page.getByText('No records found.')).toBeVisible();

  // patients: simple view shows only names, and is remembered
  await page.goto('/patients');
  await expect(page.locator('.prow .avatar')).toHaveCount(1);
  const simple = page.getByRole('button', { name: 'Simple view' });
  await simple.click();
  await expect(simple).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.prow-simple')).toHaveCount(1);
  await expect(page.locator('.prow-simple')).toContainText('Rico');
  await expect(page.locator('.avatar')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.prow-simple')).toHaveCount(1);
});
