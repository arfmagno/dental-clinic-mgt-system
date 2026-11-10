/**
 * Database port. Repositories, services and migrations depend ONLY on this interface.
 *
 * Portability rules for any SQL written against it (so a Postgres adapter is a drop-in):
 *  - `?` placeholders (an adapter may rewrite to $1, $2...)
 *  - column types limited to TEXT / INTEGER; booleans are stored as 0/1
 *  - INSERT ... ON CONFLICT(...) DO UPDATE and RETURNING are allowed (both engines support them)
 *  - no engine-specific functions in repositories; engine-specific work lives in the adapter
 */
export type SqlParam = string | number | boolean | null | undefined;

export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  all<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T | undefined>;
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  /** Atomic unit of work. Nested calls become savepoints, so a failure can be isolated. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlDriver extends SqlExecutor {
  readonly dialect: 'sqlite' | 'postgres';
  /** Snapshot the database before risky work. Returns the location, or null if not applicable. */
  backup(dir: string, label: string): Promise<string | null>;
  /** Runs `fn` with foreign-key enforcement suspended (needed for table rebuilds). No-op where unneeded. */
  withForeignKeysSuspended<T>(fn: (db: SqlExecutor) => Promise<T>): Promise<T>;
  /** Human-readable foreign key violations (empty when consistent). */
  foreignKeyViolations(db?: SqlExecutor): Promise<string[]>;
  close(): Promise<void>;
}
