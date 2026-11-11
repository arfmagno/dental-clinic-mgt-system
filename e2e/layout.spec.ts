// Layout audit: with the sample data loaded, no page (or open dialog) runs past the side of the
// screen, from a small phone up to a desktop window.
import { expect, test, type Page } from '@playwright/test';
import { createStaffPin, loadSampleData } from './helpers';

const WIDTHS = [320, 360, 412, 600, 768, 900, 1024, 1100, 1280];

/** Elements whose box crosses the left or right edge of the window and are not clipped by a scroll container. */
const offenders = (page: Page) =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const clipped = (el: Element) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox !== 'visible') {
          const r = a.getBoundingClientRect();
          return r.left >= -1 && r.right <= vw + 1;
        }
      }
      return false;
    };
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.position === 'fixed' && r.width <= vw + 1 && r.left >= -1) continue;
      if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) {
        const name = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`;
        out.push(`${name} [${Math.round(r.left)}..${Math.round(r.right)}] "${(el.textContent ?? '').trim().slice(0, 40)}"`);
      }
    }
    const doc = document.documentElement.scrollWidth > vw ? [`document scrollWidth ${document.documentElement.scrollWidth} > ${vw}`] : [];
    // The top navigation scrolls sideways rather than overflowing, so check that every link fits.
    const nav = document.querySelector<HTMLElement>('.topnav');
    const navCut = nav && nav.offsetParent && nav.scrollWidth > nav.clientWidth + 1 ? [`top navigation cut off (${nav.scrollWidth} > ${nav.clientWidth})`] : [];
    return [...doc, ...navCut, ...out.slice(0, 8)];
  });

test('no page or dialog runs off the side of the screen', async ({ page }) => {
  test.setTimeout(240_000);
  await createStaffPin(page);
  await loadSampleData(page);
  await page.goto('/patients');
  await page.locator('.prow').first().click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/);
  const patientUrl = new URL(page.url()).pathname;
  const patientId = patientUrl.split('/').pop()!;

  const views: { name: string; path: string; open?: (p: Page) => Promise<void> }[] = [
    { name: 'dashboard', path: '/?demo' },
    { name: 'patients', path: '/patients' },
    { name: 'add patient', path: '/patients/new' },
    { name: 'patient', path: patientUrl },
    { name: 'patient: add record', path: patientUrl, open: (p) => p.getByRole('button', { name: 'Add Record' }).click() },
    { name: 'add record', path: `/records/new?patientId=${patientId}` },
    { name: 'records', path: '/records' },
    { name: 'transactions', path: `/transactions?patientId=${patientId}` },
    { name: 'connect', path: '/connect' },
  ];

  const problems: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const v of views) {
      await page.goto(v.path);
      await page.locator('main h1').first().waitFor();
      if (v.open) {
        await v.open(page);
        await page.locator('.modal').waitFor();
        await page.waitForTimeout(250);
      }
      const bad = await offenders(page);
      if (bad.length) problems.push(`${width}px ${v.name}:\n    ${bad.join('\n    ')}`);
    }
  }
  expect(problems, problems.join('\n')).toEqual([]);
});
