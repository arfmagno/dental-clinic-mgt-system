import type { Table } from 'dexie';
import { AUDIT_ENTITIES, SYNC_TABLES, validateColumns, type AuditAction, type AuditEntity, type BaseRow, type SyncTable } from '@clinic/shared';
import { getActor } from './actor';
import { db, type Local } from './db';

/**
 * Generic row operations. They stamp the bookkeeping fields every row needs
 * (uuid, createdAt, updatedAt, isDeleted), mark the row dirty for sync, and append an audit entry
 * (who did what) for the audited tables. Business rules live in services/, not here.
 *
 * Writes to audited tables must run inside a transaction that includes `db.audit_log`; use
 * `writeTx` (it adds it). A write outside any transaction gets its own.
 */
type Fields<T extends BaseRow> = Omit<T, keyof BaseRow>;

const nowIso = () => new Date().toISOString();

export function newId(): string {
  return crypto.randomUUID();
}

const AUDITED = new Set<string>(AUDIT_ENTITIES);
const SYNCED = new Set<string>(SYNC_TABLES);

const FIELD_LABEL: Record<string, string> = {
  firstName: 'First name', middleName: 'Middle name', lastName: 'Last name', occupation: 'Occupation', addressLine1: 'Address',
  remarks: 'Remarks', photo: 'Photo', value: 'Contact', label: 'Contact label', type: 'Type', name: 'Name',
};

/**
 * The server's column rules (shared/validation.ts), applied before anything is saved: a value the
 * server would refuse is stopped here, in the form, instead of sitting on the device unsynced.
 */
export function assertValid(tableName: string, row: Record<string, unknown>) {
  if (!SYNCED.has(tableName)) return;
  const problem = validateColumns(tableName as SyncTable, row);
  if (!problem) return;
  const col = problem.replace(/^invalid /, '');
  throw new Error(`${FIELD_LABEL[col] ?? col} is missing, too long or contains characters that are not allowed.`);
}

/** The patient a row is about, for the audit entry (procedures and payments point to it indirectly). */
async function patientOf(entity: AuditEntity, row: Record<string, unknown>): Promise<string> {
  if (entity === 'patients') return row.id as string;
  if (entity === 'payments') return ((await db.procedures.get(row.procedureId as string))?.patientId as string | undefined) ?? '';
  return (row.patientId as string | undefined) ?? '';
}

async function audit(table: Table<unknown, string>, action: AuditAction, row: Record<string, unknown>, at: string) {
  if (!AUDITED.has(table.name)) return;
  const entity = table.name as AuditEntity;
  await db.audit_log.add({
    id: newId(),
    createdAt: at,
    updatedAt: at,
    isDeleted: false,
    // nobody signed in yet: the first admin creating their account, or a PIN recovered with the server password
    actor: getActor() || (entity === 'staff' ? (row.id as string) : ''),
    action,
    entity,
    entityId: row.id as string,
    patientId: await patientOf(entity, row),
    dirty: 1,
  });
}

/** A read-write transaction over `tables` plus the audit trail. */
export function writeTx<R>(tables: Table | Table[], fn: () => Promise<R>): Promise<R> {
  const list = Array.isArray(tables) ? tables : [tables];
  return db.transaction('rw', [...new Set([...list, db.audit_log, db.procedures])], fn);
}

export async function createRow<T extends BaseRow>(table: Table<Local<T>, string>, fields: Fields<T>, id = newId()): Promise<Local<T>> {
  const now = nowIso();
  const row = { ...fields, id, createdAt: now, updatedAt: now, isDeleted: false, dirty: 1 } as unknown as Local<T>;
  assertValid(table.name, row as never);
  await table.add(row);
  await audit(table as never, 'added', row as never, now);
  return row;
}

export async function updateRow<T extends BaseRow>(table: Table<Local<T>, string>, id: string, patch: Partial<Fields<T>>): Promise<void> {
  const now = nowIso();
  assertValid(table.name, patch as never);
  const n = await table.update(id, { ...patch, updatedAt: now, dirty: 1 } as never);
  if (!n) throw new Error(`Row ${id} not found`);
  if (AUDITED.has(table.name)) await audit(table as never, 'updated', (await table.get(id)) as never, now);
}

/** Soft delete: the row stays (so the deletion syncs and history is recoverable). */
export async function softDeleteRow<T extends BaseRow>(table: Table<Local<T>, string>, id: string): Promise<void> {
  const now = nowIso();
  const n = await table.update(id, { isDeleted: true, updatedAt: now, dirty: 1 } as never);
  if (n && AUDITED.has(table.name)) await audit(table as never, 'removed', (await table.get(id)) as never, now);
}

/** Strips local-only fields before sending to the server. */
export function toWire<T extends { dirty?: unknown }>(row: T): Omit<T, 'dirty'> {
  const { dirty: _dirty, ...rest } = row;
  return rest;
}
