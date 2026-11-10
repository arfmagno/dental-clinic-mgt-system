import type { SqlDriver, SqlExecutor } from './infra/db/driver.js';
import type { Migration, MigrationContext } from './migrations/types.js';
import { LEGACY_VERSIONS, loadMigrations } from './migrations/index.js';
import { SyncRepository } from './repositories/syncRepository.js';

const ident = /^[A-Za-z_][A-Za-z0-9_]*$/;

function makeContext(db: SqlExecutor): MigrationContext {
  const repo = new SyncRepository(db);
  return {
    db,
    async backfill(table, set, where, params = []) {
      if (!ident.test(table)) throw new Error(`Bad table name: ${table}`);
      const rows = await db.all<Record<string, any>>(`SELECT * FROM ${table}${where ? ` WHERE ${where}` : ''}`, params as any[]);
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
  /** Defaults to every file in src/migrations. */
  migrations?: Migration[];
  /** Where to snapshot an existing database before changing it. Omit to skip backups. */
  backupDir?: string;
  log?: (msg: string) => void;
}

/**
 * Bookkeeping table: one row per applied migration, keyed by version. Databases from before the
 * timestamped names have `_migrations(id INTEGER)`; convert that once, mapping the old ids.
 */
async function ensureBookkeeping(driver: SqlDriver): Promise<void> {
  // Probe with plain SELECTs (portable; no SQLite pragmas).
  const works = (sql: string) => driver.all(sql).then(() => true, () => false);
  if (await works('SELECT version FROM _migrations LIMIT 1')) return;
  if (await works('SELECT id FROM _migrations LIMIT 1')) {
    await driver.transaction(async (tx) => {
      const old = await tx.all<{ id: number; name: string; appliedAt: string }>('SELECT id, name, appliedAt FROM _migrations');
      await tx.exec('CREATE TABLE _migrations_v2 (version TEXT PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL)');
      for (const r of old) {
        const version = LEGACY_VERSIONS[r.id];
        if (!version) throw new Error(`Unknown legacy migration id ${r.id}`);
        await tx.run('INSERT INTO _migrations_v2 (version, name, appliedAt) VALUES (?, ?, ?)', [version, r.name, r.appliedAt]);
      }
      await tx.exec('DROP TABLE _migrations; ALTER TABLE _migrations_v2 RENAME TO _migrations;');
    });
  } else {
    await driver.exec('CREATE TABLE _migrations (version TEXT PRIMARY KEY, name TEXT NOT NULL, appliedAt TEXT NOT NULL)');
  }
}

/**
 * Applies pending migrations in version order. Each runs in its own transaction together with its
 * bookkeeping row, so a failure leaves the database exactly as it was. Returns applied versions.
 */
export async function migrate(driver: SqlDriver, opts: MigrateOptions = {}): Promise<string[]> {
  const list = [...(opts.migrations ?? (await loadMigrations()))].sort((a, b) => a.version.localeCompare(b.version));
  const log = opts.log ?? (() => {});
  const seen = new Set<string>();
  for (const m of list) {
    if (!/^\d{14}$/.test(m.version)) throw new Error(`Bad migration version ${m.version}`);
    if (seen.has(m.version)) throw new Error(`Duplicate migration version ${m.version}`);
    seen.add(m.version);
  }

  await ensureBookkeeping(driver);
  const applied = new Set((await driver.all<{ version: string }>('SELECT version FROM _migrations')).map((r) => r.version));
  const pending = list.filter((m) => !applied.has(m.version));
  if (!pending.length) return [];

  // An applied migration that is newer than a pending one means history was rewritten or branches
  // were merged out of order. Refuse rather than guess.
  const newestApplied = [...applied].sort().at(-1);
  if (newestApplied && pending[0].version < newestApplied) {
    throw new Error(`Migration ${pending[0].version} is older than already-applied ${newestApplied}. Give it a newer timestamp.`);
  }

  // Snapshot only when there is existing data to protect (not on first run).
  if (applied.size > 0 && opts.backupDir) {
    const dest = await driver.backup(opts.backupDir, `pre-migration-${pending[0].version}`);
    if (dest) log(`backup written: ${dest}`);
  }

  const done: string[] = [];
  await driver.withForeignKeysSuspended(async (conn) => {
    for (const m of pending) {
      await conn.transaction(async (tx) => {
        await m.up(makeContext(tx));
        const violations = await driver.foreignKeyViolations(tx);
        if (violations.length) {
          throw new Error(`Migration ${m.version} (${m.name}) left foreign key violations: ${violations.slice(0, 3).join('; ')}`);
        }
        await tx.run('INSERT INTO _migrations (version, name, appliedAt) VALUES (?, ?, ?)', [m.version, m.name, new Date().toISOString()]);
      });
      log(`applied migration ${m.version}: ${m.name}`);
      done.push(m.version);
    }
  });
  return done;
}
