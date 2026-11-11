// Reports are an optional feature: hidden until switched on under Settings → Preferences.
import { expect, test } from '@playwright/test';
import { createStaffPin, loadSampleData, trackErrors } from './helpers';

test('reports are off by default; switching them on adds a dashboard summary and a Reports page', async ({ page }) => {
  const errors = trackErrors(page);
  await createStaffPin(page);
  await loadSampleData(page);

  // off: no summary, no nav link, the page redirects home
  await expect(page.getByRole('region', { name: 'Last 30 days' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Reports' })).toHaveCount(0);
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.goto('/settings?tab=preferences');
  const toggle = page.getByRole('switch', { name: 'Show reports' });
  await expect(toggle).not.toBeChecked();
  await toggle.check();

  await page.getByRole('link', { name: 'Home', exact: true }).click();
  const summary = page.getByRole('region', { name: 'Last 30 days' });
  await expect(summary).toContainText('Collected');
  await expect(summary).toContainText('Outstanding today');
  await summary.getByRole('link', { name: 'View reports' }).click();

  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Reports' })).toHaveAttribute('class', /active/);
  await expect(page.getByRole('img', { name: /Collections · last 30 days/ })).toBeVisible();
  await page.getByRole('button', { name: 'Last 12 months' }).click();
  await expect(page).toHaveURL(/period=12m/);
  const chart = page.getByRole('region', { name: 'Collections' });
  await chart.getByRole('button', { name: 'Show table' }).click();
  await expect(chart.locator('tbody tr')).toHaveCount(12);
  await expect(page.getByRole('region', { name: 'Unpaid balances by age' })).toContainText('Over 90 days');

  // switched off again: gone
  await page.goto('/settings?tab=preferences');
  await page.getByRole('switch', { name: 'Show reports' }).uncheck();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Reports' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
