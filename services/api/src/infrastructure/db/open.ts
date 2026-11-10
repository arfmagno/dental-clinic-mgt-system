import type { SqlDriver } from './driver.js';
import { SqliteDriver } from './sqlite.js';

/**
 * Picks the adapter from DATABASE_URL. To move to Postgres later: add infrastructure/db/postgres.ts
 * implementing SqlDriver, add one branch here, and run the same migrations. Nothing else changes.
 */
export function openDriver(url: string): SqlDriver {
  if (url.startsWith('sqlite:')) {
    const target = url.slice('sqlite:'.length);
    return SqliteDriver.open(target === ':memory:' || target === '' ? ':memory:' : target);
  }
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    throw new Error('Postgres adapter not implemented yet. See docs/ARCHITECTURE.md ("Moving to Postgres").');
  }
  throw new Error(`Unsupported DATABASE_URL scheme: ${url.split(':')[0]}`);
}
