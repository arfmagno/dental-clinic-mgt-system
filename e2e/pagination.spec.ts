// Long lists are paginated: Records (table), Transactions (patients with a balance, a patient's history).
import { expect, test } from '@playwright/test';
import { createStaffPin, loadSampleData } from './helpers';

test('Records and Transactions paginate; searching goes back to page 1', async ({ page }) => {
  await createStaffPin(page);
  await loadSampleData(page);

  await page.goto('/records');
  await expect(page.getByText(/^Showing 1–25 of \d+ records$/)).toBeVisible();
  await expect(page.locator('table.rtable tbody tr')).toHaveCount(25);
  const pager = page.getByRole('navigation', { name: 'Record pages' });
  await pager.getByRole('button', { name: '2', exact: true }).click();
  await expect(page.getByText(/^Showing 26–50 of \d+ records$/)).toBeVisible();
  await expect(pager.getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByLabel('Search records').fill('a');
  await expect(page.getByText(/^Showing 1–/)).toBeVisible();

  await page.goto('/transactions');
  const owing = page.locator('.owing-list li');
  await expect(owing.first()).toBeVisible();
  const count = await owing.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(20);
  const patients = page.getByRole('navigation', { name: 'Patient pages' });
  if (await patients.isVisible()) {
    const first = await owing.first().textContent();
    await patients.getByRole('button', { name: 'Next' }).click();
    await expect(owing.first()).not.toHaveText(first!);
  }
});
