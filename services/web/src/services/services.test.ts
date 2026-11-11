// Integration tests: the real services against the real Dexie schema, on an in-memory IndexedDB.
import { beforeEach, describe, expect, test } from 'vitest';
import { buildDemoData, SYNC_TABLES } from '@clinic/shared';
import { db } from '../data/db';
import { emptyPatient, savePatient, type ContactInput } from './patientService';
import { addPayment, createProcedure, deleteProcedure, settleProcedures, updateProcedure } from './procedureService';
import { loadDemoData, removeDemoData } from './demoService';

beforeEach(async () => {
  await Promise.all([...SYNC_TABLES.map((t) => db.table(t).clear()), db.meta.clear()]);
});

const phone = (value: string, isPrimary = false): ContactInput => ({ type: 'phone', value, label: '', isPrimary });
const juan = () => ({ ...emptyPatient(), firstName: ' Juan ', lastName: 'Dela Cruz', birthDate: '1990-05-01' });

describe('patients', () => {
  test('defaults: Filipino citizenship and a PH address country', () => {
    expect(emptyPatient()).toMatchObject({ citizenshipCode: 'PH', addressCountryCode: 'PH', addressLine1: '' });
  });

  test('date of birth and citizenship are required; future birth dates are refused', async () => {
    await expect(savePatient(undefined, { ...juan(), birthDate: '' }, [])).rejects.toThrow('Date of birth is required');
    await expect(savePatient(undefined, { ...juan(), citizenshipCode: '' }, [])).rejects.toThrow('Citizenship is required');
    await expect(savePatient(undefined, { ...juan(), birthDate: '2999-01-01' }, [])).rejects.toThrow('future');
    expect(await db.patients.count()).toBe(0);
  });

  test('saves trimmed fields, one address line, and exactly one primary contact (dirty for sync)', async () => {
    const id = await savePatient(undefined, { ...juan(), addressLine1: ' 12 Mabini St, Quezon City ' }, [phone('0917 000 0001'), phone('0917 000 0002'), phone('  ')]);
    const p = (await db.patients.get(id))!;
    expect(p).toMatchObject({ firstName: 'Juan', addressLine1: '12 Mabini St, Quezon City', addressCountryCode: 'PH', dirty: 1 });
    const contacts = await db.patient_contacts.where('patientId').equals(id).sortBy('value');
    // phones gain the country code (PH unless chosen); the trunk 0 is dropped
    expect(contacts.map((c) => [c.value, c.isPrimary])).toEqual([['+63 917 000 0001', true], ['+63 917 000 0002', false]]);
  });

  test('no address line → no address country; editing removes dropped contacts softly', async () => {
    const id = await savePatient(undefined, { ...juan(), addressCountryCode: 'JP' }, [phone('1', true), phone('2')]);
    expect((await db.patients.get(id))!.addressCountryCode).toBe('');
    const [first] = (await db.patient_contacts.where('patientId').equals(id).sortBy('value'));
    await savePatient(id, { ...juan(), lastName: 'Santos' }, [{ ...phone('1', true), id: first.id }]);
    const all = await db.patient_contacts.where('patientId').equals(id).toArray();
    expect(all.filter((c) => !c.isDeleted).map((c) => c.value)).toEqual(['+63 1']);
    expect(all.find((c) => c.value === '+63 2')!.isDeleted).toBe(true);
    expect((await db.patients.get(id))!.lastName).toBe('Santos');
  });

  test('phone country codes: chosen country kept, shared codes resolved by the form choice, numbers with a plus kept', async () => {
    const id = await savePatient(undefined, juan(), [
      { ...phone('202 555 0100', true), country: 'US' },
      { ...phone('416 555 0100'), country: 'CA' },
      phone('+44 20 7946 0000'),
      phone('+639171234567'),
    ]);
    const values = (await db.patient_contacts.where('patientId').equals(id).toArray()).map((c) => c.value);
    expect(values.sort()).toEqual(['+1 202 555 0100', '+1 416 555 0100', '+44 20 7946 0000', '+63 9171234567']);
    expect((await db.patient_contacts.toArray()).some((c) => 'country' in c)).toBe(false); // form state is not stored
  });
});

