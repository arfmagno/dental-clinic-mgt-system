import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { SqlDriver, SqlExecutor, SqlParam } from './driver.js';

const norm = (params: SqlParam[] = []) =>
  params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

/** Serialises access so an open transaction is never interleaved with another request's statements. */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/** Unlocked connection view; only used while the mutex is held. */
class Conn implements SqlExecutor {
  private sp = 0;
  constructor(readonly db: Database.Database) {}
  async exec(sql: string) {
    this.db.exec(sql);
  }
  async all<T>(sql: string, params?: SqlParam[]) {
    return this.db.prepare(sql).all(...norm(params)) as T[];
  }
  async get<T>(sql: string, params?: SqlParam[]) {
    return this.db.prepare(sql).get(...norm(params)) as T | undefined;
  }
  async run(sql: string, params?: SqlParam[]) {
    return { changes: this.db.prepare(sql).run(...norm(params)).changes };
  }
  // SAVEPOINT works as BEGIN when no transaction is open, and nests naturally.
  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const name = `sp_${++this.sp}`;
    this.db.exec(`SAVEPOINT ${name}`);
    try {
      const out = await fn(this);
      this.db.exec(`RELEASE ${name}`);
      return out;
    } catch (err) {
      this.db.exec(`ROLLBACK TO ${name}`);
      this.db.exec(`RELEASE ${name}`);
      throw err;
    }
  }
}

export class SqliteDriver implements SqlDriver {
  readonly dialect = 'sqlite' as const;
  private mutex = new Mutex();
  private conn: Conn;

  constructor(private db: Database.Database) {
    this.conn = new Conn(db);
  }

  static open(file: string): SqliteDriver {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    const db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return new SqliteDriver(db);
  }

  exec(sql: string) {
    return this.mutex.run(() => this.conn.exec(sql));
  }
  all<T>(sql: string, params?: SqlParam[]) {
    return this.mutex.run(() => this.conn.all<T>(sql, params));
  }
  get<T>(sql: string, params?: SqlParam[]) {
    return this.mutex.run(() => this.conn.get<T>(sql, params));
  }
  run(sql: string, params?: SqlParam[]) {
    return this.mutex.run(() => this.conn.run(sql, params));
  }
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>) {
    return this.mutex.run(() => this.conn.transaction(fn));
  }

  backup(dir: string, label: string) {
    return this.mutex.run(async () => {
      if (this.db.name === ':memory:' || !this.db.name) return null;
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dest = path.resolve(dir, `${label}-${stamp}.db`);
      this.db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
      return dest;
    });
  }

  withForeignKeysSuspended<T>(fn: (db: SqlExecutor) => Promise<T>) {
    return this.mutex.run(async () => {
      this.db.pragma('foreign_keys = OFF');
      try {
        return await fn(this.conn);
      } finally {
        this.db.pragma('foreign_keys = ON');
      }
    });
  }

  async foreignKeyViolations(db?: SqlExecutor) {
    const rows = db
      ? await db.all<{ table: string; rowid: number; parent: string }>('PRAGMA foreign_key_check')
      : await this.all<{ table: string; rowid: number; parent: string }>('PRAGMA foreign_key_check');
    return rows.map((r) => `${r.table}#${r.rowid} -> ${r.parent}`);
  }

  async close() {
    await this.mutex.run(async () => this.db.close());
  }
}
