import { expect, type Page } from '@playwright/test';

export const PIN = '1234';
export const SERVER_PASSWORD = 'e2e-password';

/** First launch on a fresh device: create the staff PIN and land on the dashboard. */
export async function createStaffPin(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Create a staff PIN' })).toBeVisible();
  await page.getByLabel('New PIN (4–6 digits)').fill(PIN);
  await page.getByLabel('Repeat PIN').fill(PIN);
  await page.getByRole('button', { name: 'Create PIN' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
}

/** Loads the sample patients through the dashboard tool (available in any build via ?demo). */
export async function loadSampleData(page: Page) {
  await page.goto('/?demo');
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await expect(page.getByRole('status')).toHaveText('Loaded 60 sample patients.');
}

export interface NewPatient {
  first: string;
  last: string;
  birthDate?: string;
  address?: string;
  phone?: string;
}

/** Fills the staff "Add patient" page and saves; ends on the new patient's page. */
export async function addPatient(page: Page, p: NewPatient) {
  await page.goto('/patients/new');
  await page.getByLabel('First name *').fill(p.first);
  await page.getByLabel('Last name *').fill(p.last);
  await page.getByLabel('Date of birth *').fill(p.birthDate ?? '1990-05-17');
  if (p.phone) await page.getByLabel('Contact detail').first().fill(p.phone);
  if (p.address) await page.getByLabel('Address', { exact: true }).fill(p.address);
  await page.getByRole('button', { name: 'Add patient' }).click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/);
}

/** Server-side view of synced rows (what other devices would receive). */
export async function serverRows(baseURL: string) {
  const login = await fetch(`${baseURL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: SERVER_PASSWORD }),
  });
  const { token } = (await login.json()) as { token: string };
  const rows: { table: string; row: Record<string, unknown> }[] = [];
  let since = 0;
  for (;;) {
    const res = await fetch(`${baseURL}/api/v1/sync/pull?since=${since}&limit=1000`, { headers: { authorization: `Bearer ${token}` } });
    const page = (await res.json()) as { rows: typeof rows; cursor: number; hasMore: boolean };
    rows.push(...page.rows);
    since = page.cursor;
    if (!page.hasMore) return rows;
  }
}

/** Collects uncaught page errors and console errors (network errors excluded). */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text());
  });
  return errors;
}
