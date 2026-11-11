import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { AnyRow } from '@clinic/shared';
import type { SqlDriver } from './infrastructure/db/driver.js';
import { SyncService, TRUSTED } from './services/syncService.js';

const pbkdf2 = promisify(crypto.pbkdf2);
/** Same work factor as the app (services/web/src/services/pinService.ts). */
export const PIN_ITERATIONS = 210_000;

/**
 * Server operator's way out when no admin can sign in: sets a new PIN on one active account
 * (found by id or exact name, case-insensitive). Written through the sync path, so every device
 * receives the new PIN on its next sync. The account's name and role are unchanged.
 */
export async function resetStaffPin(db: SqlDriver, who: string, pin: string, now = new Date()): Promise<{ id: string; name: string; role: string }> {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('The PIN must be 4 to 6 digits.');
  const matches = await db.all<AnyRow>(
    'SELECT * FROM staff WHERE isDeleted = 0 AND (id = ? OR lower(name) = lower(?))',
    [who, who.trim()],
  );
  if (matches.length === 0) throw new Error(`No active staff account named "${who}".`);
  if (matches.length > 1) throw new Error(`Several accounts are named "${who}"; use the account id instead: ${matches.map((m) => m.id).join(', ')}`);
  const staff = matches[0];
  const salt = crypto.randomBytes(16);
  const hash = await pbkdf2(pin, salt, PIN_ITERATIONS, 32, 'sha256');
  const updated = { ...staff, isDeleted: false, pinSalt: salt.toString('base64'), pinHash: hash.toString('base64'), pinIterations: PIN_ITERATIONS, updatedAt: now.toISOString() };
  delete (updated as Record<string, unknown>).serverSeq;
  const res = await new SyncService(db).push(TRUSTED, { changes: { staff: [updated] } });
  if (res.rejected.length) throw new Error(res.rejected[0].error);
  return { id: String(staff.id), name: String(staff.name), role: String(staff.role) };
}
