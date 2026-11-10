import {
  SYNC_TABLES,
  type AnyRow,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type SyncTable,
} from '@clinic/shared';
import { acceptIncomingRow } from '../domain/syncRow.js';
import type { SqlDriver } from '../infrastructure/db/driver.js';
import { SyncRepository } from '../repositories/syncRepository.js';

const MAX_PULL_LIMIT = 1000;

/**
 * Sync use cases: push (row rules in domain/syncRow.ts, last-write-wins in the repository upsert)
 * and the paged change feed.
 * Knows nothing about HTTP; depends on the repository and the driver port only.
 */
export class SyncService {
  constructor(
    private db: SqlDriver,
    private now: () => Date = () => new Date(),
  ) {}

  async push(req: PushRequest): Promise<PushResponse> {
    const res: PushResponse = { accepted: {}, stale: {}, rejected: [] };
    // Parents before children so foreign keys hold within a single push.
    for (const table of SYNC_TABLES) {
      const rows = req.changes?.[table] ?? [];
      for (const raw of rows) {
        const id = typeof raw?.id === 'string' ? raw.id : '?';
        try {
          const row = acceptIncomingRow(table, raw, this.now());
          const applied = await this.db.transaction(async (tx) => {
            const repo = new SyncRepository(tx);
            return repo.upsertIfNewer(table, row, await repo.nextSeq());
          });
          (applied ? (res.accepted[table] ??= []) : (res.stale[table] ??= [])).push(row.id);
        } catch (err) {
          res.rejected.push({ table, id, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    return res;
  }

  async pull(since: number, limit = 500): Promise<PullResponse> {
    const n = Math.max(1, Math.min(limit, MAX_PULL_LIMIT));
    const repo = new SyncRepository(this.db);
    // Every table's first n changes past the cursor contain the global first n.
    const all: { table: SyncTable; row: AnyRow; seq: number }[] = [];
    for (const table of SYNC_TABLES) {
      for (const r of await repo.changedSince(table, since, n + 1)) all.push({ table, ...r });
    }
    all.sort((a, b) => a.seq - b.seq);
    const page = all.slice(0, n);
    return {
      rows: page.map(({ table, row }) => ({ table, row })),
      cursor: page.length ? page[page.length - 1].seq : since,
      hasMore: all.length > n,
    };
  }

}
