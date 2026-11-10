import { SYNC_TABLES, type AnyRow, type PullResponse, type PushResponse, type SyncTable } from '@clinic/shared';
import { db } from '../data/db';
import { toWire } from '../data/repository';
import { api } from './api';

export interface SyncOutcome {
  pushed: number;
  pulled: number;
  rejected: number;
}

const BATCH = 200;
const CURSOR_KEY = 'syncCursor';

// Dexie tables are keyed dynamically here because the sync protocol is table-agnostic.
const table = (name: SyncTable) => db.table(name);

export async function pendingCount(): Promise<number> {
  let n = 0;
  for (const t of SYNC_TABLES) n += await table(t).where('dirty').equals(1).count();
  return n;
}

/**
 * One reconciliation pass: push local changes, then pull everything newer than our cursor.
 * Conflicts are last-write-wins on `updatedAt`, decided by the server on push and here on pull.
 */
export async function syncOnce(token: string): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { pushed: 0, pulled: 0, rejected: 0 };

  // ---- push (parents before children, in batches) ----
  const queue: { table: SyncTable; row: AnyRow & { dirty?: unknown } }[] = [];
  for (const t of SYNC_TABLES) for (const row of await table(t).where('dirty').equals(1).toArray()) queue.push({ table: t, row });

  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH);
    const changes: Partial<Record<SyncTable, AnyRow[]>> = {};
    for (const { table: t, row } of batch) (changes[t] ??= []).push(toWire(row) as AnyRow);

    const res = await api<PushResponse>('/sync/push', { method: 'POST', body: { changes }, token });
    outcome.rejected += res.rejected.length;

    await db.transaction('rw', db.tables, async () => {
      for (const { table: t, row } of batch) {
        const settled = res.accepted[t]?.includes(row.id) || res.stale[t]?.includes(row.id);
        if (!settled) continue; // rejected rows stay dirty and are retried next pass
        const current = await table(t).get(row.id);
        // Only clear the flag if the user hasn't edited the row again while we were pushing.
        if (current && current.updatedAt === row.updatedAt) await table(t).update(row.id, { dirty: 0 });
        if (res.accepted[t]?.includes(row.id)) outcome.pushed++;
      }
    });
  }

  // ---- pull ----
  let cursor = ((await db.meta.get(CURSOR_KEY))?.value as number | undefined) ?? 0;
  for (;;) {
    const page = await api<PullResponse>(`/sync/pull?since=${cursor}&limit=500`, { token });
    await db.transaction('rw', db.tables, async () => {
      for (const { table: t, row } of page.rows) {
        const local = await table(t).get(row.id);
        // Remote wins only if strictly newer; ties keep the local copy (it is the same data).
        if (!local || row.updatedAt > local.updatedAt) {
          await table(t).put({ ...row, dirty: 0 });
          outcome.pulled++;
        }
      }
      await db.meta.put({ key: CURSOR_KEY, value: page.cursor });
    });
    cursor = page.cursor;
    if (!page.hasMore) break;
  }
  return outcome;
}
