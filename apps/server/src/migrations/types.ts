import type { SqlExecutor } from '../infra/db/driver.js';

export interface MigrationContext {
  /** Transaction-scoped executor. Write portable SQL only (see infra/db/driver.ts). */
  db: SqlExecutor;
  /**
   * Update rows AND mark them as changed for sync (new serverSeq + updatedAt), so every
   * device pulls the backfilled data. Always use this (not a raw UPDATE) on synced tables.
   *
   *   await ctx.backfill('patients', { citizenship: 'Filipino' }, "citizenship = ''")
   *   await ctx.backfill('procedures', (row) => ({ remarks: row.remarks || 'n/a' }))
   */
  backfill(
    table: string,
    set: Record<string, unknown> | ((row: Record<string, any>) => Record<string, unknown>),
    where?: string,
  ): Promise<number>;
}

export interface Migration {
  /** Strictly increasing integer. Never renumber or edit a migration once it has shipped. */
  id: number;
  name: string;
  /** Runs inside one transaction: schema changes (CREATE/ALTER) and data backfills together. */
  up(ctx: MigrationContext): Promise<void>;
}
