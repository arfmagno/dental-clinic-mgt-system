// Patient photo: after a photo is added the picker shows only icon buttons (retake, delete), and
// the photo can be dragged to reposition it; the saved photo is the framed square.
import { expect, test, type Page } from '@playwright/test';
import { createStaffPin, expectToast, trackErrors } from './helpers';

/** A 400×200 PNG: left half red, right half blue. */
async function twoTone(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 200;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(200, 0, 200, 200);
    return c.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** Average colour of the saved patient photo on the patient page. */
const avatarColour = (page: Page) =>
  page.locator('.profile .avatar img').evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let r = 0;
    let b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      b += d[i + 2];
    }
    return { r: r / (d.length / 4), b: b / (d.length / 4), square: c.width === c.height };
  });

test('photo: upload, then only retake/delete icons; drag to reposition; the saved photo is the framed square', async ({ page }) => {
  const errors = trackErrors(page);
  await createStaffPin(page);
  await page.goto('/patients/new');
  const picker = page.locator('.photo-picker');
  await expect(picker.getByRole('button', { name: 'Camera' })).toBeVisible();
  const image = await twoTone(page);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), picker.getByRole('button', { name: 'Upload' }).click()]);
  await chooser.setFiles({ name: 'face.png', mimeType: 'image/png', buffer: image });

  // only icons now: retake (another upload) and delete, no text
  await expect(picker.getByRole('button', { name: 'Camera' })).toHaveCount(0);
  await expect(picker.getByRole('button', { name: 'Upload' })).toHaveCount(0);
  const buttons = picker.getByRole('button');
  await expect(buttons).toHaveCount(2);
  await expect(picker.getByRole('button', { name: 'Choose another photo' })).toHaveText('');
  await expect(picker.getByRole('button', { name: 'Delete photo' })).toHaveText('');

  // drag the photo all the way right: the frame now shows the red (left) half
  const frame = picker.getByRole('group', { name: /reposition/ });
  const box = (await frame.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 300, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  await page.getByLabel('First name *').fill('Photo');
  await page.getByLabel('Last name *').fill('Person');
  await page.getByLabel('Date of birth *').fill('1990-01-01');
  await page.getByRole('button', { name: 'Add patient' }).click();
  await expectToast(page, 'Patient added');
  const c = await avatarColour(page);
  expect(c.square).toBe(true);
  expect(c.r).toBeGreaterThan(200);
  expect(c.b).toBeLessThan(40);

  // editing: delete brings Camera / Upload back
  await page.locator('.profile').getByRole('button', { name: 'Edit', exact: true }).click();
  const modal = page.locator('.modal');
  await modal.getByRole('button', { name: 'Delete photo' }).click();
  await expect(modal.getByRole('button', { name: 'Camera' })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Upload' })).toBeVisible();
  expect(errors).toEqual([]);
});
