// The on-device database upgrades exactly like the server migrations: same transforms, same ids.
import Dexie from 'dexie';
import { describe, expect, test } from 'vitest';
import { deterministicUuid, legacyV3Address } from '@clinic/shared';
import { ClinicDB } from './db';

const T0 = '2026-01-01T00:00:00.000Z';
const row = <E extends Record<string, unknown>>(id: string, extra: E) => ({ id, createdAt: T0, updatedAt: T0, isDeleted: false, dirty: 0, ...extra });

const V1 = {
  patients: 'id, fullName, updatedAt, dirty',
  patient_contacts: 'id, patientId, dirty',
  procedures: 'id, patientId, date, dirty',
  dental_records: 'id, patientId, procedureId, recordedAt, dirty',
  tooth_entries: 'id, patientId, recordId, procedureId, dirty',
  meta: 'key',
};
const V2 = { ...V1, patients: 'id, lastName, updatedAt, dirty', patient_addresses: 'id, patientId, dirty', payments: 'id, procedureId, dirty' };

async function seed(name: string, version: 1 | 2, fill: (d: Dexie) => Promise<void>) {
  const old = new Dexie(name);
  old.version(1).stores(V1);
  if (version === 2) old.version(2).stores(V2);
  await old.open();
  await fill(old);
  old.close();
}

describe('device database upgrades', () => {
  test('v1 (0.1.0) → v3: names split, payment itemised, address becomes one line', async () => {
    await seed('up-v1', 1, async (d) => {
      await d.table('patients').put(row('p1', { fullName: 'Juan Dela Cruz', address: '12 Mabini St, QC', citizenship: 'Filipino', birthDate: '1990-01-01', remarks: '' }));
      await d.table('patients').put(row('p2', { fullName: 'Ana Reyes', address: '', citizenship: '', birthDate: '', remarks: '' }));
      await d.table('procedures').put(row('pr1', { patientId: 'p1', type: 'Filling', date: '2026-02-01', time: '10:00', costCents: 150000, paidCents: 50000, remarks: '' }));
    });
    const db = new ClinicDB('up-v1');
    await db.open();
    expect(db.verno).toBe(3);
    expect(db.tables.map((t) => t.name)).not.toContain('patient_addresses');

    const p1 = (await db.patients.get('p1'))! as unknown as Record<string, unknown>;
    expect(p1).toMatchObject({ firstName: 'Juan', lastName: 'Dela Cruz', citizenshipCode: 'PH', addressLine1: '12 Mabini St, QC', dirty: 1 });
    expect(p1).not.toHaveProperty('fullName');
    expect(p1).not.toHaveProperty('address');
    expect(await db.patients.get('p2')).toMatchObject({ addressLine1: '', addressCountryCode: '' });

    const [pay] = await db.payments.toArray();
    expect(pay).toMatchObject({ procedureId: 'pr1', amountCents: 50000, paidAt: '2026-02-01T10:00', dirty: 1 });
    expect(pay.id).toBe(deterministicUuid('v2-payment:pr1')); // the server migration derives the same id
    expect(await db.procedures.get('pr1')).not.toHaveProperty('paidCents');
    db.close();
  });

  test('v2 (0.2.0) → v3: primary address wins; untouched patients without an address are not re-synced', async () => {
    const addr = (id: string, patientId: string, extra: Record<string, unknown>) =>
      row(id, { patientId, label: '', street: '', district: '', city: '', province: '', postalCode: '', countryCode: 'PH', isPrimary: false, ...extra });
    const addresses = [
      addr('a1', 'p1', { street: 'Old St', createdAt: '2025-01-01T00:00:00.000Z' }),
      addr('a2', 'p1', { street: '12 Mabini St', city: 'Quezon City', province: 'Metro Manila', postalCode: '1100', isPrimary: true }),
      addr('a3', 'p3', { street: 'Gone', isDeleted: true, dirty: 1 }), // deleted on this device, not yet synced
      addr('a4', 'p4', { street: '2-1 Shibuya', city: 'Tokyo', countryCode: 'JP' }),
    ];
    await seed('up-v2', 2, async (d) => {
      for (const id of ['p1', 'p2', 'p3', 'p4']) await d.table('patients').put(row(id, { firstName: id, lastName: 'X', citizenshipCode: 'PH' }));
      await d.table('patient_addresses').bulkPut(addresses);
    });
    const db = new ClinicDB('up-v2');
    await db.open();
    const get = async (id: string) => (await db.patients.get(id))!;

    expect(await get('p1')).toMatchObject({ ...legacyV3Address(addresses.filter((a) => a.patientId === 'p1')), dirty: 1 });
    expect((await get('p1')).addressLine1).toBe('12 Mabini St, Quezon City, Metro Manila 1100');
    expect(await get('p2')).toMatchObject({ addressLine1: '', addressCountryCode: '', dirty: 0, updatedAt: T0 });
    expect(await get('p3')).toMatchObject({ addressLine1: '', dirty: 1 }); // the pending delete still syncs
    expect(await get('p4')).toMatchObject({ addressLine1: '2-1 Shibuya, Tokyo', addressCountryCode: 'JP' });
    db.close();
  });
});
