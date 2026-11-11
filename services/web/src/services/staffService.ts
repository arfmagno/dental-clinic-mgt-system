import { STAFF_ROLES, type Staff, type StaffRole } from '@clinic/shared';
import { getActor } from '../data/actor';
import { db, type Local } from '../data/db';
import { createRow, softDeleteRow, updateRow, writeTx } from '../data/repository';
import { clearFailures, hashPin } from './pinService';

/** The one account of an offline-only device (shared staff PIN); renamable once the device syncs. */
export const SHARED_ACCOUNT_NAME = 'Clinic staff';

/** Thrown when the signed-in person may not do something; the message is shown as is. */
export class PermissionError extends Error {}

const cleanName = (name: string) => {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) throw new Error('Enter a name');
  if (n.length > 80) throw new Error('Name is too long');
  return n;
};

/** Active accounts (deactivated ones are soft-deleted), admins first, then by name. */
export async function activeStaff(): Promise<Local<Staff>[]> {
  return (await db.staff.toArray())
    .filter((s) => !s.isDeleted)
    .sort((a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || a.name.localeCompare(b.name));
}

/** Accounts someone can actually sign in to (sample staff have no PIN). */
export const canSignIn = (s: Pick<Staff, 'pinHash' | 'isDeleted'>) => !s.isDeleted && s.pinHash !== '';

export async function currentStaff(): Promise<Local<Staff> | undefined> {
  const id = getActor();
  const s = id ? await db.staff.get(id) : undefined;
  return s && !s.isDeleted ? s : undefined;
}

export async function requireAdmin(): Promise<Local<Staff>> {
  const me = await currentStaff();
  if (me?.role !== 'admin') throw new PermissionError('Only an admin can do this.');
  return me;
}

async function adminsWithPin(): Promise<Local<Staff>[]> {
  return (await activeStaff()).filter((s) => s.role === 'admin' && canSignIn(s));
}

/** First launch on a new clinic: the first account is an admin. Refused once anyone can sign in. */
export async function createFirstAdmin(name: string, pin: string): Promise<string> {
  const hash = await hashPin(pin);
  return writeTx(db.staff, async () => {
    if ((await activeStaff()).some(canSignIn)) throw new PermissionError('This clinic already has staff accounts. Sign in instead.');
    return (await createRow(db.staff, { name: cleanName(name), role: 'admin', ...hash })).id;
  });
}

export async function addStaff(input: { name: string; role: StaffRole; pin: string }): Promise<string> {
  if (!STAFF_ROLES.includes(input.role)) throw new Error('Choose a role');
  const hash = await hashPin(input.pin);
  await requireAdmin();
  const name = cleanName(input.name);
  return writeTx(db.staff, async () => {
    if ((await activeStaff()).some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new Error(`There is already an account named ${name}`);
    return (await createRow(db.staff, { name, role: input.role, ...hash })).id;
  });
}

export async function updateStaff(id: string, patch: { name?: string; role?: StaffRole }): Promise<void> {
  await requireAdmin();
  await writeTx(db.staff, async () => {
    const s = await db.staff.get(id);
    if (!s || s.isDeleted) throw new Error('Account not found');
    if (patch.role && !STAFF_ROLES.includes(patch.role)) throw new Error('Choose a role');
    if (patch.role === 'staff' && s.role === 'admin' && (await adminsWithPin()).length <= 1) throw new PermissionError('The clinic needs at least one admin.');
    await updateRow(db.staff, id, { ...(patch.name !== undefined && { name: cleanName(patch.name) }), ...(patch.role && { role: patch.role }) });
  });
}

/** An admin sets anyone's PIN; everyone can change their own. */
export async function setStaffPin(id: string, pin: string): Promise<void> {
  const me = await currentStaff();
  if (me?.id !== id && me?.role !== 'admin') throw new PermissionError('Only an admin can change someone else\'s PIN.');
  const hash = await hashPin(pin);
  await writeTx(db.staff, () => updateRow(db.staff, id, hash));
  clearFailures(id);
}

export async function deactivateStaff(id: string): Promise<void> {
  const me = await requireAdmin();
  if (me.id === id) throw new PermissionError('You cannot deactivate your own account.');
  await writeTx(db.staff, async () => {
    const s = await db.staff.get(id);
    if (!s || s.isDeleted) throw new Error('Account not found');
    if (s.role === 'admin' && (await adminsWithPin()).length <= 1) throw new PermissionError('The clinic needs at least one admin.');
    await softDeleteRow(db.staff, id);
  });
}

/**
 * Forgot PIN, proven with the clinic server password (checked by the caller): sets a new PIN for
 * one account without anyone signed in.
 */
export async function recoverPin(id: string, pin: string): Promise<void> {
  const hash = await hashPin(pin);
  await writeTx(db.staff, async () => {
    const s = await db.staff.get(id);
    if (!s || s.isDeleted) throw new Error('Account not found');
    await updateRow(db.staff, id, hash);
  });
  clearFailures(id);
}
