import { buildDemoData, SYNC_TABLES, type DemoOptions, type PushResponse } from '@clinic/shared';
import type { SqlDriver } from './infrastructure/db/driver.js';
import { SyncService, TRUSTED } from './services/syncService.js';

/**
 * Writes the shared sample data through the normal sync path (validation, last-write-wins,
 * change feed), so devices that sync afterwards receive it like any other change.
 */
export async function seedDemo(db: SqlDriver, opts: DemoOptions = {}): Promise<PushResponse> {
  const data = buildDemoData(opts);
  return new SyncService(db).push(TRUSTED, { changes: data });
}

/** Soft-deletes every sample row (same deterministic ids), so the deletion syncs to devices too. */
export async function unseedDemo(db: SqlDriver, opts: DemoOptions = {}): Promise<PushResponse> {
  const now = new Date().toISOString();
  const data = buildDemoData(opts);
  for (const t of SYNC_TABLES) data[t] = data[t].map((r) => ({ ...r, isDeleted: true, updatedAt: now }));
  return new SyncService(db).push(TRUSTED, { changes: data });
}
