import type { Table } from 'dexie';
import type { BaseRow } from '@clinic/shared';
import type { Local } from './db';

/**
 * Generic row operations. They stamp the bookkeeping fields every row needs
 * (uuid, createdAt, updatedAt, isDeleted) and mark the row dirty for sync.
 * Business rules live in services/, not here.
 */
type Fields<T extends BaseRow> = Omit<T, keyof BaseRow>;

const nowIso = () => new Date().toISOString();

export function newId(): string {
  return crypto.randomUUID();
}

export async function createRow<T extends BaseRow>(table: Table<Local<T>, string>, fields: Fields<T>, id = newId()): Promise<Local<T>> {
  const now = nowIso();
  const row = { ...fields, id, createdAt: now, updatedAt: now, isDeleted: false, dirty: 1 } as unknown as Local<T>;
  await table.add(row);
  return row;
}

export async function updateRow<T extends BaseRow>(table: Table<Local<T>, string>, id: string, patch: Partial<Fields<T>>): Promise<void> {
  const n = await table.update(id, { ...patch, updatedAt: nowIso(), dirty: 1 } as never);
  if (!n) throw new Error(`Row ${id} not found`);
}

/** Soft delete: the row stays (so the deletion syncs and history is recoverable). */
export async function softDeleteRow<T extends BaseRow>(table: Table<Local<T>, string>, id: string): Promise<void> {
  await table.update(id, { isDeleted: true, updatedAt: nowIso(), dirty: 1 } as never);
}

/** Strips local-only fields before sending to the server. */
export function toWire<T extends { dirty?: unknown }>(row: T): Omit<T, 'dirty'> {
  const { dirty: _dirty, ...rest } = row;
  return rest;
}
