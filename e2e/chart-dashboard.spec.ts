// Updating the dental chart without a procedure; the dashboard (actions, recent activity, Settle
// Balances); Settings (full activity log, preferences, sync, backup).
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { addPatient, createStaffPin, expectToast, loadSampleData, trackErrors } from './helpers';

test('the dental chart can be updated without a procedure, viewed at that point, and the update deleted', async ({ page }) => {
  const errors = trackErrors(page);
  await createStaffPin(page);
  await addPatient(page, { first: 'Lito', last: 'Ramos' });

  await page.getByRole('button', { name: 'Update chart' }).click();
  const modal = page.locator('.modal');
  await expect(modal.getByRole('heading', { name: /^Update chart/ })).toBeVisible();
  await modal.getByRole('button', { name: 'Save chart' }).click();
  await expect(modal.getByRole('alert')).toHaveText('Tap at least one tooth on the chart.');

  await modal.locator('g[aria-label^="Tooth 16:"]').click();
  await modal.getByLabel('Condition of tooth 16').selectOption('cavity');
  await modal.getByLabel('Remarks for tooth 16').fill('seen at check-up');
  await modal.getByLabel('Notes').fill('Initial exam');
  await modal.getByRole('button', { name: 'Save chart' }).click();
  await expectToast(page, 'Chart updated');

  const chart = page.locator('.card', { has: page.getByRole('heading', { name: 'Dental chart' }) });
  await expect(chart.locator('g[aria-label="Tooth 16: Cavity"]')).toHaveCount(1);
  await expect(chart.locator('.tooth-notes')).toContainText('16 Cavity — seen at check-up');
  const updates = chart.locator('.chart-updates li');
  await expect(updates).toHaveCount(1);
  await expect(updates).toContainText('Initial exam');
  await expect(page.getByText('No records yet.')).toBeVisible(); // no procedure was created

  // the dashboard lists it as a chart action
  await page.goto('/');
  await expect(page.locator('.activity .activity-kind').first()).toHaveText('Chart');
  await page.locator('.activity a', { hasText: 'Chart update · Lito Ramos' }).click();

  // delete the update: the tooth goes back to healthy
  await page.getByRole('button', { name: /^Delete chart update of/ }).click();
  await page.locator('.modal').getByRole('button', { name: 'Delete chart update' }).click();
  await expectToast(page, 'Chart update deleted');
  await expect(chart.locator('g[aria-label="Tooth 16: Cavity"]')).toHaveCount(0);
  await expect(chart.locator('.chart-updates')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('dashboard: highlighted actions and a short recent list; the full log lives in Settings', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await createStaffPin(page);
  await loadSampleData(page);

  const actions = page.getByRole('navigation', { name: 'Actions' });
  await expect(actions.getByRole('link')).toHaveText([/Add Patient/, /Add Record/, /Find Patient/, /Transactions/, /Settle Balances/]);
  await expect(actions.getByRole('link', { name: /Settle Balances/ })).toContainText(/patients? owes? ₱/);
  const recent = page.getByRole('region', { name: 'Recent activity' });
  await expect(recent.locator('.activity li')).toHaveCount(8); // truncated
  await expect(page.getByRole('region', { name: 'Today' })).toHaveCount(0); // no reports on the dashboard
  await expect(page.getByRole('region', { name: 'Collections' })).toHaveCount(0);
  const box = (await actions.boundingBox())!;
  expect((await recent.boundingBox())!.y).toBeGreaterThan(box.y + box.height - 1); // below the actions

  // the gear at the right end of the top bar opens Settings on the full activity log
  const gear = page.locator('.topbar').getByRole('link', { name: 'Settings' });
  const tools = await page.locator('.topbar-tools > *').all();
  expect(await tools.at(-1)!.getAttribute('aria-label')).toBe('Settings');
  await recent.getByRole('link', { name: 'View all' }).click();
  await expect(page).toHaveURL(/\/settings\?tab=activity$/);
  await expect(gear).toHaveClass(/active/);
  const log = page.getByRole('region', { name: 'Activity log' });
  const count = Number((await log.locator('.activity-head .small').textContent())!.split(' ')[0]);
  expect(count).toBeGreaterThan(100);
  const rows = log.locator('.activity li');
  await expect(rows).toHaveCount(50);
  const scroller = log.locator('.activity-scroll');
  await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(rows).toHaveCount(100);
  await log.getByRole('button', { name: 'Transactions' }).click();
  expect(new Set(await log.locator('.activity .activity-kind').allTextContents())).toEqual(new Set(['Transaction']));

  // Settle Balances: everyone who owes, then settle one patient
  await page.goto('/');
  await actions.getByRole('link', { name: /Settle Balances/ }).click();
  const owing = page.getByRole('region', { name: 'Patients with a balance' });
  await expect(owing.locator('li').first()).toBeVisible();
  const first = owing.locator('li button').first();
  const who = (await first.locator('.grow').textContent())!;
  await first.click();
  await expect(page).toHaveURL(/patientId=/);
  await expect(page.locator('.summary')).toContainText(who.split(' ')[0]);
});

test('settings: backup exports every record as an encrypted file; another device restores it with the passphrase', async ({ page, browser }) => {
  await createStaffPin(page);
  await addPatient(page, { first: 'Backup', last: 'Person', phone: '0917 555 0000' });
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Backup' }).click();
  const section = page.getByRole('region', { name: 'Backup' });
  await expect(section).toContainText('No backup has been made from this device yet.');
  await expect(section.getByRole('button', { name: 'Export all data' })).toBeDisabled(); // a passphrase is needed
  await section.getByLabel('Backup passphrase').fill('clinic backup 2026');
  await section.getByLabel('Repeat passphrase').fill('clinic backup 2026');
  const [download] = await Promise.all([page.waitForEvent('download'), section.getByRole('button', { name: 'Export all data' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^magno-dental-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  const text = readFileSync((await download.path())!, 'utf8');
  expect(JSON.parse(text)).toMatchObject({ format: 'magno-dental-clinic-backup', version: 1, encrypted: { cipher: 'AES-256-GCM' } });
  expect(text).not.toContain('Person'); // nothing readable without the passphrase
  await expectToast(page, 'Encrypted backup saved · 1 patient');
  await expect(section).toContainText('Last backup from this device');

  // a new computer (empty browser profile) restores the file
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await createStaffPin(other);
  await other.goto('/settings?tab=backup');
  const restore = other.getByRole('region', { name: 'Backup' });
  await restore.getByLabel('Choose backup file').setInputFiles({ name: 'not-a-backup.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(restore.getByRole('alert')).toHaveText('This file is not a Magno Dental Clinic backup.');
  await restore.getByLabel('Choose backup file').setInputFiles((await download.path())!);
  await restore.getByLabel('Passphrase for this backup').fill('wrong passphrase');
  await restore.getByRole('button', { name: 'Open backup' }).click();
  await expect(restore.getByRole('alert')).toHaveText('Wrong passphrase, or the file has been changed.');
  await restore.getByLabel('Passphrase for this backup').fill('clinic backup 2026');
  await restore.getByRole('button', { name: 'Open backup' }).click();
  const dialog = other.getByRole('alertdialog', { name: 'Restore this backup?' });
  await expect(dialog).toContainText('1 patient, 0 procedures and 0 payments');
  await dialog.getByRole('button', { name: 'Restore backup' }).click();
  await expectToast(other, 'Backup restored · 4 added, 0 updated'); // patient, contact, 2 activity entries (not the other device's staff account)
  await other.goto('/patients');
  await expect(other.locator('a.prow', { hasText: 'Backup Person' })).toHaveCount(1);
  await fresh.close();
});
