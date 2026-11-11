// Integration tests: the real services against the real Dexie schema, on an in-memory IndexedDB.
import { beforeEach, describe, expect, test } from 'vitest';
import { buildDemoData, SYNC_TABLES } from '@clinic/shared';
import { setActor } from '../data/actor';
import { db } from '../data/db';
import { emptyPatient, savePatient, type ContactInput } from './patientService';
import { addPayment, createChartUpdate, createProcedure, deleteChartUpdate, deleteProcedure, settleProcedures, updateProcedure } from './procedureService';
import { buildChart } from '../domain/chart';
import { BACKUP_FORMAT, BackupError, backupFileName, buildBackup, decryptBackup, encryptBackup, encryptedEnvelope, parseBackup, restoreBackup } from './backupService';

/** Signs in an admin (written directly: hashing a real PIN is slow and not under test here). */
async function asAdmin() {
  const now = new Date().toISOString();
  await db.staff.put({ id: 'admin-1', createdAt: now, updatedAt: now, isDeleted: false, dirty: 1, name: 'Dr. Admin', role: 'admin', pinSalt: 'c2FsdA==', pinHash: 'aGFzaA==', pinIterations: 1 });
  setActor('admin-1');
}

beforeEach(async () => {
  await Promise.all([...SYNC_TABLES.map((t) => db.table(t).clear()), db.meta.clear()]);
  await asAdmin();
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

describe('chart updates (no procedure)', () => {
  const chartOf = async (patientId: string) =>
    buildChart(await db.dental_records.where('patientId').equals(patientId).toArray(), await db.tooth_entries.where('patientId').equals(patientId).toArray());

  test('change the chart without a procedure; later updates override earlier ones per tooth', async () => {
    const patientId = await savePatient(undefined, juan(), []);
    await createProcedure({ patientId, type: 'Filling', date: '2026-11-01', time: '09:00', costCents: 0, remarks: '', teeth: [{ tooth: 16, condition: 'filled', remarks: '' }] });
    const id = await createChartUpdate({ patientId, date: '2026-11-05', time: '10:00', remarks: ' Exam ', teeth: [{ tooth: 16, condition: 'cavity', remarks: ' recurrent ' }, { tooth: 21, condition: 'crown', remarks: '' }] });
    expect(await db.dental_records.get(id)).toMatchObject({ procedureId: null, recordedAt: '2026-11-05T10:00', remarks: 'Exam', dirty: 1 });
    expect(await db.procedures.count()).toBe(1); // no procedure, no charge
    const chart = await chartOf(patientId);
    expect(chart.get(16)).toMatchObject({ condition: 'cavity', remarks: 'recurrent', procedureId: null });
    expect(chart.get(21)?.condition).toBe('crown');

    await deleteChartUpdate(id);
    expect((await chartOf(patientId)).get(16)?.condition).toBe('filled');
    expect((await db.tooth_entries.where('recordId').equals(id).toArray()).every((e) => e.isDeleted && e.dirty === 1)).toBe(true);
  });

  test('needs a tooth, valid teeth and a live patient; a procedure record is not deleted this way', async () => {
    const patientId = await savePatient(undefined, juan(), []);
    const input = { patientId, date: '2026-11-05', time: '', remarks: '', teeth: [{ tooth: 11, condition: 'missing' as const, remarks: '' }] };
    await expect(createChartUpdate({ ...input, teeth: [] })).rejects.toThrow('at least one tooth');
    await expect(createChartUpdate({ ...input, teeth: [{ tooth: 19, condition: 'missing', remarks: '' }] })).rejects.toThrow('not a valid FDI');
    await expect(createChartUpdate({ ...input, patientId: 'nobody' })).rejects.toThrow('existing patient');
    const procId = await createProcedure({ patientId, type: 'Filling', date: '2026-11-01', time: '09:00', costCents: 0, remarks: '', teeth: [] });
    const rec = (await db.dental_records.where('procedureId').equals(procId).first())!;
    await expect(deleteChartUpdate(rec.id)).rejects.toThrow('belongs to a procedure');
  });
});

describe('input rules (the same ones the server enforces)', () => {
  test('a value the server would refuse is stopped before it is saved on the device', async () => {
    await expect(savePatient(undefined, { ...juan(), remarks: 'x'.repeat(2001) }, [])).rejects.toThrow('Remarks is missing, too long');
    await expect(savePatient(undefined, { ...juan(), lastName: '   ' }, [])).rejects.toThrow('Last name');
    expect(await db.patients.count()).toBe(0);
    expect(await db.audit_log.count()).toBe(0);
  });
});

describe('dental classification', () => {
  test('Adult by default; a chosen one is stored and synced; unknown values are refused', async () => {
    expect(emptyPatient().dentalClassification).toBe('permanent');
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

describe('backup', () => {
  test('exports every row of every table (deleted ones too) without sync bookkeeping', async () => {
    const data = buildDemoData();
    for (const t of SYNC_TABLES) await db.table(t).bulkPut(data[t].map((r) => ({ ...r, dirty: 1 })));
    const mine = await savePatient(undefined, juan(), [phone('0917 000 0001', true)]);
    await savePatient(mine, juan(), []); // drops the contact softly

    const b = await buildBackup(db, new Date('2026-11-11T08:00:00Z'));
    expect(b).toMatchObject({ format: BACKUP_FORMAT, version: 1, exportedAt: '2026-11-11T08:00:00.000Z' });
    for (const t of SYNC_TABLES) expect(b.tables[t]).toHaveLength(await db.table(t).count());
    expect(b.counts.patients).toBe(61);
    expect(b.tables.patient_contacts.find((c) => c.isDeleted)).toBeDefined(); // history kept
    expect(b.counts.patient_contacts).toBe(b.tables.patient_contacts.length - 1);
    expect(Object.values(b.tables).flat().some((r) => 'dirty' in r)).toBe(false);
    expect(JSON.parse(JSON.stringify(b))).toEqual(b); // plain JSON
    expect(b.tables.staff.length).toBeGreaterThan(0);
    for (const s of b.tables.staff) expect(Object.keys(s).filter((k) => k.startsWith('pin'))).toEqual([]); // names, never PIN hashes
    expect(backupFileName(new Date(2026, 10, 11, 9, 5))).toBe('magno-dental-backup-2026-11-11-0905.json');
  });

  test('restore onto an empty device brings everything back, ready to sync', async () => {
    const id = await savePatient(undefined, juan(), [phone('0917 000 0001', true)]);
    await createProcedure({ patientId: id, type: 'Filling', date: '2026-11-10', time: '09:00', costCents: 1000, remarks: '', teeth: [{ tooth: 16, condition: 'filled', remarks: '' }], payment: { amountCents: 500, method: 'cash', remarks: '' } });
    const text = JSON.stringify(await buildBackup());
    await Promise.all(SYNC_TABLES.map((t) => db.table(t).clear()));
    await asAdmin();

    const r = await restoreBackup(parseBackup(text));
    expect(r).toEqual({ added: 10, updated: 0, kept: 0 }); // patient, contact, procedure, payment, record, tooth + 4 audit entries; staff rows are never restored
    expect((await db.patients.get(id))?.firstName).toBe('Juan');
    expect((await db.tooth_entries.toArray()).map((e) => e.tooth)).toEqual([16]);
    for (const t of SYNC_TABLES) expect((await db.table(t).toArray()).every((row) => row.dirty === 1)).toBe(true);
    expect(await restoreBackup(parseBackup(text))).toEqual({ added: 0, updated: 0, kept: 10 }); // again: nothing changes
    expect((await db.staff.get('admin-1'))?.pinHash).toBe('aGFzaA=='); // the account here is untouched
  });

  test('restore never overwrites newer work: older copies update, newer ones are kept', async () => {
    const a = await savePatient(undefined, { ...juan(), firstName: 'Ana' }, []);
    const b = await savePatient(undefined, { ...juan(), firstName: 'Ben' }, []);
    const backup = parseBackup(JSON.stringify(await buildBackup()));
    backup.tables.patients.find((p) => p.id === a)!.updatedAt = '2999-01-01T00:00:00.000Z'; // backup newer for Ana
    backup.tables.patients.find((p) => p.id === a)!.occupation = 'Teacher';
    await savePatient(b, { ...juan(), firstName: 'Benjamin' }, []); // device newer for Ben
    expect(await restoreBackup(backup)).toEqual({ added: 0, updated: 1, kept: 3 }); // Ben and two audit entries
    expect((await db.patients.get(a))?.occupation).toBe('Teacher');
    expect((await db.patients.get(b))?.firstName).toBe('Benjamin');
  });

  test('refuses files that are not valid backups, with a message for the user', async () => {
    await savePatient(undefined, juan(), []);
    const good = await buildBackup();
    const bad = (patch: (b: typeof good) => void) => {
      const copy = structuredClone(good);
      patch(copy);
      return () => parseBackup(JSON.stringify(copy));
    };
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"format":"something-else"}')).toThrow('not a Magno Dental Clinic backup');
    expect(bad((b) => ((b as { version: number }).version = 2))).toThrow('newer version');
    expect(bad((b) => (b.tables.patients[0].birthDate = '17/05/1990'))).toThrow('patients, row 1): invalid birthDate');
    expect(bad((b) => delete b.tables.patients[0].lastName)).toThrow('missing lastName');
    expect(bad((b) => (b.tables.patients[0].updatedAt = 'yesterday'))).toThrow('invalid updatedAt');
    expect(await db.patients.count()).toBe(1); // nothing written
  });
});

describe('encrypted backups', () => {
  test('sealed with a passphrase: nothing readable in the file, opens only with the right passphrase', async () => {
    await savePatient(undefined, { ...juan(), occupation: 'Secret Agent' }, [phone('0917 123 4567', true)]);
    const backup = await buildBackup();
    const sealed = await encryptBackup(backup, 'correct horse battery', 100_000);
    const text = JSON.stringify(sealed);
    for (const secret of ['Juan', 'Dela Cruz', 'Secret Agent', '917']) expect(text).not.toContain(secret);
    expect(sealed).toMatchObject({ format: BACKUP_FORMAT, version: 1, exportedAt: backup.exportedAt, encrypted: { cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA-256' } });

    const envelope = encryptedEnvelope(text)!;
    expect(envelope).not.toBeNull();
    expect(encryptedEnvelope(JSON.stringify(backup))).toBeNull(); // a plain backup is not an envelope
    await expect(decryptBackup(envelope, 'wrong passphrase')).rejects.toThrow('Wrong passphrase');
    expect(await decryptBackup(envelope, 'correct horse battery')).toEqual(backup);

    // any change to the sealed data is detected
    const tampered = structuredClone(envelope);
    tampered.encrypted.data = (tampered.encrypted.data[0] === 'A' ? 'B' : 'A') + tampered.encrypted.data.slice(1);
    await expect(decryptBackup(tampered, 'correct horse battery')).rejects.toThrow(BackupError);
  });

  test('short passphrases and unknown encryption are refused', async () => {
    await expect(encryptBackup(await buildBackup(), 'short')).rejects.toThrow('at least 8');
    const odd = JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: '', encrypted: { cipher: 'ROT13', kdf: 'none', iterations: 1, salt: '', iv: '', data: '' } });
    expect(() => encryptedEnvelope(odd)).toThrow('encryption this version');
  });
});
