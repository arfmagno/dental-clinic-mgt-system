import type { SqlDriver, SqlExecutor } from './infra/db/driver.js';
import type { Migration, MigrationContext } from './migrations/types.js';
import { migrations as allMigrations } from './migrations/index.js';
import { SyncRepository } from './repositories/syncRepository.js';

const ident = /^[A-Za-z_][A-Za-z0-9_]*$/;

function makeContext(db: SqlExecutor): MigrationContext {
  const repo = new SyncRepository(db);
  return {
    db,
    async backfill(table, set, where) {
      if (!ident.test(table)) throw new Error(`Bad table name: ${table}`);
      const rows = await db.all<Record<string, any>>(`SELECT * FROM ${table}${where ? ` WHERE ${where}` : ''}`);
      for (const row of rows) {
        const values = typeof set === 'function' ? set(row) : set;
        const cols = Object.keys(values);
        for (const c of cols) if (!ident.test(c)) throw new Error(`Bad column name: ${c}`);
        const seq = await repo.nextSeq();
        const assignments = [...cols.map((c) => `${c} = ?`), 'updatedAt = ?', 'serverSeq = ?'].join(', ');
        await db.run(`UPDATE ${table} SET ${assignments} WHERE id = ?`, [
          ...cols.map((c) => values[c] as any),
          new Date().toISOString(),
          seq,
          row.id,
        ]);
      }
      return rows.length;
    },
    async insert(table, row) {
      if (!ident.test(table)) throw new Error(`Bad table name: ${table}`);
      const cols = Object.keys(row);
      for (const c of cols) if (!ident.test(c)) throw new Error(`Bad column name: ${c}`);
      const seq = await repo.nextSeq();
      await db.run(
        `INSERT INTO ${table} (${[...cols, 'serverSeq'].join(', ')}) VALUES (${[...cols, 'serverSeq'].map(() => '?').join(', ')})`,
        [...cols.map((c) => row[c] as any), seq],
      );
    },
  };
}

export interface MigrateOptions {
  migrations?: Migration[];
  /** Where to snapshot an existing database before changing it. Omit to skip backups. */
  backupDir?: string;
  log?: (msg: string) => void;
}

/**
 * Applies pending migrations in id order. Each runs in its own transaction together with its
 * bookkeeping row, so a failure leaves the database exactly as it was.
 */
export async function migrate(driver: SqlDriver, opts: MigrateOptions = {}): Promise<number[]> {
  const list = [...(opts.migrations ?? allMigrations)].sort((a, b) => a.id - b.id);
  const log = opts.log ?? (() => {});
  const seen = new Set<number>();
  for (const m of list) {
    if (seen.has(m.id)) throw new Error(`Duplicate migration id ${m.id}`);
    seen.add(m.id);
  }

  await driver.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL)',
  );
  const applied = new Set((await driver.all<{ id: number }>('SELECT id FROM _migrations')).map((r) => r.id));
  const pending = list.filter((m) => !applied.has(m.id));
  if (!pending.length) return [];

  // Snapshot only when there is existing data to protect (not on first run).
  if (applied.size > 0 && opts.backupDir) {
    const dest = await driver.backup(opts.backupDir, `pre-migration-${pending[0].id}`);
    if (dest) log(`backup written: ${dest}`);
  }

  const done: number[] = [];
  await driver.withForeignKeysSuspended(async (conn) => {
    for (const m of pending) {
      await conn.transaction(async (tx) => {
        await m.up(makeContext(tx));
        const violations = await driver.foreignKeyViolations(tx);
        if (violations.length) {
          throw new Error(`Migration ${m.id} (${m.name}) left foreign key violations: ${violations.slice(0, 3).join('; ')}`);
        }
        await tx.run('INSERT INTO _migrations (id, name, appliedAt) VALUES (?, ?, ?)', [
          m.id,
          m.name,
          new Date().toISOString(),
        ]);
      });
      log(`applied migration ${m.id}: ${m.name}`);
      done.push(m.id);
    }
  });
  return done;
}
