// Offline-first: nothing leaves the device until sync is on; works with no network; PDF export.
import { expect, test } from '@playwright/test';
import { addPatient, createStaffPin, PIN, SERVER_PASSWORD, serverRows } from './helpers';

test('offline by default, connect to sync, keep working offline, reconnect, soft delete', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  await createStaffPin(page);
  await addPatient(page, { first: 'Sync', last: 'Tester', phone: '0917 000 1111', address: '1 Rizal Ave, Manila' });
  await page.getByRole('button', { name: '+ Add procedure' }).click();
  await page.locator('.modal').getByLabel(/^Type of procedure/).selectOption('Cleaning (Prophylaxis)');
  await page.locator('.modal').getByLabel('Cost (₱)').fill('1200');
  await page.locator('.modal').getByLabel('Amount received now (₱)').fill('1200');
  await page.locator('.modal').getByRole('button', { name: 'Add procedure' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);

  const mine = (rows: Awaited<ReturnType<typeof serverRows>>) => rows.filter((r) => r.table === 'patients' && r.row.lastName === 'Tester');
  await page.waitForTimeout(2000);
  expect(mine(await serverRows(baseURL!))).toHaveLength(0); // offline by default: nothing sent

  // turn sync on → connect
  await page.locator('.sync .chip').click();
  await page.getByRole('dialog', { name: 'Sync settings' }).locator('.switch input').click();
  await expect(page).toHaveURL(/\/connect$/);
  await page.getByLabel('Clinic server password').fill('nope');
  await page.getByRole('button', { name: 'Connect and turn on sync' }).click();
  await expect(page.getByRole('alert')).toContainText(/incorrect/i);
  await page.getByLabel('Clinic server password').fill(SERVER_PASSWORD);
  await page.getByRole('button', { name: 'Connect and turn on sync' }).click();
  await expect(page).not.toHaveURL(/\/connect$/);

  await expect.poll(async () => mine(await serverRows(baseURL!)).length, { timeout: 20_000 }).toBe(1);
  const rows = await serverRows(baseURL!);
  const patient = mine(rows)[0].row;
  expect(patient).toMatchObject({ addressLine1: '1 Rizal Ave, Manila', addressCountryCode: 'PH', citizenshipCode: 'PH', birthDate: '1990-05-17' });
  const procs = rows.filter((r) => r.table === 'procedures' && r.row.patientId === patient.id);
  expect(procs).toHaveLength(1);
  expect(rows.filter((r) => r.table === 'payments' && r.row.procedureId === procs[0].row.id)).toHaveLength(1);
  expect(rows.some((r) => r.table === 'patient_addresses')).toBe(false);

  // no network: the installed app still opens and accepts new patients
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.goto('/patients/new');
  if (await page.getByRole('heading', { name: 'Clinic is locked' }).isVisible()) {
    await page.getByLabel('Staff PIN').fill(PIN);
    await page.getByRole('button', { name: 'Unlock' }).click();
  }
  await page.getByLabel('First name *').fill('Offline');
  await page.getByLabel('Last name *').fill('Walkin');
  await page.getByLabel('Date of birth *').fill('2001-01-01');
  await page.getByRole('button', { name: 'Add patient' }).click();
  await expect(page.getByRole('heading', { name: 'Offline Walkin' })).toBeVisible();
  const walkin = async () => (await serverRows(baseURL!)).find((r) => r.table === 'patients' && r.row.lastName === 'Walkin');
  expect(await walkin()).toBeUndefined();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await walkin())?.row.isDeleted, { timeout: 20_000 }).toBe(false);

  // delete is soft and syncs
  await page.getByRole('button', { name: 'Delete patient' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Delete patient' }).click();
  await expect(page).toHaveURL(/\/patients$/);
  await expect.poll(async () => (await walkin())?.row.isDeleted, { timeout: 20_000 }).toBe(true);
});

test('patient PDF export produces a PDF', async ({ page }) => {
  await createStaffPin(page);
  await addPatient(page, { first: 'Pdf', last: 'Export', address: '5 Luna St, Pasig' });
  const download = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
  const popup = page.context().waitForEvent('page', { timeout: 15_000 }).catch(() => null);
  await page.evaluate(() => {
    const w = window as unknown as { capturedPdf?: Blob };
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b: Blob | MediaSource) => {
      if (b instanceof Blob && b.type === 'application/pdf') w.capturedPdf = b;
      return orig(b);
    };
  });
  await page.getByRole('button', { name: 'Export PDF' }).click();
  await Promise.race([download, popup, page.waitForFunction(() => (window as unknown as { capturedPdf?: Blob }).capturedPdf, null, { timeout: 15_000 })]);
  const head = await page.evaluate(async () => {
    const b = (window as unknown as { capturedPdf?: Blob }).capturedPdf;
    return b ? { size: b.size, head: await b.slice(0, 5).text() } : null;
  });
  const d = await download;
  if (head) {
    expect(head.head).toBe('%PDF-');
    expect(head.size).toBeGreaterThan(3000);
  } else {
    expect(d?.suggestedFilename()).toMatch(/\.pdf$/);
  }
});
