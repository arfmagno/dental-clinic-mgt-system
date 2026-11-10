import { buildDemoData, SYNC_TABLES, type AnyRow, type DemoOptions } from '@clinic/shared';
import { db as defaultDb, type ClinicDB } from '../data/db';

/**
 * Sample data for looking around the app. Rows are marked dirty so they sync like anything else
 * typed in, and they use fixed ids, so loading again refreshes them and "remove" finds them all.
 */
export async function loadDemoData(db: ClinicDB = defaultDb, opts: DemoOptions = {}): Promise<number> {
  const now = new Date().toISOString();
  const data = buildDemoData({ ...opts, now });
  await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
    for (const t of SYNC_TABLES) await db.table<AnyRow & { dirty: 0 | 1 }>(t).bulkPut(data[t].map((r) => ({ ...r, dirty: 1 as const })));
  });
  return data.patients.length;
}

/** Soft-deletes the sample rows (the deletion syncs, so other devices drop them too). */
export async function removeDemoData(db: ClinicDB = defaultDb, opts: DemoOptions = {}): Promise<number> {
  const now = new Date().toISOString();
  const data = buildDemoData(opts);
  let n = 0;
  await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
    for (const t of SYNC_TABLES) {
      n += await db.table(t).where('id').anyOf(data[t].map((r) => r.id)).modify({ isDeleted: true, updatedAt: now, dirty: 1 });
    }
  });
  return n;
}

/** Shown in development builds, or in any build opened with ?demo in the address. */
export function demoToolsEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).has('demo');
  } catch {
    return false;
  }
}
