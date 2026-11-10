import { BASE_COLUMNS, BOOLEAN_COLUMNS, TABLE_COLUMNS, type AnyRow, type SyncTable } from '@clinic/shared';
import type { SqlExecutor, SqlParam } from '../infrastructure/db/driver.js';

/**
 * Data access for synced tables. Pure SQL, no business rules (those live in services/).
 * Table and column names come from the shared whitelist, never from request input.
 */
export class SyncRepository {
  constructor(private db: SqlExecutor) {}

  /** Next value of the global change counter (the sync cursor). Gaps are harmless. */
  async nextSeq(): Promise<number> {
    const row = await this.db.get<{ value: number }>(
      "UPDATE sync_meta SET value = value + 1 WHERE key = 'seq' RETURNING value",
    );
    if (!row) throw new Error('sync_meta not initialised (migrations not applied?)');
    return row.value;
  }

  /**
   * Insert, or update only if the incoming row is at least as new (last-write-wins, decided
   * atomically in SQL). Only the columns present in `row` are written, so a client that predates
   * a newly added column can still push safely. Returns true when the row was applied.
   */
  async upsertIfNewer(table: SyncTable, row: AnyRow, serverSeq: number): Promise<boolean> {
    const cols = [...BASE_COLUMNS, ...TABLE_COLUMNS[table]].filter((c) => row[c] !== undefined);
    const values: SqlParam[] = cols.map((c) => row[c] as SqlParam);
    const insertCols = [...cols, 'serverSeq'];
    const updateCols = cols.filter((c) => c !== 'id' && c !== 'createdAt');
    const set = [...updateCols, 'serverSeq'].map((c) => `${c} = excluded.${c}`).join(', ');
    const res = await this.db.run(
      `INSERT INTO ${table} (${insertCols.join(', ')}) VALUES (${insertCols.map(() => '?').join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${set} WHERE excluded.updatedAt >= ${table}.updatedAt`,
      [...values, serverSeq],
    );
    return res.changes > 0;
  }

  async changedSince(table: SyncTable, since: number, limit: number): Promise<{ row: AnyRow; seq: number }[]> {
    const rows = await this.db.all<Record<string, unknown>>(
      `SELECT * FROM ${table} WHERE serverSeq > ? ORDER BY serverSeq ASC LIMIT ?`,
      [since, limit],
    );
    return rows.map((r) => {
      const { serverSeq, ...rest } = r;
      for (const c of BOOLEAN_COLUMNS) if (c in rest) rest[c] = Boolean(rest[c]);
      return { row: rest as AnyRow, seq: serverSeq as number };
    });
  }

  async ping(): Promise<boolean> {
    return (await this.db.get('SELECT 1 AS ok')) !== undefined;
  }
}