describe('procedures', () => {
  const base = async () => ({ patientId: await savePatient(undefined, juan(), []), type: 'Filling', date: '2026-11-10', time: '09:30', costCents: 150000, remarks: '', teeth: [{ tooth: 16, condition: 'filled' as const, remarks: '' }] });

  test('creating a procedure also creates its dental record, tooth entries and first payment', async () => {
    const input = await base();
    const id = await createProcedure({ ...input, payment: { amountCents: 50000, method: 'e_wallet', remarks: '' } });
    const [record] = await db.dental_records.where('procedureId').equals(id).toArray();
    expect(record.recordedAt).toBe('2026-11-10T09:30');
    expect(await db.tooth_entries.where('recordId').equals(record.id).toArray()).toMatchObject([{ tooth: 16, condition: 'filled' }]);
    expect(await db.payments.where('procedureId').equals(id).toArray()).toMatchObject([{ amountCents: 50000, method: 'e_wallet', paidAt: '2026-11-10T09:30' }]);
  });

  test('a typed "Other" type is stored as typed; an empty type, bad tooth or zero payment is refused', async () => {
    const input = await base();
    const id = await createProcedure({ ...input, type: 'Gum treatment', teeth: [] });
    expect((await db.procedures.get(id))!.type).toBe('Gum treatment');
    await expect(createProcedure({ ...input, type: '  ' })).rejects.toThrow('type is required');
    await expect(createProcedure({ ...input, teeth: [{ tooth: 19, condition: 'filled', remarks: '' }] })).rejects.toThrow('not a valid FDI');
    await expect(addPayment(id, { amountCents: 0, method: 'cash', paidAt: '2026-11-10T10:00', remarks: '' })).rejects.toThrow('greater than zero');
  });

  test('changing the date moves the dental record; deleting removes everything softly', async () => {
    const id = await createProcedure({ ...(await base()), payment: { amountCents: 1000, method: 'cash', remarks: '' } });
    await updateProcedure(id, { date: '2026-11-01' });
    expect((await db.dental_records.where('procedureId').equals(id).first())!.recordedAt).toBe('2026-11-01T09:30');
    await deleteProcedure(id);
    for (const t of ['procedures', 'payments', 'dental_records', 'tooth_entries'] as const) {
      const rows = await db.table(t).toArray();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.isDeleted && r.dirty === 1)).toBe(true);
    }
  });
});

describe('dental classification', () => {
  test('optional (suggested from age); a chosen one is stored and synced; unknown values are refused', async () => {
    expect(emptyPatient().dentalClassification).toBe('');
    const id = await savePatient(undefined, { ...juan(), dentalClassification: 'mixed' }, []);
    expect(await db.patients.get(id)).toMatchObject({ dentalClassification: 'mixed', dirty: 1 });
    await expect(savePatient(undefined, { ...juan(), dentalClassification: 'baby' as never }, [])).rejects.toThrow('dental classification');
  });
});

describe('settling', () => {
  const visit = (patientId: string, costCents: number) =>
    createProcedure({ patientId, type: 'Filling', date: '2026-11-10', time: '09:00', costCents, remarks: '', teeth: [] });
  const paymentsOf = async (procedureId: string) => (await db.payments.where('procedureId').equals(procedureId).toArray()).filter((p) => !p.isDeleted);

  test('settles each record for exactly its remaining balance, skipping settled ones', async () => {
    const patientId = await savePatient(undefined, juan(), []);
    const a = await visit(patientId, 150000);
    const b = await visit(patientId, 80000);
    const c = await visit(patientId, 50000);
    await addPayment(a, { amountCents: 50000, method: 'cash', paidAt: '2026-11-10T09:00', remarks: '' });
    await addPayment(c, { amountCents: 50000, method: 'cash', paidAt: '2026-11-10T09:00', remarks: '' });

    const result = await settleProcedures([a, b, c, a], { method: 'e_wallet', paidAt: '2026-11-11T10:30', remarks: ' OR 12 ' });
    expect(result).toEqual({ count: 2, totalCents: 180000 });
    expect((await paymentsOf(a)).map((p) => p.amountCents).sort()).toEqual([100000, 50000].sort());
    expect(await paymentsOf(b)).toMatchObject([{ amountCents: 80000, method: 'e_wallet', paidAt: '2026-11-11T10:30', remarks: 'OR 12', dirty: 1 }]);
    expect(await paymentsOf(c)).toHaveLength(1);

    // settling again does nothing
    expect(await settleProcedures([a, b, c], { method: 'cash', paidAt: '2026-11-11T10:30', remarks: '' })).toEqual({ count: 0, totalCents: 0 });
  });

  test('a bad method or date, or an unknown record, settles nothing', async () => {
    const patientId = await savePatient(undefined, juan(), []);
    const a = await visit(patientId, 1000);
    await expect(settleProcedures([a], { method: 'barter' as never, paidAt: '2026-11-11T10:30', remarks: '' })).rejects.toThrow('Choose a payment method');
    await expect(settleProcedures([a], { method: 'cash', paidAt: 'yesterday', remarks: '' })).rejects.toThrow('A valid payment date is required');
    await expect(settleProcedures([a, 'missing'], { method: 'cash', paidAt: '2026-11-11T10:30', remarks: '' })).rejects.toThrow('Record not found');
    expect(await paymentsOf(a)).toHaveLength(0); // all or nothing
  });
});

describe('sample data', () => {
  test('loads every table as dirty rows, reloads without duplicates, and removes softly', async () => {
    const expected = buildDemoData();
    expect(await loadDemoData()).toBe(60);
    for (const t of SYNC_TABLES) expect(await db.table(t).count()).toBe(expected[t].length);
    expect((await db.patients.toArray()).every((p) => p.dirty === 1)).toBe(true);
    await loadDemoData();
    expect(await db.patients.count()).toBe(60);

    const mine = await savePatient(undefined, juan(), []);
    expect(await removeDemoData()).toBeGreaterThan(60);
    const live = (await db.patients.toArray()).filter((p) => !p.isDeleted);
    expect(live.map((p) => p.id)).toEqual([mine]); // real patients are untouched
  });
});
