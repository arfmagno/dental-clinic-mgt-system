// Patients: the add form (v0.3 rules), details, patient mode, and the list with sample data.
import { expect, test } from '@playwright/test';
import { addPatient, createStaffPin, loadSampleData, PIN, trackErrors } from './helpers';

test.beforeEach(async ({ page }) => {
  await createStaffPin(page);
});

test('add patient: last name and date of birth are required; citizenship defaults to Filipino', async ({ page }) => {
  const errors = trackErrors(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Add Patient' }).click();
  await expect(page).toHaveURL(/\/patients\/new$/);
  await expect(page.locator('.topbar')).toBeVisible(); // a staff page, not the isolated patient mode

  const form = page.locator('form');
  await expect(form.getByRole('button', { name: 'Add patient' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Cancel' })).toBeVisible();

  await page.getByLabel('First name *').fill('Maria');
  await form.getByRole('button', { name: 'Add patient' }).click();
  await expect(page.getByRole('alert')).toHaveText('Last name is required');
  await page.getByLabel('Last name *').fill('Santos');
  await form.getByRole('button', { name: 'Add patient' }).click();
  await expect(page.getByRole('alert')).toHaveText('Date of birth is required');

  const citizenship = page.getByLabel('Citizenship *');
  await expect(citizenship.locator('option:checked')).toHaveText('Filipino');
  await expect(citizenship.locator('option').nth(1)).not.toHaveText('Philippines'); // nationalities, not countries

  // one address line + country; no multiple addresses
  await expect(page.getByLabel('Address', { exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Country')).toHaveValue('PH');
  await expect(page.getByRole('button', { name: /add address/i })).toHaveCount(0);

  await page.getByLabel('Salutation').selectOption('Ms.');
  await page.getByLabel('Middle name').fill('Clara');
  await page.getByLabel('Date of birth *').fill('1990-05-17');
  await page.getByLabel('Contact detail').first().fill('0917 555 0101');
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  await page.getByLabel('Contact type').nth(1).selectOption('messenger');
  await page.getByLabel('Contact detail').nth(1).fill('m.me/maria.santos');
  await page.locator('.contact-row').nth(1).locator('.primary-pick input').check();
  await page.getByLabel('Address', { exact: true }).fill('12 Mabini St, Brgy. San Roque, Quezon City');
  await form.getByRole('button', { name: 'Add patient' }).click();

  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/);
  const facts = page.locator('.facts');
  await expect(page.getByText('Ms. Maria Clara Santos')).toBeVisible();
  await expect(facts).toContainText('Filipino');
  await expect(facts).toContainText('12 Mabini St, Brgy. San Roque, Quezon City');
  await expect(facts).not.toContainText('Philippines'); // the country is only shown when not PH
  await expect(facts).toContainText(/m\.me\/maria\.santos[\s\S]*primary[\s\S]*0917/i);
  expect(errors).toEqual([]);
});

test('a foreign address shows its country; editing keeps a single address', async ({ page }) => {
  await addPatient(page, { first: 'Kenji', last: 'Sato', address: '2-1 Shibuya, Tokyo' });
  await page.locator('.profile').getByRole('button', { name: 'Edit', exact: true }).click();
  const modal = page.locator('.modal');
  await modal.getByLabel('Citizenship *').selectOption({ label: 'Japanese' });
  await modal.getByLabel('Country').selectOption({ label: 'Japan' });
  await modal.getByRole('button', { name: 'Save changes' }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator('.facts')).toContainText('2-1 Shibuya, Tokyo, Japan');
  await expect(page.locator('.facts')).toContainText('Japanese');
});

test('patient mode: from Add Patient, isolated, survives reload, PIN to leave', async ({ page }) => {
  await page.goto('/patients/new');
  await page.getByRole('button', { name: 'Hand to patient' }).click();
  await expect(page.locator('.topbar')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.topbar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();
  await expect(page.getByLabel('Remarks')).toHaveCount(0); // staff-only field

  await page.getByLabel('First name *').fill('Pedro');
  await page.getByLabel('Last name *').fill('Penduko');
  await page.getByLabel('Date of birth *').fill('1985-02-03');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you!' })).toBeVisible();

  await page.getByRole('button', { name: /Staff unlock/ }).click();
  await page.locator('.modal').getByLabel('Staff PIN').fill('0000');
  await page.locator('.modal').getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('.modal').getByRole('alert')).toBeVisible();
  await expect(page.locator('.topbar')).toHaveCount(0);
  await page.locator('.modal').getByLabel('Staff PIN').fill(PIN);
  await page.locator('.modal').getByRole('button', { name: 'Unlock' }).click();
  await expect(page.locator('.topbar')).toBeVisible();

  await page.goto('/patients?q=penduko');
  await expect(page.locator('a.prow')).toHaveCount(1);
});

test('sample data: list grouped by last-name initial, 25 per page, A–Z jump, search', async ({ page }) => {
  await loadSampleData(page);
  await expect(page.locator('.stat')).toHaveCount(0); // no patient / balance cards on the dashboard

  await page.goto('/patients');
  await expect(page.getByText(/of 60 patients/)).toBeVisible();
  await expect(page.locator('a.prow')).toHaveCount(25);
  const groups = await page.locator('.group-head').allTextContents();
  expect(groups).toEqual([...groups].sort());
  await expect(page.getByRole('navigation', { name: 'Pages' })).toBeVisible();

  const lastLetter = page.locator('.az button:not([disabled])').last();
  const letter = (await lastLetter.textContent())!.trim();
  await lastLetter.click();
  await expect(page).toHaveURL(/page=3/);
  await expect(page.locator('.group-head', { hasText: letter })).toBeVisible();

  await page.getByLabel('Search patients').fill('quezon city');
  await expect(page).not.toHaveURL(/page=/); // searching resets paging
  const n = await page.locator('a.prow').count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(25);

  // removing the sample data leaves the list empty again
  await page.goto('/?demo');
  let browserDialog = false;
  page.on('dialog', (d) => ((browserDialog = true), void d.dismiss()));
  await page.getByRole('region', { name: 'Sample data' }).getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Remove sample data?' }).getByRole('button', { name: 'Remove sample data' }).click();
  await expect(page.getByRole('status')).toHaveText('Sample data removed.');
  expect(browserDialog).toBe(false); // in-app pop-up, not a browser confirm
  await page.goto('/patients');
  await expect(page.getByText('No patients yet.')).toBeVisible();
});
