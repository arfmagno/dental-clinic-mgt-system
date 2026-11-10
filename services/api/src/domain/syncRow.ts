// Rules for a row arriving from a device. Pure: the clock is passed in.
import { BASE_COLUMNS, TABLE_COLUMNS, validateColumns, type AnyRow, type SyncTable } from '@clinic/shared';
import { ValidationError } from './errors.js';

/** A device clock further ahead than this is clamped, so one bad clock cannot win every conflict. */
export const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;

/**
 * Checks a pushed row and returns the row to store:
 *  - id, timestamps and isDeleted must be well formed
 *  - unknown columns are dropped (columns a device omits are left untouched by the upsert)
 *  - vocabularies, dates, money and tooth numbers must be valid (shared/validation.ts)
 *  - an updatedAt too far in the future is clamped to now + MAX_CLOCK_SKEW_MS
 * Throws ValidationError otherwise.
 */
export function acceptIncomingRow(table: SyncTable, raw: AnyRow, now: Date): AnyRow {
  if (!raw || typeof raw !== 'object') throw new ValidationError('row must be an object');
  if (typeof raw.id !== 'string' || !raw.id || raw.id.length > 64) throw new ValidationError('invalid id');
  for (const k of ['createdAt', 'updatedAt'] as const) {
    if (typeof raw[k] !== 'string' || Number.isNaN(Date.parse(raw[k]))) throw new ValidationError(`invalid ${k}`);
  }
  if (typeof raw.isDeleted !== 'boolean') throw new ValidationError('isDeleted must be boolean');

  const allowed = new Set<string>([...BASE_COLUMNS, ...TABLE_COLUMNS[table]]);
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (allowed.has(k) && v !== undefined) row[k] = v;

  const invalid = validateColumns(table, row);
  if (invalid) throw new ValidationError(invalid);

  const ceiling = now.getTime() + MAX_CLOCK_SKEW_MS;
  if (Date.parse(raw.updatedAt) > ceiling) row.updatedAt = new Date(ceiling).toISOString();
  return row as AnyRow;
}
