// A device that last ran 0.2.0 (IndexedDB schema v2, several addresses per patient) opens 0.3.0:
// the on-device upgrade runs in a real browser and the patient shows a single address line.
import { expect, test } from '@playwright/test';
import { createStaffPin } from './helpers';

test('0.2.0 device data is upgraded in the browser', async ({ page }) => {
  // A same-origin page that does not run the app, so the old database can be written first.
  await page.goto('/api/v1/healthz');
  await page.evaluate(async () => {
    const T0 = '2026-01-01T00:00:00.000Z';
    const base = { createdAt: T0, updatedAt: T0, isDeleted: false, dirty: 0 };
    const stores: Record<string, string[]> = {
      patients: ['lastName', 'updatedAt', 'dirty'],
      patient_contacts: ['patientId', 'dirty'],
      procedures: ['patientId', 'date', 'dirty'],
      dental_records: ['patientId', 'procedureId', 'recordedAt', 'dirty'],
      tooth_entries: ['patientId', 'recordId', 'procedureId', 'dirty'],
      patient_addresses: ['patientId', 'dirty'],
      payments: ['procedureId', 'dirty'],
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('clinic', 20); // Dexie stores version n as n * 10
      req.onupgradeneeded = () => {
        for (const [name, indexes] of Object.entries(stores)) {
          const s = req.result.createObjectStore(name, { keyPath: 'id' });
          for (const i of indexes) s.createIndex(i, i);
        }
        req.result.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(['patients', 'patient_addresses'], 'readwrite');
    tx.objectStore('patients').put({ ...base, id: 'p1', salutation: '', firstName: 'Lola', middleName: '', lastName: 'Basyang', birthDate: '1950-03-04', occupation: '', civilStatus: '', citizenshipCode: 'PH', photo: '', remarks: '' });
    const addr = { ...base, patientId: 'p1', label: '', district: '', province: '', postalCode: '', countryCode: 'PH' };
    tx.objectStore('patient_addresses').put({ ...addr, id: 'a1', street: 'Old St', city: 'Manila', isPrimary: false, createdAt: '2025-01-01T00:00:00.000Z' });
    tx.objectStore('patient_addresses').put({ ...addr, id: 'a2', street: '7 Burgos St', district: 'Brgy. 1', city: 'Vigan', province: 'Ilocos Sur', postalCode: '2700', isPrimary: true });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });

  await createStaffPin(page);
  await page.goto('/patients?q=basyang');
  await page.locator('a.prow').click();
  await expect(page.locator('.facts')).toContainText('7 Burgos St, Brgy. 1, Vigan, Ilocos Sur 2700');

  const after = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('clinic');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const stores = [...db.objectStoreNames];
    const p = await new Promise<Record<string, unknown>>((resolve) => {
      const r = db.transaction('patients').objectStore('patients').get('p1');
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    return { version: db.version, stores, dirty: p.dirty };
  });
  expect(after.version).toBe(30);
  expect(after.stores).not.toContain('patient_addresses');
  expect(after.dirty).toBe(1); // the converted address syncs on the next connection
});
