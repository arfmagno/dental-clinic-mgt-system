import { beforeEach, describe, expect, test } from 'vitest';
import { SYNC_TABLES, validateColumns } from '@clinic/shared';
import { PATIENT_ACTOR, setActor } from '../data/actor';
import { db } from '../data/db';
import { buildBackup, downloadBackup, parseBackup, restoreBackup } from './backupService';
import { deletePatient, emptyPatient, savePatient } from './patientService';
import { pinMatches, verifyStaffPin } from './pinService';
import { addPayment, createProcedure } from './procedureService';
import { activeStaff, addStaff, createFirstAdmin, deactivateStaff, PermissionError, recoverPin, setStaffPin, updateStaff } from './staffService';

beforeEach(async () => {
  await Promise.all([...SYNC_TABLES.map((t) => db.table(t).clear()), db.meta.clear()]);
  setActor(null);
  localStorage.clear();
});

const juan = () => ({ ...emptyPatient(), firstName: 'Juan', lastName: 'Dela Cruz', birthDate: '1990-05-01' });

/** The first admin plus a front-desk account, with the admin signed in. */
async function clinic() {
  const admin = await createFirstAdmin('Dr. Ana Reyes', '1234');
  setActor(admin);
  const desk = await addStaff({ name: 'Bea Cruz', role: 'staff', pin: '5678' });
  return { admin, desk };
}

describe('staff accounts', () => {
  test('the first account is an admin; PINs are stored only as salted hashes, and a second "first admin" is refused', async () => {
    const id = await createFirstAdmin('  Dr.  Ana Reyes ', '1234');
    const s = (await db.staff.get(id))!;
    expect(s).toMatchObject({ name: 'Dr. Ana Reyes', role: 'admin', dirty: 1 });
    expect(JSON.stringify(s)).not.toContain('1234');
    expect(await pinMatches('1234', s)).toBe(true);
    expect(await pinMatches('4321', s)).toBe(false);
    expect(validateColumns('staff', s as never)).toBeNull(); // syncs as a valid row
    await expect(createFirstAdmin('Someone Else', '9999')).rejects.toThrow(PermissionError);
  });

  test('admins add, rename and re-role staff; names are unique; staff members cannot manage accounts', async () => {
    const { desk } = await clinic();
    await expect(addStaff({ name: 'bea cruz', role: 'staff', pin: '1111' })).rejects.toThrow('already an account');
    await updateStaff(desk, { name: 'Bea C. Cruz' });
    expect((await db.staff.get(desk))?.name).toBe('Bea C. Cruz');

    setActor(desk);
    await expect(addStaff({ name: 'New Person', role: 'staff', pin: '1111' })).rejects.toThrow(PermissionError);
    await expect(updateStaff(desk, { role: 'admin' })).rejects.toThrow(PermissionError);
  });

  test('the clinic always keeps an admin; nobody deactivates themself', async () => {
    const { admin, desk } = await clinic();
    await expect(updateStaff(admin, { role: 'staff' })).rejects.toThrow('at least one admin');
    await expect(deactivateStaff(admin)).rejects.toThrow('your own account');
    await deactivateStaff(desk);
    expect((await activeStaff()).map((s) => s.name)).toEqual(['Dr. Ana Reyes']);
  });

  test('everyone changes their own PIN; only an admin changes someone else\'s; recovery clears the wait', async () => {
    const { admin, desk } = await clinic();
    setActor(desk);
    await setStaffPin(desk, '2468');
    await expect(setStaffPin(admin, '0000')).rejects.toThrow(PermissionError);
    expect(await pinMatches('2468', (await db.staff.get(desk))!)).toBe(true);

    for (let i = 0; i < 5; i++) await verifyStaffPin(admin, '0000', (await db.staff.get(admin))!);
    expect(await verifyStaffPin(admin, '1234', (await db.staff.get(admin))!)).toMatchObject({ ok: false, waitSeconds: 30 });
    setActor(null);
    await recoverPin(admin, '1357');
    expect(await verifyStaffPin(admin, '1357', (await db.staff.get(admin))!)).toEqual({ ok: true });
  });

  test('deleting patients, exporting and restoring backups are admin only', async () => {
    const { desk } = await clinic();
    const p = await savePatient(undefined, juan(), []);
    const backup = parseBackup(JSON.stringify(await buildBackup()));
    setActor(desk);
    await expect(deletePatient(p)).rejects.toThrow(PermissionError);
    await expect(restoreBackup(backup)).rejects.toThrow(PermissionError);
    await expect(downloadBackup('a long passphrase')).rejects.toThrow(PermissionError);
  });
});

describe('audit trail', () => {
  test('every change records who made it, in the same write, ready to sync', async () => {
    const { admin, desk } = await clinic();
    setActor(desk);
    const p = await savePatient(undefined, juan(), []);
    const proc = await createProcedure({ patientId: p, type: 'Cleaning', date: '2026-11-10', time: '09:00', costCents: 1000, remarks: '', teeth: [], payment: null });
    await addPayment(proc, { amountCents: 500, method: 'cash', paidAt: '2026-11-10T10:00', remarks: '' });
    setActor(admin);
    await deletePatient(p);

    const log = (await db.audit_log.orderBy('createdAt').toArray()).filter((e) => e.entity !== 'staff');
    // entries written in the same millisecond have no fixed order
    const who = log.map((e) => [e.entity, e.action, e.actor === desk ? 'desk' : e.actor === admin ? 'admin' : e.actor]);
    expect(who).toHaveLength(5);
    expect(who).toEqual(
      expect.arrayContaining([
        ['patients', 'added', 'desk'],
        ['procedures', 'added', 'desk'],
        ['dental_records', 'added', 'desk'], // the procedure's chart record
        ['payments', 'added', 'desk'],
        ['patients', 'removed', 'admin'],
      ]),
    );
    expect(log.every((e) => e.patientId === p && e.dirty === 1 && validateColumns('audit_log', e as never) === null)).toBe(true);
  });

  test('staff changes are audited too, and self-registration is attributed to the patient', async () => {
    const { admin, desk } = await clinic();
    const staffLog = await db.audit_log.where('entityId').anyOf([admin, desk]).toArray();
    expect(staffLog.map((e) => [e.entityId === admin ? 'admin' : 'desk', e.actor === admin])).toEqual(expect.arrayContaining([['admin', true], ['desk', true]]));

    setActor(PATIENT_ACTOR);
    const p = await savePatient(undefined, juan(), []);
    expect((await db.audit_log.where('entityId').equals(p).first())?.actor).toBe('patient');
  });
});
