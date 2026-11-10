import type { SqlExecutor } from '../infra/db/driver.js';

export interface MigrationContext {
  /** Transaction-scoped executor. Write portable SQL only (see infra/db/driver.ts). */
  db: SqlExecutor;
  /**
   * Update rows AND mark them as changed for sync (new serverSeq + updatedAt), so every
   * device pulls the backfilled data. Always use this (not a raw UPDATE) on synced tables.
   *
   *   await ctx.backfill('patients', { occupation: 'n/a' }, "occupation = ''")
   *   await ctx.backfill('procedures', (row) => ({ remarks: row.remarks || 'n/a' }))
   */
  backfill(
    table: string,
    set: Record<string, unknown> | ((row: Record<string, any>) => Record<string, unknown>),
    where?: string,
    params?: unknown[],
  ): Promise<number>;
  /** Insert a new synced row (assigns serverSeq so devices pull it). Keys are column names. */
  insert(table: string, row: Record<string, unknown>): Promise<void>;
}

export interface Migration {
  /** UTC timestamp `YYYYMMDDHHmmss` taken from the file name. Orders migrations; never change it. */
  version: string;
  /** Human-readable, from the kebab-case part of the file name. */
  name: string;
  /** File it was loaded from (absent for migrations built in code, e.g. in tests). */
  file?: string;
  /** Runs inside one transaction together with its bookkeeping row. */
  up(ctx: MigrationContext): Promise<void>;
}

/** Shape of a `.ts` migration module. */
export interface MigrationModule {
  up(ctx: MigrationContext): Promise<void>;
}
