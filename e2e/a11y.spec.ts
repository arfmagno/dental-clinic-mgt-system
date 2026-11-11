// Automated accessibility checks (axe-core, WCAG 2.1 A/AA) on every main screen, light and dark.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createStaffPin, loadSampleData } from './helpers';

async function audit(page: Page, label: string) {
  // measure the settled screen, not a dialog halfway through its fade-in
  await page.waitForFunction(() => document.getAnimations().every((x) => x.playState !== 'running'));
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = violations.map((v) => `${label}: ${v.id} (${v.impact}) ${v.help} → ${v.nodes
      .slice(0, 4)
      .map((n) => `${n.target.join(' ')} [${(n.any[0]?.message ?? '').slice(0, 160)}]`)
      .join(' | ')}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test('first launch and lock screens have no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Create a staff PIN' })).toBeVisible();
  await audit(page, 'setup');
  await createStaffPin(page);
  await page.goto('/patients/new');
  await page.getByRole('button', { name: 'Hand to patient' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await audit(page, 'patient mode');
  await page.getByRole('button', { name: 'Staff unlock' }).click();
  await expect(page.getByRole('dialog', { name: 'Staff unlock' })).toBeVisible();
  await audit(page, 'staff unlock');
});

for (const theme of ['light', 'dark'] as const) {
  test(`main screens have no WCAG A/AA violations (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await createStaffPin(page);
    await loadSampleData(page);
    await page.evaluate((t) => {
      localStorage.setItem('clinic.feature.reports', '1');
      if (t === 'dark') localStorage.setItem('clinic.theme', 'dark');
    }, theme);
    const pages: [string, string][] = [
      ['/', 'Dashboard'],
      ['/patients', 'Patients'],
      ['/patients/new', 'Add Patient'],
      ['/records/new', 'Add Record'],
      ['/records', 'Records'],
      ['/transactions', 'Transactions'],
      ['/reports', 'Reports'],
      ['/settings?tab=activity', 'Settings'],
      ['/settings?tab=account', 'Settings'],
      ['/settings?tab=preferences', 'Settings'],
      ['/settings?tab=sync', 'Settings'],
      ['/settings?tab=backup', 'Settings'],
    ];
    for (const [path, heading] of pages) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
      await audit(page, `${path} (${theme})`);
    }
    // a patient with records: chart, procedures, payments
    await page.goto('/patients');
    await page.locator('a.prow').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await audit(page, `patient detail (${theme})`);
  });
}
